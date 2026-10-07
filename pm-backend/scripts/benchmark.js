#!/usr/bin/env node
'use strict';

// Measures how the REAL system performs: every request goes through the backend to the
// Fabric network, so writes are full transactions (endorse, order, validate, commit).
//
//   npm run benchmark                       # defaults
//   WRITES=100 READS=300 LEVELS=1,2,4,8 npm run benchmark
//   BASE_URL=http://localhost:3000 npm run benchmark
//
// Phases
//   1. write latency       sequential createTask, one at a time
//   2. write throughput    createTask with 1, 2, 4, 8 … concurrent requests (distinct keys)
//   3. contention          many concurrent edits of the SAME task: Fabric's
//                          MVCC check lets one win per block and rejects the rest (409)
//   4. read latency        GET a single task, GET all tasks of a project (range scan)
//
// Results are printed as a table and saved to benchmark-results.json and .csv in this
// folder's parent (pm-backend/). Use them in the thesis evaluation chapter together with the
// machine description (docs/EVALUATION.md explains the method and its limits).
// It creates its own throw-away account and project ("bench-…"), never touching real data.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { summarize, round, runPool } = require('../lib/stats');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const WRITES = Number(process.env.WRITES) || 40;
const READS = Number(process.env.READS) || 200;
const CONTENDERS = Number(process.env.CONTENDERS) || 8;
const LEVELS = (process.env.LEVELS || '1,2,4,8').split(',').map(Number).filter(n => n > 0);
const PASSWORD = 'Bench!Mark#Run-2026';

const run = Date.now().toString(36);
let cookie = '';

async function call(method, urlPath, json) {
    const res = await fetch(`${BASE}/api${urlPath}`, {
        method,
        headers: { 'Content-Type': 'application/json', Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) },
        body: json === undefined ? undefined : JSON.stringify(json)
    });
    for (const c of (typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [])) {
        if (c.startsWith('sid=')) cookie = c.split(';')[0];
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
        const err = new Error((data && data.error) || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return data;
}

const rows = [];
function record(phase, detail, stats, extra = {}) {
    const row = { phase, detail, ...extra };
    if (stats) Object.assign(row, {
        n: stats.count, min_ms: round(stats.min), mean_ms: round(stats.mean), p50_ms: round(stats.p50),
        p95_ms: round(stats.p95), p99_ms: round(stats.p99), max_ms: round(stats.max)
    });
    rows.push(row);
    const parts = [`${phase.padEnd(18)}`, `${detail.padEnd(22)}`];
    if (stats) parts.push(`p50 ${String(row.p50_ms).padStart(7)} ms`, `p95 ${String(row.p95_ms).padStart(7)} ms`, `max ${String(row.max_ms).padStart(7)} ms`);
    if (extra.throughput_tps !== undefined) parts.push(`${extra.throughput_tps} tx/s`);
    if (extra.failed !== undefined) parts.push(`failed ${extra.failed}`);
    console.log(parts.join('  '));
}

async function main() {
    try { await call('GET', '/auth/config'); } catch {
        console.error(`Cannot reach the backend at ${BASE}. Start it first (cd pm-backend && npm run dev).`);
        process.exit(1);
    }

    console.log(`ChainBoard benchmark  ${new Date().toISOString()}`);
    console.log(`host ${os.hostname()} · ${os.cpus().length} CPUs · ${os.type()} ${os.release()} · node ${process.version}`);
    console.log(`writes ${WRITES} · reads ${READS} · concurrency levels ${LEVELS.join(',')} · contenders ${CONTENDERS}\n`);

    // throw-away account and project
    await call('POST', '/auth/signup', {
        name: 'Bench Runner', email: `bench.${run}@example.com`, username: `bench.${run}`, password: PASSWORD
    });
    const projectId = `bench-${run}`;
    await call('POST', '/projects', { projectId, name: 'Benchmark', description: 'Throw-away data created by scripts/benchmark.js' });
    const mk = (id) => call('POST', '/tasks', { taskId: id, projectId, title: id, description: 'bench', priority: 'low' });

    // 1. write latency (sequential)
    const seq = await runPool(WRITES, 1, i => mk(`${projectId}-seq-${i}`));
    const seqOk = seq.results.filter(r => r.ok);
    record('write latency', 'sequential, 1 at a time', summarize(seqOk.map(r => r.ms)), {
        throughput_tps: round(seqOk.length / (seq.wallMs / 1000), 2), failed: seq.results.length - seqOk.length
    });

    // 2. write throughput by concurrency
    for (const level of LEVELS) {
        const out = await runPool(WRITES, level, i => mk(`${projectId}-c${level}-${i}`));
        const ok = out.results.filter(r => r.ok);
        record('write throughput', `${level} concurrent`, summarize(ok.map(r => r.ms)), {
            concurrency: level, throughput_tps: round(ok.length / (out.wallMs / 1000), 2), failed: out.results.length - ok.length
        });
    }

    // 3. contention on a single key
    const hot = `${projectId}-hot`;
    await mk(hot);
    // every contender edits the title of the same task at the same moment (always a valid change)
    const wave = await runPool(CONTENDERS, CONTENDERS, i => call('PUT', `/tasks/${hot}/meta`, { field: 'title', value: `contender ${i}` }));
    const won = wave.results.filter(r => r.ok).length;
    const conflicts = wave.results.filter(r => !r.ok && r.error.status === 409).length;
    const otherErrors = wave.results.length - won - conflicts;
    record('contention', `${CONTENDERS} writers, same key`, summarize(wave.results.filter(r => r.ok).map(r => r.ms)), {
        committed: won, mvcc_conflicts: conflicts, other_errors: otherErrors, failed: conflicts + otherErrors
    });

    // 4. read latency
    const one = await runPool(READS, 4, () => call('GET', `/tasks/${projectId}-seq-0`));
    record('read latency', 'GET one task', summarize(one.results.filter(r => r.ok).map(r => r.ms)), {
        throughput_tps: round(one.results.filter(r => r.ok).length / (one.wallMs / 1000), 2), failed: one.results.filter(r => !r.ok).length
    });
    const all = await runPool(Math.max(10, Math.floor(READS / 10)), 2, () => call('GET', `/projects/${projectId}/tasks`));
    record('read latency', 'GET all project tasks', summarize(all.results.filter(r => r.ok).map(r => r.ms)), {
        failed: all.results.filter(r => !r.ok).length
    });

    // save
    const meta = {
        when: new Date().toISOString(), host: os.hostname(), cpus: os.cpus().length, cpuModel: os.cpus()[0] && os.cpus()[0].model,
        os: `${os.type()} ${os.release()}`, node: process.version, writes: WRITES, reads: READS, levels: LEVELS, contenders: CONTENDERS
    };
    const dir = path.join(__dirname, '..');
    fs.writeFileSync(path.join(dir, 'benchmark-results.json'), JSON.stringify({ meta, rows }, null, 2));
    const cols = ['phase', 'detail', 'concurrency', 'n', 'min_ms', 'mean_ms', 'p50_ms', 'p95_ms', 'p99_ms', 'max_ms', 'throughput_tps', 'committed', 'mvcc_conflicts', 'other_errors', 'failed'];
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => (r[c] === undefined ? '' : JSON.stringify(r[c]))).join(','))].join('\n');
    fs.writeFileSync(path.join(dir, 'benchmark-results.csv'), csv + '\n');
    console.log('\nSaved benchmark-results.json and benchmark-results.csv');
}

main().catch(err => { console.error('\nBenchmark stopped:', err.message); process.exit(1); });
