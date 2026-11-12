import { useState } from 'react'
import { api } from '../lib/api'
import { summarizeReport, reportFileName, recordLine } from '../auditLogic'
import './audit.css'

// "Check history" asks the backend for an audit report (history + digest chain + a ledger
// check of every transaction) and explains the result in plain words. "Save proof" stores
// the report as a JSON file that can be re-checked offline with
// pm-backend/scripts/verify-audit.js. The wording was simplified after the first user test.
const ICONS = {
  shield: <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />,
  good: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></>,
  bad: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>,
  neutral: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 2" /></>,
  save: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" />
}
const Icon = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
)

function AuditVerifier({ kind, id }) {
  const [state, setState] = useState({ busy: false, report: null, error: '' })
  const path = kind === 'task' ? `/tasks/${id}/audit` : `/projects/${id}/audit`
  const thing = kind === 'task' ? 'task' : 'project'

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
      {!summary && (
        <div className="audit-intro">
          <button type="button" className="btn btn-primary audit-check" onClick={verify} disabled={state.busy}>
            <Icon name="shield" />
            {state.busy ? 'Checking…' : 'Check that this history is genuine'}
          </button>
          <p className="audit-help">
            Confirms that nothing below was edited, deleted or added later.
          </p>
        </div>
      )}

      {state.error && (
        <div className="audit-result bad" role="alert">
          <span className="audit-icon"><Icon name="bad" size={22} /></span>
          <div>
            <strong>The check could not be completed.</strong>
            <p>{state.error}</p>
            <button type="button" className="btn btn-secondary sm" onClick={verify}>Try again</button>
          </div>
        </div>
      )}

      {summary && (
        <div className={`audit-result ${summary.tone}`} role="status">
          <span className="audit-icon"><Icon name={summary.tone} size={22} /></span>
          <div className="audit-body">
            <strong>{summary.title}</strong>
            <p>{summary.detail}</p>

            {summary.fingerprint && (
              <p className="audit-fingerprint">
                <span>History code: <code>{summary.fingerprint}</code></span>
                <span className="audit-note">A short code that summarizes this whole {thing} history. If anything changes later, this code changes too.</span>
              </p>
            )}

            <div className="audit-actions">
              <button type="button" className="btn btn-secondary sm" onClick={download}
                title="Saves a file that anyone can check later, even without ChainBoard">
                <Icon name="save" size={16} /> Save proof
              </button>
              <button type="button" className="btn btn-secondary sm" onClick={verify} disabled={state.busy}>
                {state.busy ? 'Checking…' : 'Check again'}
              </button>
            </div>

            <details className="audit-records">
              <summary>Technical details</summary>
              <ol>
                {state.report.records.map(r => <li key={r.txId}>{recordLine(r)}</li>)}
              </ol>
            </details>
          </div>
        </div>
      )}
    </div>
  )
}

export default AuditVerifier
