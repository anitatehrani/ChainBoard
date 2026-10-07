import { useState, useEffect, useRef } from 'react'
import { useAutoRefresh } from './lib/useAutoRefresh'
import { refreshTargets, sameData } from './refreshLogic'
import './App.css'
import Nav from './components/Nav'
import AccountMenu from './components/AccountMenu'
import AuthPage from './components/AuthPage'
import VerifyEmailPage from './components/VerifyEmailPage'
import AccountPage from './components/AccountPage'
import ProfilePage from './components/ProfilePage'
import SettingsPage from './components/SettingsPage'
import {
  DEFAULTS, loadSettings, saveSettings, normalizeSettings, resolveTheme, toggledTheme, rootAttributes
} from './settingsLogic'
import DashboardPage from './components/DashboardPage'
import ProjectPage from './components/ProjectPage'
import BoardPage from './components/BoardPage'
import TaskPage from './components/TaskPage'
import { useAuth } from './auth/AuthContext'
import { API, apiFetch } from './lib/api'
import { busy } from './lib/busy'

// ── local board-tracking helpers (client-side convenience index over on-chain data) ──
function getBoardIds(projectId) {
  try { return JSON.parse(localStorage.getItem(`pm_board_${projectId}`)) || [] } catch { return [] }
}
function saveBoardIds(projectId, ids) {
  localStorage.setItem(`pm_board_${projectId}`, JSON.stringify([...new Set(ids)]))
}

// Generates a short, collision-resistant project ID client-side, so users
// never have to invent one themselves. Uses the browser's crypto API when
// available (secure contexts / localhost) with a fallback for older browsers.
function generateProjectId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID().split('-')[0]
  return Math.random().toString(36).slice(2, 10)
}

function App() {
  // ── Preferences for this browser (theme, text size, start page…). Display only;
  // see settingsLogic.js. The ledger is never involved.
  const [settings, setSettings] = useState(() => loadSettings(window.localStorage))
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  useEffect(() => {
    const attrs = rootAttributes(settings, systemDark)
    for (const [k, v] of Object.entries(attrs)) document.documentElement.setAttribute(k, v)
    saveSettings(window.localStorage, settings)
  }, [settings, systemDark])
  const theme = resolveTheme(settings.theme, systemDark)
  const toggleTheme = () => setSettings(s => ({ ...s, theme: toggledTheme(s.theme, systemDark) }))
  const updateSettings = (patch) => setSettings(s => normalizeSettings({ ...s, ...patch }))
  const resetSettings = () => setSettings({ ...DEFAULTS })

  const [page, setPage] = useState(() => settings.startPage)

  // ── Auth. The session lives in an HttpOnly cookie that the browser sends by
  // itself (JavaScript can never read it), so nothing secret is kept in
  // localStorage. The account itself lives on the ledger; see AuthContext.
  const { user: currentUser, loading: authLoading, logout } = useAuth()

  // Every backend request goes through apiFetch (same-origin, cookie attached;
  // a 401 from any non-auth call drops the app back to the sign-in page).
  const authFetch = apiFetch

  // ── "My projects" — an on-chain index (see chaincode's getMyProjects/
  // _addProjectToUserIndex) of every project this account owns or has been
  // added to as a member, kept in sync automatically by the chaincode
  // whenever a project is created or a member is added.
  const [myProjects, setMyProjects] = useState([])
  const [loadingMyProjects, setLoadingMyProjects] = useState(false)

  async function loadMyProjects() {
    setLoadingMyProjects(true)
    const res = await authFetch(`${API}/projects/mine`)
    const data = await res.json()
    setLoadingMyProjects(false)
    if (res.ok) setMyProjects(data)
  }

  // ── User directory — every registered account's {email, name}, fetched
  // once on login so member/assignee pickers can show real names instead of
  // making anyone type or see raw email addresses (see /users on the
  // backend and getAllUsers in the chaincode).
  const [userDirectory, setUserDirectory] = useState([])
  const directoryMap = userDirectory.reduce((acc, u) => { acc[u.email] = u.name; return acc }, {})

  async function loadUserDirectory() {
    const res = await authFetch(`${API}/users`)
    const data = await res.json()
    if (res.ok) setUserDirectory(data)
  }

  const signedInEmail = currentUser ? currentUser.email : null
  useEffect(() => {
    if (signedInEmail) { loadMyProjects(); loadUserDirectory() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInEmail])

  function selectMyProject(project) {
    setSelectedProject(project)
    resetTaskContext()
    setProjectHistory([]); setShowProjectHistory(false)
    refreshBoard(project.projectId)
    goTo('project')
  }

  async function handleLogout() {
    await logout()
    // Forget everything that belonged to the person who just signed out.
    setSelectedProject(null)
    setSelectedTask(null)
    setMyProjects([])
    setUserDirectory([])
    setBoardTasks([])
    setPage('dashboard')
  }

  const [selectedProject, setSelectedProject] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [history, setHistory] = useState([])
  const [toasts, setToasts] = useState([])
  const [loadingProject, setLoadingProject] = useState(false)
  const [loadingTask, setLoadingTask] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  const [pForm, setPForm] = useState({ name: '', description: '' })
  const [tForm, setTForm] = useState({ taskId: '', title: '', description: '', priority: 'medium', dueDate: '' })
  const [loadProjectId, setLoadProjectId] = useState('')
  const [loadTaskId, setLoadTaskId] = useState('')

  const [boardTasks, setBoardTasks] = useState([])
  const [loadingBoard, setLoadingBoard] = useState(false)
  const [addBoardId, setAddBoardId] = useState('')
  const [newMember, setNewMember] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('contributor')
  const [projectHistory, setProjectHistory] = useState([])
  const [showProjectHistory, setShowProjectHistory] = useState(false)
  const [loadingProjHistory, setLoadingProjHistory] = useState(false)
  const [showArchivedTasks, setShowArchivedTasks] = useState(() => settings.showArchived)

  const [assignTo, setAssignTo] = useState('')
  const [editMeta, setEditMeta] = useState(null)
  const [newComment, setNewComment] = useState({ text: '' })

  // Local, browser-side directory mapping on-chain IDs -> friendly display names.
  // The ledger itself only ever stores/enforces raw IDs; this is purely cosmetic.
  const [nameMap, setNameMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pm_names')) || {} } catch { return {} }
  })
  function setDisplayName(id, name) {
    setNameMap(prev => {
      const next = { ...prev }
      if (name) next[id] = name
      else delete next[id]
      localStorage.setItem('pm_names', JSON.stringify(next))
      return next
    })
  }
  function displayName(id) {
    if (!id) return id
    // Priority: an explicit manual override (nameMap) > the person's real
    // registered account name (directoryMap, from /users) > the raw
    // id/email itself as a last-resort fallback for legacy/unregistered ids.
    return nameMap[id] || directoryMap[id] || id
  }

  // Turns raw backend/chaincode error strings into plain, friendly sentences.
  function humanizeError(raw) {
    if (!raw) return 'Something went wrong. Please try again.'
    const rules = [
      [/connect ECONNREFUSED|UNAVAILABLE|No connection established/i,
        () => "Can't reach the blockchain network right now. Make sure the Fabric network and backend are running."],
      [/^Project (.+) already exists$/i,
        (m) => `A project called "${m[1]}" already exists. Try loading it instead of creating it again.`],
      [/^Task (.+) already exists$/i,
        (m) => `A task called "${m[1]}" already exists. Try loading it instead of creating it again.`],
      [/^Project (.+) does not exist$/i,
        (m) => `Couldn't find a project with ID "${m[1]}". Double-check the ID and try again.`],
      [/^Task (.+) does not exist$/i,
        (m) => `Couldn't find a task with ID "${m[1]}". Double-check the ID and try again.`],
      [/^User (.+) does not exist$/i,
        () => 'No account found with that email.'],
      [/^User (.+) already exists$/i,
        () => 'An account with that email already exists — try signing in instead.'],
      [/^Member (.+) already in project$/i,
        (m) => `"${m[1]}" is already a member of this project.`],
      [/is not a member of project/i,
        () => "That person isn't a member of this project yet — add them as a member first."],
      [/Cannot reassign a completed task/i,
        () => 'This task is already marked Done, so it can’t be reassigned.'],
      [/Cannot edit a completed task/i,
        () => 'This task is already marked Done, so its details can’t be edited.'],
      [/Cannot attach files to a completed task/i,
        () => 'This task is already marked Done, so files can’t be attached anymore.'],
      [/Cannot add tasks to archived project/i,
        () => 'This project is archived, so new tasks can’t be added to it.'],
      [/already archived/i,
        () => 'This project is already archived.'],
      [/already attached to task/i,
        () => 'That file is already attached to this task.'],
      [/Please sign in/i,
        () => 'Please sign in to do that.'],
      [/^Invalid transition:\s*(\S+)\s*→\s*(\S+)$/i,
        (m) => {
          const label = { todo: 'To Do', 'in-progress': 'In Progress', done: 'Done' }
          const allowedFrom = { todo: ['in-progress'], 'in-progress': ['todo', 'done'], done: ['in-progress', 'todo'] }
          const [, from, to] = m
          const options = (allowedFrom[from] || []).map(s => label[s] || s)
          const suggestion = options.length ? ` From ${label[from] || from}, you can move to ${options.join(' or ')}.` : ''
          return `Can't move this task from ${label[from] || from} to ${label[to] || to}.${suggestion}`
        }],
      [/^Priority must be one of.*$/i,
        () => 'Please choose a valid priority: low, medium, or high.'],
      [/^Status must be one of.*$/i,
        () => 'Please choose a valid status: To Do, In Progress, or Done.'],
      [/^Field must be one of.*$/i,
        () => 'That field can’t be edited — only title, description, priority, and due date can be changed.'],
      [/^Missing: (.+)$/i,
        (m) => `Please fill in: ${m[1]}.`],
    ]
    for (const [pattern, format] of rules) {
      const m = raw.match(pattern)
      if (m) return format(m)
    }
    // Fallback: strip technical prefixes/noise and present the rest plainly
    return raw.replace(/^\d+\s+[A-Z_]+:\s*/, '').replace(/\s*\|.*$/, '').trim()
  }

  const notify = (msg, type = 'success') => {
    const id = Date.now() + Math.random()
    const text = type === 'error' ? humanizeError(msg) : msg
    setToasts(t => [...t, { id, msg: text, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
    return id
  }
  const dismissToast = (id) => setToasts(t => t.filter(x => x.id !== id))
  const goTo = (p) => setPage(p)

  // ── Automatic refresh: re-reads what the open screen shows. Read-only; a
  // failed refresh is silent and the screen keeps its last good data.
  const mutating = useRef(0) // > 0 while an optimistic status change is in flight
  async function refreshOpenScreen() {
    if (!signedInEmail) return
    const targets = refreshTargets(page, {
      hasProject: !!selectedProject, hasTask: !!selectedTask, editing: !!editMeta
    })
    const get = async (url) => {
      const res = await authFetch(url)
      if (!res.ok) throw new Error(`refresh failed (${res.status})`)
      return res.json()
    }
    const keep = (setter) => (data) => setter(prev => (sameData(prev, data) ? prev : data))
    const jobs = []
    if (targets.includes('projects')) jobs.push(get(`${API}/projects/mine`).then(keep(setMyProjects)))
    if (targets.includes('project') && selectedProject) {
      jobs.push(get(`${API}/projects/${selectedProject.projectId}`).then(keep(setSelectedProject)))
    }
    if (targets.includes('board') && selectedProject) {
      const projectId = selectedProject.projectId
      jobs.push(get(`${API}/projects/${projectId}/tasks`).then(list => {
        if (selectedProjectRef.current !== projectId) return // switched project meanwhile
        setBoardTasks(prev => (sameData(prev, list) ? prev : list))
      }))
    }
    if (targets.includes('task') && selectedTask) {
      const taskId = selectedTask.taskId
      jobs.push(Promise.all([get(`${API}/tasks/${taskId}`), get(`${API}/tasks/${taskId}/history`)]).then(([t, h]) => {
        if (selectedTaskRef.current !== taskId) return
        setSelectedTask(prev => (sameData(prev, t) ? prev : t))
        setHistory(prev => (sameData(prev, h) ? prev : h))
      }))
    }
    await Promise.all(jobs)
  }
  const selectedProjectRef = useRef(null)
  const selectedTaskRef = useRef(null)
  selectedProjectRef.current = selectedProject ? selectedProject.projectId : null
  selectedTaskRef.current = selectedTask ? selectedTask.taskId : null
  useAutoRefresh(refreshOpenScreen, {
    enabled: !!signedInEmail && settings.autoRefresh,
    isBusy: () => mutating.current > 0
  })

  function resetTaskContext() {
    setSelectedTask(null)
    setHistory([])
    setEditMeta(null)
    setAssignTo('')
  }

  function patchBoardTask(updated) {
    setBoardTasks(prev => prev.map(t => (t.taskId === updated.taskId ? updated : t)))
  }

  async function refreshBoard(projectId) {
    // The ledger is the source of truth: ask it for every task of the project.
    setLoadingBoard(true)
    try {
      const res = await authFetch(`${API}/projects/${projectId}/tasks`)
      if (res.ok) {
        const list = await res.json()
        setBoardTasks(list)
        setLoadingBoard(false)
        return
      }
    } catch { /* fall back to the list remembered by this browser */ }

    const ids = getBoardIds(projectId)
    if (ids.length === 0) { setBoardTasks([]); setLoadingBoard(false); return }
    const results = await Promise.all(
      ids.map(id => authFetch(`${API}/tasks/${id}`).then(r => r.ok ? r.json() : null).catch(() => null))
    )
    setBoardTasks(results.filter(Boolean))
    setLoadingBoard(false)
  }

  async function createProject(e) {
    e.preventDefault()
    // projectId is generated here rather than typed by the user; ownerId is
    // deliberately NOT sent — the backend derives it from the authenticated
    // session (req.user.email), so ownership is always tied to a real
    // logged-in account rather than a client-supplied string.
    const projectId = generateProjectId()
    const res = await authFetch(`${API}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...pForm, projectId })
    })
    const data = await res.json()
    if (res.ok) {
      notify(`Project "${data.name}" created — ID: ${data.projectId}`)
      setSelectedProject(data)
      setPForm({ name: '', description: '' })
      resetTaskContext()
      setProjectHistory([]); setShowProjectHistory(false)
      refreshBoard(data.projectId)
      loadMyProjects()
      goTo('project')
    } else notify(data.error, 'error')
  }

  async function loadProject() {
    if (!loadProjectId) return
    setLoadingProject(true)
    const res = await authFetch(`${API}/projects/${loadProjectId}`)
    const data = await res.json()
    setLoadingProject(false)
    if (res.ok) {
      setSelectedProject(data)
      resetTaskContext()
      setProjectHistory([]); setShowProjectHistory(false)
      refreshBoard(data.projectId)
    } else notify(data.error, 'error')
  }

  async function loadHistory(taskId) {
    const res = await authFetch(`${API}/tasks/${taskId}/history`)
    const data = await res.json()
    if (res.ok) setHistory(data)
  }

  async function loadProjectHistory() {
    if (!selectedProject) return
    setLoadingProjHistory(true)
    const res = await authFetch(`${API}/projects/${selectedProject.projectId}/history`)
    const data = await res.json()
    setLoadingProjHistory(false)
    if (res.ok) { setProjectHistory(data); setShowProjectHistory(true) }
    else notify(data.error, 'error')
  }

  async function createTask(e) {
    e.preventDefault()
    if (!selectedProject) return notify('Load a project first', 'error')
    const res = await authFetch(`${API}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...tForm, projectId: selectedProject.projectId })
    })
    const data = await res.json()
    if (res.ok) {
      notify(`Task "${data.title}" created`)
      setTForm({ taskId: '', title: '', description: '', priority: 'medium', dueDate: '' })
      saveBoardIds(selectedProject.projectId, [...getBoardIds(selectedProject.projectId), data.taskId])
      setBoardTasks(prev => [...prev, data])
    } else notify(data.error, 'error')
  }

  async function openTask(taskId) {
    if (!taskId) return
    setLoadingTask(true)
    const [taskRes, histRes] = await Promise.all([
      authFetch(`${API}/tasks/${taskId}`),
      authFetch(`${API}/tasks/${taskId}/history`)
    ])
    const taskData = await taskRes.json()
    const histData = await histRes.json()
    setLoadingTask(false)
    if (taskRes.ok) {
      setSelectedTask(taskData)
      setHistory(histData)
      setEditMeta(null)
      setAssignTo('')
    } else notify(taskData.error, 'error')
  }

  async function loadTaskAndHistory() {
    if (!loadTaskId) return
    await openTask(loadTaskId)
  }

  async function updateStatus(taskId, status) {
    // Optimistic update: move the card / flip the pill instantly, then
    // reconcile with (or roll back to) the real on-chain result once the
    // transaction confirms — avoids waiting on endorsement latency to see
    // the move happen.
    const prevTask = boardTasks.find(t => t.taskId === taskId)
    const prevSelected = selectedTask
    if (prevTask) patchBoardTask({ ...prevTask, status })
    if (selectedTask?.taskId === taskId) setSelectedTask({ ...selectedTask, status })
    const toastId = notify(`Status → ${status}`)

    mutating.current += 1
    const res = await authFetch(`${API}/tasks/${taskId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    }).finally(() => { mutating.current -= 1 })
    const data = await res.json()
    if (res.ok) {
      patchBoardTask(data)
      if (selectedTask?.taskId === taskId || prevSelected?.taskId === taskId) setSelectedTask(data)
      loadHistory(taskId)
    } else {
      dismissToast(toastId)
      if (prevTask) patchBoardTask(prevTask)
      if (prevSelected?.taskId === taskId) setSelectedTask(prevSelected)
      notify(data.error, 'error')
    }
  }

  async function addMember(e) {
    e.preventDefault()
    if (!newMember || !selectedProject) return
    const res = await authFetch(`${API}/projects/${selectedProject.projectId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: newMember, role: newMemberRole })
    })
    const data = await res.json()
    if (res.ok) {
      setSelectedProject(data)
      notify(`Member "${newMember}" added as ${newMemberRole}`)
      setNewMember('')
      setNewMemberRole('contributor')
    } else notify(data.error, 'error')
  }

  async function archiveProject() {
    if (!selectedProject) return
    const res = await authFetch(`${API}/projects/${selectedProject.projectId}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) { setSelectedProject(data); notify('Project archived') }
    else notify(data.error, 'error')
  }

  async function addExistingTaskToBoard() {
    if (!addBoardId || !selectedProject) return
    const res = await authFetch(`${API}/tasks/${addBoardId}`)
    const data = await res.json()
    if (!res.ok) return notify(data.error, 'error')
    if (data.projectId !== selectedProject.projectId) return notify('That task belongs to a different project', 'error')
    saveBoardIds(selectedProject.projectId, [...getBoardIds(selectedProject.projectId), addBoardId])
    setAddBoardId('')
    setBoardTasks(prev => (prev.some(t => t.taskId === data.taskId) ? prev : [...prev, data]))
  }

  async function assignTask() {
    if (!selectedTask || !assignTo) return
    const res = await authFetch(`${API}/tasks/${selectedTask.taskId}/assign`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId: assignTo })
    })
    const data = await res.json()
    if (res.ok) {
      setSelectedTask(data)
      patchBoardTask(data)
      notify(`Assigned to ${assignTo}`)
      loadHistory(selectedTask.taskId)
      setAssignTo('')
    } else notify(data.error, 'error')
  }

  function startEditMeta() {
    setEditMeta({
      title: selectedTask.title,
      description: selectedTask.description,
      priority: selectedTask.priority,
      dueDate: selectedTask.dueDate || ''
    })
  }

  async function saveMeta() {
    const fields = ['title', 'description', 'priority', 'dueDate']
    const changed = fields.filter(f => editMeta[f] !== selectedTask[f])
    if (changed.length === 0) { setEditMeta(null); return }
    let result = selectedTask
    for (const field of changed) {
      const res = await authFetch(`${API}/tasks/${selectedTask.taskId}/meta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value: editMeta[field] })
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error, 'error'); return }
      result = data
    }
    setSelectedTask(result)
    patchBoardTask(result)
    setEditMeta(null)
    notify('Task updated')
    loadHistory(selectedTask.taskId)
  }

  async function archiveTask(taskId) {
    const res = await authFetch(`${API}/tasks/${taskId}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) {
      patchBoardTask(data)
      if (selectedTask?.taskId === taskId) setSelectedTask(data)
      notify('Task archived')
    } else notify(data.error, 'error')
  }

  async function addComment(e) {
    e.preventDefault()
    // authorId is NOT sent — the backend derives it from the authenticated
    // session, so every comment is always attributable to a real account.
    if (!selectedTask || !newComment.text) return
    const res = await authFetch(`${API}/tasks/${selectedTask.taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newComment)
    })
    const data = await res.json()
    if (res.ok) {
      setSelectedTask(data)
      patchBoardTask(data)
      setNewComment({ text: '' })
      notify('Comment added')
      loadHistory(selectedTask.taskId)
    } else notify(data.error, 'error')
  }

  async function uploadAndAttach() {
    if (!uploadFile || !selectedTask) return notify('Select a file first', 'error')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)

      // The IPFS upload is not an API call, so it takes the lock explicitly;
      // otherwise a second click could start another upload during the gap.
      const ipfsData = await busy.run(async () => {
        const ipfsRes = await fetch('http://127.0.0.1:5001/api/v0/add', {
          method: 'POST',
          body: formData
        })
        return ipfsRes.json()
      })
      const cid = ipfsData.Hash

      const res = await authFetch(`${API}/tasks/${selectedTask.taskId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: uploadFile.name, ipfsCid: cid })
      })
      const data = await res.json()
      if (res.ok) {
        setSelectedTask(data)
        notify(`File attached — CID: ${cid.slice(0, 12)}...`)
        setUploadFile(null)
        loadHistory(selectedTask.taskId)
      } else notify(data.error, 'error')
    } catch (err) {
      notify(`Upload failed: ${err.message}`, 'error')
    }
    setUploading(false)
  }

  const statusMeta = {
    'todo':        { color: 'var(--text-dim)',  bg: 'rgba(154,160,171,0.12)', label: 'To Do' },
    'in-progress': { color: 'var(--info)',      bg: 'rgba(59,130,246,0.12)',  label: 'In Progress' },
    'done':        { color: 'var(--success)',   bg: 'rgba(34,197,94,0.12)',   label: 'Done' }
  }
  const priorityMeta = {
    low:    { color: 'var(--text-dim)', bg: 'rgba(154,160,171,0.12)' },
    medium: { color: 'var(--warning)',  bg: 'rgba(245,158,11,0.12)' },
    high:   { color: 'var(--danger)',   bg: 'rgba(239,68,68,0.12)' }
  }
  const columns = ['todo', 'in-progress', 'done']
  const isArchived = selectedProject?.status === 'archived'

  // ── Gate the entire app behind login. Nothing below this point is reachable
  // without a valid session.
  if (authLoading) {
    return <div className="app"><p className="context-line" style={{ textAlign: 'center', marginTop: 80 }}>Loading…</p></div>
  }
  // The emailed confirmation link works whether or not you are signed in.
  if (window.location.pathname === '/verify-email') {
    return <div className="app"><VerifyEmailPage /></div>
  }
  if (!currentUser) {
    return (
      <div className="app">
        <AuthPage theme={theme} toggleTheme={toggleTheme} />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-icon">⛓</div>
        <div className="header-title">
          <h1>ChainBoard</h1>
          <p className="subtitle">Hyperledger Fabric · IPFS · Immutable Audit Trail</p>
        </div>
        <AccountMenu currentUser={currentUser} page={page} setPage={setPage}
          onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme} />
      </header>

      <Nav page={page} setPage={setPage} hasProject={!!selectedProject} hasTask={!!selectedTask} />

      <div className="toast-stack" data-allow-while-busy>
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="toast-icon">{t.type === 'error' ? '⚠' : '✓'}</span>
            <span className="toast-msg">{t.msg}</span>
            <button className="toast-close" onClick={() => dismissToast(t.id)}>×</button>
            <div className="toast-bar" />
          </div>
        ))}
      </div>

      {page === 'settings' && (
        <SettingsPage
          settings={settings} update={updateSettings} reset={resetSettings}
          goTo={goTo} onLogout={handleLogout} notify={notify} user={currentUser}
        />
      )}

      {page === 'account' && (
        <>
          <button className="link-btn back-link" onClick={() => goTo('settings')}>← Back to Settings</button>
          <AccountPage notify={notify} onLogout={handleLogout} />
        </>
      )}

      {page === 'profile' && (
        <ProfilePage
          user={currentUser}
          myProjects={myProjects} loadingMyProjects={loadingMyProjects}
          userDirectory={userDirectory}
          selectMyProject={selectMyProject} goTo={goTo}
        />
      )}

      {page === 'dashboard' && (
        <DashboardPage
          currentUser={currentUser} displayName={displayName}
          pForm={pForm} setPForm={setPForm} createProject={createProject}
          loadProjectId={loadProjectId} setLoadProjectId={setLoadProjectId}
          loadProject={loadProject} loadingProject={loadingProject}
          selectedProject={selectedProject} boardTasks={boardTasks} statusMeta={statusMeta}
          goTo={goTo}
          myProjects={myProjects} loadingMyProjects={loadingMyProjects} selectMyProject={selectMyProject}
        />
      )}

      {page === 'project' && (
        <ProjectPage
          currentUser={currentUser}
          selectedProject={selectedProject} isArchived={isArchived} archiveProject={archiveProject}
          newMember={newMember} setNewMember={setNewMember}
          newMemberRole={newMemberRole} setNewMemberRole={setNewMemberRole} addMember={addMember}
          loadProjectHistory={loadProjectHistory} loadingProjHistory={loadingProjHistory}
          showProjectHistory={showProjectHistory} projectHistory={projectHistory}
          nameMap={nameMap} displayName={displayName} setDisplayName={setDisplayName}
          userDirectory={userDirectory}
          goTo={goTo}
        />
      )}

      {page === 'board' && (
        <BoardPage
          currentUser={currentUser}
          selectedProject={selectedProject} isArchived={isArchived}
          tForm={tForm} setTForm={setTForm} createTask={createTask}
          loadingBoard={loadingBoard} boardTasks={boardTasks}
          statusMeta={statusMeta} priorityMeta={priorityMeta} columns={columns}
          displayName={displayName} updateStatus={updateStatus}
          showArchivedTasks={showArchivedTasks} setShowArchivedTasks={setShowArchivedTasks}
          openTask={openTask} goTo={goTo}
        />
      )}

      {page === 'task' && (
        <TaskPage
          currentUser={currentUser}
          selectedProject={selectedProject} selectedTask={selectedTask} history={history}
          loadTaskId={loadTaskId} setLoadTaskId={setLoadTaskId}
          loadTaskAndHistory={loadTaskAndHistory} loadingTask={loadingTask}
          statusMeta={statusMeta} priorityMeta={priorityMeta} columns={columns}
          updateStatus={updateStatus}
          editMeta={editMeta} setEditMeta={setEditMeta} startEditMeta={startEditMeta} saveMeta={saveMeta}
          assignTo={assignTo} setAssignTo={setAssignTo} assignTask={assignTask}
          uploadFile={uploadFile} setUploadFile={setUploadFile} uploadAndAttach={uploadAndAttach} uploading={uploading}
          displayName={displayName}
          archiveTask={archiveTask}
          newComment={newComment} setNewComment={setNewComment} addComment={addComment}
          goTo={goTo}
        />
      )}
    </div>
  )
}

export default App
