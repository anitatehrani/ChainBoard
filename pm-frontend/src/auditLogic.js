// Words and file names for the audit-verification panel, as plain functions
// (no React, no DOM, no network). The report itself is built by the backend.

function short(hash) {
  const h = String(hash || '')
  return h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-8)}` : h
}

// Plain-language result for people who do not know what a ledger is.
// { tone: 'good' | 'bad' | 'neutral', title, detail, fingerprint }
// (Written after the first user test: the old wording, "records in committed
// blocks", meant nothing to a non-technical participant.)
export function summarizeReport(report) {
  if (!report || !Array.isArray(report.records)) {
    return { tone: 'bad', title: 'The check could not be completed', detail: 'The result could not be read. Please try again.', fingerprint: '' }
  }
  const n = report.recordCount
  const noun = `${n} change${n === 1 ? '' : 's'}`
  const fingerprint = short(report.headDigest)
  if (report.anyMissing) {
    const missing = report.records.filter(r => r.onLedger === false).length
    return {
      tone: 'bad',
      title: 'Something does not match',
      detail: `${missing} of ${noun} could not be found in the blockchain. This history may have been altered, so do not rely on it and tell the project owner.`,
      fingerprint
    }
  }
  if (report.allOnLedger) {
    return {
      tone: 'good',
      title: 'This history is genuine',
      detail: `All ${noun} were found in the blockchain exactly as they are shown here. Nobody has edited, removed or added anything since they were saved.`,
      fingerprint
    }
  }
  return {
    tone: 'neutral',
    title: 'Could not check everything',
    detail: `${report.ledgerChecked} of ${noun} were confirmed. The blockchain could not be reached for the rest; please try again in a moment.`,
    fingerprint
  }
}

export function reportFileName(report) {
  const id = String((report && report.id) || 'unknown').replace(/[^\w.-]/g, '_')
  return `audit-${(report && report.kind) || 'record'}-${id}.json`
}

// "7 Oct 2026, 14:32" in the viewer's own time zone; '' when there is no usable time.
export function formatWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const pad = n => String(n).padStart(2, '0')
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// One line per record for the on-screen list.
export function recordLine(r) {
  const state = r.onLedger === true ? 'confirmed' : r.onLedger === false ? 'NOT FOUND in the blockchain' : 'not checked'
  const when = formatWhen(r.timestamp)
  return `Change ${r.n} · ${when ? `${when} · ` : ''}${state} · transaction ${String(r.txId).slice(0, 10)}…`
}
