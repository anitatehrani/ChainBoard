#!/usr/bin/env node
'use strict';

// Independently re-checks a downloaded ChainBoard audit report.
//
//   node scripts/verify-audit.js path/to/audit-task-demo-t01.json
//
// It needs no network, no backend and no ledger: it recomputes the SHA-256 digest chain
// from the records in the file. If anyone edited, removed, inserted or re-ordered a
// record after the report was produced, the check fails and says which record.
// To check the transactions themselves against the blockchain, use the "On ledger"
// column of the report, or ask a peer directly (qscc GetTransactionByID).

const fs = require('node:fs');
const { verifyReport } = require('../lib/audit');

const file = process.argv[2];
if (!file) {
    console.error('Usage: node scripts/verify-audit.js <audit-report.json>');
    process.exit(2);
}

let report;
try {
    report = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (err) {
    console.error(`Cannot read ${file}: ${err.message}`);
    process.exit(2);
}

const result = verifyReport(report);
console.log(`${report.kind || '?'} ${report.id || '?'}: ${report.records ? report.records.length : 0} record(s)`);
console.log(`head digest  ${result.headDigest}`);
if (result.ok) {
    console.log('OK: every digest matches. The history in this file has not been altered.');
    process.exit(0);
}
console.log('FAILED:');
for (const p of result.problems) console.log(`  - ${p}`);
process.exit(1);
