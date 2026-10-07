// Words and file names for the audit-verification panel, as plain functions
// (no React, no DOM, no network). The report itself is built by the backend.

function short(hash) {
  const h = String(hash || '')
  return h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-8)}` : h
}

// { tone: 'good' | 'bad' | 'neutral', title, detail }
export function summarizeReport(report) {
  if (!report || !Array.isArray(report.records)) {
    return { tone: 'bad', title: 'No report', detail: 'The audit report could not be read.' }
  }
  const n = report.recordCount
  const noun = `${n} record${n === 1 ? '' : 's'}`
  if (report.anyMissing) {
    const missing = report.records.filter(r => r.onLedger === false).length
    return {
      tone: 'bad',
      title: 'Problem found',
      detail: `${missing} of ${noun} could not be found on the ledger by the peer. Do not rely on this history until it is investigated.`
    }
  }
  if (report.allOnLedger) {
    return {
      tone: 'good',
      title: 'Verified',
      detail: `All ${noun} are in committed blocks on the ledger. Fingerprint of the whole history: ${short(report.headDigest)}`
    }
  }
  return {
    tone: 'neutral',
    title: 'Partly checked',
    detail: `${report.ledgerChecked} of ${noun} were checked against the ledger (the peer could not be asked for the rest). Fingerprint: ${short(report.headDigest)}`
  }
}

export function reportFileName(report) {
  const id = String((report && report.id) || 'unknown').replace(/[^\w.-]/g, '_')
  return `audit-${(report && report.kind) || 'record'}-${id}.json`
}

// One line per record for the on-screen list.
export function recordLine(r) {
  const state = r.onLedger === true ? 'on ledger' : r.onLedger === false ? 'NOT FOUND on ledger' : 'not checked'
  return `#${r.n} · tx ${String(r.txId).slice(0, 10)}… · ${state}`
}
