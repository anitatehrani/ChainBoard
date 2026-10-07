import { useState } from 'react'
import { DEFAULTS, describeSetting, localDataKeys, clearLocalData } from '../settingsLogic'
import './settings.css'

// A group of mutually exclusive choices, styled as a segmented control.
function Choice({ legend, hint, name, value, options, onChange }) {
  return (
    <fieldset className="set-field">
      <legend className="set-legend">{legend}</legend>
      {hint && <p className="set-hint">{hint}</p>}
      <div className="seg" role="radiogroup">
        {options.map(o => (
          <label key={o.value} className={`seg-opt ${value === o.value ? 'on' : ''}`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value}
              onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function SettingsPage({ settings, update, reset, goTo, onLogout, notify, user }) {
  const [confirmClear, setConfirmClear] = useState(false)
  const savedCount = localDataKeys(window.localStorage).length

  function doClear() {
    const n = clearLocalData(window.localStorage)
    notify(`Cleared ${n} saved item${n === 1 ? '' : 's'} from this browser. Reloading…`)
    setTimeout(() => window.location.reload(), 600)
  }

  const changed = Object.keys(DEFAULTS).some(k => settings[k] !== DEFAULTS[k])

  return (
    <div className="settings-page">
      <section className="card wide">
        <div className="card-header">
          <span className="card-badge project">Appearance</span>
        </div>
        <Choice legend="Theme" name="theme" value={settings.theme}
          options={[
            { value: 'dark', label: describeSetting('theme', 'dark') },
            { value: 'light', label: describeSetting('theme', 'light') },
            { value: 'system', label: describeSetting('theme', 'system') }
          ]}
          onChange={v => update({ theme: v })} />
        <Choice legend="Text size" name="textSize" value={settings.textSize}
          hint="Larger text scales the whole app."
          options={[
            { value: 'normal', label: describeSetting('textSize', 'normal') },
            { value: 'large', label: describeSetting('textSize', 'large') }
          ]}
          onChange={v => update({ textSize: v })} />
        <Choice legend="Animations" name="motion" value={settings.motion}
          hint="Always reduce turns off transitions and the toast progress bar."
          options={[
            { value: 'system', label: describeSetting('motion', 'system') },
            { value: 'reduce', label: describeSetting('motion', 'reduce') }
          ]}
          onChange={v => update({ motion: v })} />
      </section>

      <section className="card wide">
        <div className="card-header">
          <span className="card-badge task">When I open the app</span>
        </div>
        <Choice legend="Start on" name="startPage" value={settings.startPage}
          options={[
            { value: 'dashboard', label: describeSetting('startPage', 'dashboard') },
            { value: 'profile', label: describeSetting('startPage', 'profile') }
          ]}
          onChange={v => update({ startPage: v })} />
        <fieldset className="set-field">
          <legend className="set-legend">Task boards</legend>
          <label className="set-check">
            <input type="checkbox" checked={settings.showArchived}
              onChange={e => update({ showArchived: e.target.checked })} />
            <span>Show archived tasks by default</span>
          </label>
          <p className="set-hint">Archived tasks stay on the ledger either way; this only changes what the board lists first.</p>
          <label className="set-check">
            <input type="checkbox" checked={settings.autoRefresh}
              onChange={e => update({ autoRefresh: e.target.checked })} />
            <span>Refresh the open screen automatically (every 15 seconds)</span>
          </label>
          <p className="set-hint">Only reads from the backend while this tab is visible. It pauses while you edit a task and slows down if the backend is unreachable.</p>
        </fieldset>
      </section>

      <section className="card wide">
        <div className="card-header">
          <span className="card-badge audit">Account and security</span>
        </div>
        <p className="context-line">
          Signed in as <b>{user.name}</b> (@{user.username}). Your password, Google connection, email
          confirmation and the on-chain security history are in Security and sign-in.
        </p>
        <div className="set-actions">
          <button className="btn btn-secondary" onClick={() => goTo('account')}>Security and sign-in</button>
          <button className="btn btn-secondary" onClick={() => goTo('profile')}>View profile</button>
          <button className="btn btn-secondary" onClick={onLogout}>Sign out</button>
        </div>
      </section>

      <section className="card wide">
        <div className="card-header">
          <span className="card-badge project">This browser</span>
        </div>
        <p className="context-line">
          These preferences live only in this browser. Your account, projects, tasks and audit trail live on
          the Hyperledger Fabric ledger and attachments on IPFS, so they are not affected here.
        </p>
        <div className="set-actions">
          <button className="btn btn-secondary" onClick={reset} disabled={!changed}>Reset preferences</button>
          {!confirmClear ? (
            <button className="btn btn-danger" onClick={() => setConfirmClear(true)} disabled={savedCount === 0}>
              Clear saved nicknames and board lists ({savedCount})
            </button>
          ) : (
            <span className="set-confirm" role="alert">
              Remove {savedCount} saved item{savedCount === 1 ? '' : 's'} from this browser?
              <button className="btn btn-danger" onClick={doClear}>Yes, clear</button>
              <button className="btn btn-secondary" onClick={() => setConfirmClear(false)}>Cancel</button>
            </span>
          )}
        </div>
        <p className="set-hint">
          Nicknames you gave people and the lists of tasks pinned to each board are kept here. Clearing them
          does not delete any task: you can add a task back to a board by its Task ID.
        </p>
      </section>

      <section className="card wide">
        <div className="card-header">
          <span className="card-badge audit">About</span>
        </div>
        <dl className="set-about">
          <div><dt>Ledger</dt><dd>Hyperledger Fabric: accounts, projects, tasks and every change are transactions</dd></div>
          <div><dt>Files</dt><dd>IPFS: attachments are stored by content ID and linked from the task</dd></div>
          <div><dt>Sessions</dt><dd>Sign-in cookie kept by the backend; not stored in this browser's storage</dd></div>
        </dl>
      </section>
    </div>
  )
}

export default SettingsPage
