'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { percentile, summarize, round, runPool } = require('../lib/stats');

test('percentile uses the nearest-rank method', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    assert.equal(percentile(s, 50), 5);
    assert.equal(percentile(s, 95), 10);
    assert.equal(percentile(s, 10), 1);
    assert.equal(percentile([], 50), null);
    assert.equal(percentile([7], 99), 7);
});

test('summarize', () => {
    assert.equal(summarize([]), null);
    const r = summarize([30, 10, 20, 40]);
    assert.equal(r.count, 4);
    assert.equal(r.min, 10);
    assert.equal(r.max, 40);
    assert.equal(r.mean, 25);
    assert.equal(r.p50, 20);
});

test('round', () => {
    assert.equal(round(1.234), 1.2);
    assert.equal(round(1.25, 2), 1.25);
    assert.equal(round(null), null);
});

test('runPool respects the concurrency limit and records failures instead of throwing', async () => {
    let inFlight = 0;
    let peak = 0;
    const { results, wallMs } = await runPool(20, 4, async (i) => {
        inFlight++; peak = Math.max(peak, inFlight);
        await new Promise(r => setTimeout(r, 5));
        inFlight--;
        if (i % 5 === 0) throw new Error('boom');
        return i;
    });
    assert.equal(results.length, 20);
    assert.ok(peak <= 4 && peak > 1, `peak was ${peak}`);
    assert.equal(results.filter(r => !r.ok).length, 4);
    assert.equal(results[3].value, 3);
    assert.ok(wallMs > 0);
});

test('runPool with zero jobs', async () => {
    const { results } = await runPool(0, 4, async () => 1);
    assert.deepEqual(results, []);
});
