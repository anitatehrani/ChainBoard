'use strict';

// Small statistics helpers for the benchmark (pure, tested).

function percentile(sorted, p) {
    if (!sorted.length) return null;
    const rank = Math.ceil((p / 100) * sorted.length) - 1; // nearest-rank method
    return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

// samples: milliseconds. Returns null for an empty set.
function summarize(samples) {
    if (!samples.length) return null;
    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
        count: sorted.length,
        min: sorted[0],
        mean: sum / sorted.length,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        max: sorted[sorted.length - 1]
    };
}

const round = (n, d = 1) => (n === null || n === undefined ? null : Math.round(n * 10 ** d) / 10 ** d);

// Runs `total` jobs with at most `concurrency` in flight. job(i) resolves to anything;
// rejections are counted, not thrown. Returns { wallMs, results: [{ ok, ms, value|error }] }.
async function runPool(total, concurrency, job, now = () => performance.now()) {
    const results = new Array(total);
    let next = 0;
    const started = now();
    async function worker() {
        while (true) {
            const i = next++;
            if (i >= total) return;
            const t0 = now();
            try {
                const value = await job(i);
                results[i] = { ok: true, ms: now() - t0, value };
            } catch (error) {
                results[i] = { ok: false, ms: now() - t0, error };
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
    return { wallMs: now() - started, results };
}

module.exports = { percentile, summarize, round, runPool };
