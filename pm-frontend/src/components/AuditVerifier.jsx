import { useState } from 'react'
import { api } from '../lib/api'
import { summarizeReport, reportFileName, recordLine } from '../auditLogic'
import './audit.css'

// "Verify" asks the backend for an audit report (history + digest chain + a ledger check
// of every transaction). "Download" saves that report as a JSON file that can be re-checked
// offline with pm-backend/scripts/verify-audit.js.
function AuditVerifier({ kind, id }) {
  const [state, setState] = useState({ busy: false, report: null, error: '' })
  const path = kind === 'task' ? `/tasks/${id}/audit` : `/projects/${id}/audit`

  async function verify() {
    setState({ busy: true, report: null, error: '' })
    try {
      const report = await api(path)
      setState({ busy: false, report, error: '' })
    } catch (err) {
      setState({ busy: false, report: null, error: err.message })
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(state.report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = reportFileName(state.report)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const summary = state.report ? summarizeReport(state.report) : null

  return (
    <div className="audit">
      <div className="audit-actions">
        <button type="button" className="btn btn-secondary sm" onClick={verify} disabled={state.busy}>
          {state.busy ? 'Checking the ledger…' : 'Verify audit trail'}
        </button>
        {state.report && (
          <button type="button" className="btn btn-secondary sm" onClick={download}>Download audit report</button>
        )}
      </div>
      {state.error && <div className="error-banner" role="alert">{state.error}</div>}
      {summary && (
        <div className={`audit-result ${summary.tone}`} role="status">
          <strong>{summary.title}.</strong> {summary.detail}
          <details className="audit-records">
            <summary>Show each transaction</summary>
            <ol>
              {state.report.records.map(r => <li key={r.txId}>{recordLine(r)}</li>)}
            </ol>
          </details>
        </div>
      )}
    </div>
  )
}

export default AuditVerifier
