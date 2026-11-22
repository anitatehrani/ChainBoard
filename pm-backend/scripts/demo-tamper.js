'use strict';

// Shows what the offline verifier says about a downloaded audit report and about
// copies of it that were changed on purpose (used for the example in the thesis).
//
//   node scripts/demo-tamper.js audit-task-demo-t08.json
//
// It writes nothing: every change is made on an in-memory copy.

const fs = require('node:fs');
const { verifyReport } = require('../lib/audit');

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/demo-tamper.js <audit-report.json>'); process.exit(2); }

const base = JSON.parse(fs.readFileSync(file, 'utf8'));
const copy = () => JSON.parse(JSON.stringify(base));

function show(title, report) {
    const r = verifyReport(report);
    console.log(`\n== ${title}`);
    console.log(r.ok ? 'OK: the report is intact.' : 'REJECTED:');
    r.problems.forEach(p => console.log('  - ' + p));
}

show('Untouched report', base);

let a = copy();
a.records[1].value.assigneeId = 'luca.ferrari@example.com';
show('Edit one field of record 2 (assignee)', a);

a = copy();
a.records.splice(2, 1);
show('Delete record 3', a);

a = copy();
[a.records[1], a.records[2]] = [a.records[2], a.records[1]];
show('Swap records 2 and 3', a);

a = copy();
const fake = JSON.parse(JSON.stringify(a.records[0]));
fake.txId = 'f'.repeat(64);
a.records.splice(3, 0, fake);
show('Insert a copy of record 1 with another transaction id after record 3', a);
