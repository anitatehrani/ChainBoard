'use strict';

// Audit-trail verification, as pure functions.
//
// The ledger already keeps every version of a task/project (getHistoryForKey),
// each tied to the transaction that produced it. This module adds two checks
// that anyone can repeat independently:
//
//   1. A DIGEST CHAIN over the records, oldest to newest:
//        digest[0] = SHA-256( "0"*64 | txId | canonicalJSON(value) )
//        digest[i] = SHA-256( digest[i-1] | txId | canonicalJSON(value) )
//      Changing, removing, inserting or re-ordering ANY record changes every digest
//      after it, so the final "head digest" is a short fingerprint of the whole history.
//      Write it down (or put it in the thesis) and compare later.
//
//   2. A LEDGER CHECK per transaction id: the peer is asked (qscc GetTransactionByID)
//      whether that transaction is really in a committed block.
//
// The digest chain is NOT a replacement for the blockchain's own hashing; it is a
// convenient, portable fingerprint that lets a downloaded report be re-verified offline
// (see scripts/verify-audit.js).

const crypto = require('node:crypto');

const GENESIS = '0'.repeat(64);
const ALGORITHM = 'sha256-chain-v1';

// JSON with object keys sorted at every level, so the same data always gives the same bytes.
function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

function digestOf(previous, txId, value) {
    return crypto.createHash('sha256')
        .update(`${previous}|${txId}|${canonical(value)}`)
        .digest('hex');
}

// history: [{ txId, value, timestamp? }] oldest first (as the chaincode returns it).
// Returns [{ n, txId, timestamp, value, digest }] oldest first.
function chain(history) {
    const list = Array.isArray(history) ? history : [];
    let previous = GENESIS;
    return list.map((h, i) => {
        const digest = digestOf(previous, h.txId, h.value);
        previous = digest;
        return { n: i + 1, txId: h.txId, timestamp: h.timestamp || null, value: h.value, digest };
    });
}

// txChecks: { [txId]: true | false | null }   (null = could not be checked, e.g. peer unreachable)
function buildReport({ kind, id, history, txChecks = {}, now = new Date() }) {
    const records = chain(history).map(r => ({
        ...r,
        onLedger: Object.prototype.hasOwnProperty.call(txChecks, r.txId) ? txChecks[r.txId] : null
    }));
    const known = records.filter(r => r.onLedger !== null);
    return {
        algorithm: ALGORITHM,
        kind,
        id,
        generatedAt: now.toISOString(),
        recordCount: records.length,
        headDigest: records.length ? records[records.length - 1].digest : GENESIS,
        ledgerChecked: known.length,
        allOnLedger: records.length > 0 && known.length === records.length && known.every(r => r.onLedger === true),
        anyMissing: records.some(r => r.onLedger === false),
        records
    };
}

// Re-computes every digest of a report (this is what scripts/verify-audit.js runs on a
// downloaded file). Returns { ok, problems: [string], headDigest }.
function verifyReport(report) {
    const problems = [];
    if (!report || report.algorithm !== ALGORITHM || !Array.isArray(report.records)) {
        return { ok: false, problems: ['Not a ChainBoard audit report (unknown format).'], headDigest: null };
    }
    let previous = GENESIS;
    report.records.forEach((r, i) => {
        if (r.n !== i + 1) problems.push(`Record ${i + 1}: out of order (says n=${r.n}).`);
        const expected = digestOf(previous, r.txId, r.value);
        if (expected !== r.digest) problems.push(`Record ${i + 1} (tx ${String(r.txId).slice(0, 12)}…): digest does not match its content.`);
        previous = r.digest;
    });
    const head = report.records.length ? report.records[report.records.length - 1].digest : GENESIS;
    if (report.headDigest !== head) problems.push('The head digest does not match the last record.');
    if (report.recordCount !== report.records.length) problems.push('The record count does not match the records.');
    return { ok: problems.length === 0, problems, headDigest: head };
}

module.exports = { GENESIS, ALGORITHM, canonical, digestOf, chain, buildReport, verifyReport };
