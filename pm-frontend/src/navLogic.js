// Which top-bar tabs exist, which are available, and why a tab is not.
// Plain functions: no React, no DOM, no network.

export function navTabs({ hasProject, hasTask }) {
  return [
    { id: 'dashboard', label: 'Dashboard', enabled: true, reason: '' },
    { id: 'project', label: 'Project', enabled: !!hasProject, reason: hasProject ? '' : 'Open a project first' },
    { id: 'board', label: 'Board', enabled: !!hasProject, reason: hasProject ? '' : 'Open a project first' },
    { id: 'task', label: 'Task', enabled: !!hasTask, reason: hasTask ? '' : 'Open a task first' }
  ]
}

// Accessible name: "Board" or "Board (unavailable: Open a project first)".
export function tabAriaLabel(tab) {
  return tab.enabled ? tab.label : `${tab.label} (unavailable: ${tab.reason})`
}

export function firstName(name) {
  const t = String(name || '').trim().split(/\s+/)[0]
  return t || ''
}
