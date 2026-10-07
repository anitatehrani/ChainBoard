import { useId, useState } from 'react'
import { PASSWORD_RULES } from '../lib/passwordRules'

// Password input with a show/hide toggle and, optionally, a live checklist of
// the rules. The checklist sits in an aria-live region and every item carries
// screen-reader text ("met" / "not met yet"), so it is not colour-only.
function PasswordField({
  label, value, onChange, autoComplete, showChecklist = false, ctx = {},
  placeholder = '', required = true, id
}) {
  const [shown, setShown] = useState(false)
  const autoId = useId()
  const fieldId = id || autoId

  return (
    <div className="field">
      <label htmlFor={fieldId} className="field-label-text">{label}</label>
      <div className="pw-wrap">
        <input
          id={fieldId}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
        />
        <button
          type="button"
          className="pw-toggle"
          aria-pressed={shown}
          aria-label={shown ? 'Hide password' : 'Show password'}
          onClick={() => setShown(s => !s)}
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>

      {showChecklist && (
        <ul className="pw-checklist" aria-live="polite">
          {PASSWORD_RULES.map(rule => {
            const met = value.length > 0 && rule.ok(value, ctx)
            return (
              <li key={rule.id} className={met ? 'met' : ''}>
                <span aria-hidden="true">{met ? '✓' : '–'}</span> {rule.label}
                <span className="sr-only"> — {met ? 'met' : 'not met yet'}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default PasswordField
