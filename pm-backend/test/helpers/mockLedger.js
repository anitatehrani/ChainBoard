'use strict';

// Runs the REAL chaincode (pm-chaincode/index.js) against an in-memory world
// state that behaves like Fabric where it matters for these tests:
//   - a transaction's writes are applied only if the chaincode returns success
//     (a rejected transaction leaves NO partial state, like a real invalid tx)
//   - evaluate() never commits anything (read-only query)
//   - key history is kept per key (getHistoryForKey), with tx ids + timestamps
//   - range scans are ordered by key

process.env.PM_CHAINCODE_NO_START = '1';

const path = require('node:path');
const Module = require('node:module');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function patched(request, ...rest) {
    if (request === 'fabric-shim') return path.join(__dirname, 'fakeShim.js');
    return originalResolve.call(this, request, ...rest);
};
const { PMChaincode } = require('../../../pm-chaincode/index.js');
Module._resolveFilename = originalResolve;

const { LedgerError, classify } = require('../../lib/ledger');

function iteratorOver(items) {
    let i = 0;
    return {
        async next() { return i < items.length ? { value: items[i++], done: false } : { value: undefined, done: true }; },
        async close() { /* nothing to release */ }
    };
}

class MockLedger {
    constructor({ clock = () => 1_760_000_000 } = {}) {
        this.world = new Map();    // key -> Buffer
        this.history = new Map();  // key -> [{ tx_id, value, timestamp, is_delete }]
        this.txCount = 0;
        this.clock = clock;        // seconds since epoch, controllable by tests
        this.cc = new PMChaincode();
    }

    _stubFor(fn, args, txId) {
        const ledger = this;
        const writes = new Map(); // key -> Buffer | null (delete)
        const read = (key) => (writes.has(key) ? writes.get(key) : ledger.world.get(key)) || null;
        const stub = {
            writes,
            getFunctionAndParameters: () => ({ fcn: fn, params: args }),
            getTxTimestamp: () => ({ seconds: { toString: () => String(ledger.clock()) }, nanos: 0 }),
            getTxID: () => txId,
            async getState(key) { return read(key) || Buffer.alloc(0); },
            async putState(key, value) { writes.set(key, Buffer.from(value)); },
            async deleteState(key) { writes.set(key, null); },
            async getStateByRange(start, end) {
                const keys = new Set([...ledger.world.keys(), ...writes.keys()]);
                const items = [...keys]
                    .filter(k => k >= start && (end === '' || k < end) && read(k))
                    .sort()
                    .map(k => ({ key: k, value: read(k) }));
                return iteratorOver(items);
            },
            async getHistoryForKey(key) {
                return iteratorOver((ledger.history.get(key) || []).map(h => ({ ...h })));
            }
        };
        return stub;
    }

    async _run(kind, fn, args) {
        const txId = `tx${++this.txCount}`;
        const stub = this._stubFor(fn, args.map(String), txId);
        const res = await this.cc.Invoke(stub);
        if (res.status !== 200) {
            const message = String(res.message);
            throw new LedgerError(message, classify(message));
        }
        if (kind === 'submit') {
            const ts = { seconds: { toString: () => String(this.clock()) } };
            for (const [key, value] of stub.writes) {
                if (value === null) {
                    this.world.delete(key);
                    this._record(key, { tx_id: txId, value: Buffer.alloc(0), timestamp: ts, is_delete: true });
                } else {
                    this.world.set(key, value);
                    this._record(key, { tx_id: txId, value, timestamp: ts, is_delete: false });
                }
            }
        }
        const text = res.payload && res.payload.length ? res.payload.toString() : '';
        return text ? JSON.parse(text) : null;
    }

    _record(key, entry) {
        if (!this.history.has(key)) this.history.set(key, []);
        this.history.get(key).push(entry);
    }

    submit(fn, ...args) { return this._run('submit', fn, args); }
    evaluate(fn, ...args) { return this._run('evaluate', fn, args); }

    // Test helper: raw look at a stored value
    peek(key) { const v = this.world.get(key); return v ? v.toString() : null; }
}

module.exports = { MockLedger };
