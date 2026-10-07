# ChainBoard: design notes

Each section is one screen's design pass. A pass changes how things look and how
they are structured on screen. It never changes data, routes, chaincode calls or
behaviour: the ledger, IPFS and the backend are untouched.

## 1. Task board

### What was wrong

- Every card looked the same. Status was only the column; a finished card and an overdue card were indistinguishable from an open one.
- The due date was a grey pill with an emoji. Nothing said whether it was late.
- Archived cards were just dimmed (opacity), so they were also harder to read.
- Cards were mouse-only: no keyboard focus, no accessible name.
- Filters and the "add Task ID" row had no labels for screen readers and small tap targets.
- Empty columns were blank, so a dragged card had no visible target.
- Spacing, font sizes and radii were raw numbers scattered through App.css.

### What changes

Card state is decided in one place (`boardLogic.cardState`) and shown in words and shape, never by colour alone.

| State | When | Look | Words |
|---|---|---|---|
| open | not done, not archived, not late | status-coloured left edge (To Do grey, In Progress blue) | "Due in 3 days" / "Due today" |
| due soon | open, due within 2 days | amber due text | "Due tomorrow" |
| overdue | open, due date before today | red left edge, red bold due text | "Overdue by 2 days" |
| done | status is done | green edge, no fill, title struck through and dimmed | (no due text is shown as late) |
| archived | task archived | dashed border, no fill | "Archived" tag |
| dragging | being dragged | 40% opacity | |
| drop target | column under a dragged card | dashed accent outline | empty columns say "Drop here" |

Other changes: cards are focusable (Tab, Enter/Space opens the task); filters and the add-ID input have aria-labels; filter/add controls are at least 44px tall; column headers get a dot and a count that reads "N tasks"; empty columns show "No tasks".

### Look

Quiet and dense: a surface card with a 4px status edge, title first, then one meta row (priority word, assignee, due text). Colours come from the existing theme variables (`--info`, `--success`, `--warning`, `--danger`, `--text-dim`) through `--st-*` aliases in `src/design/tokens.css`, so light and dark each have one definition. Spacing `--s-*`, type `--fs-*`, radius `--r-*`, motion `--t-*`. Motion is off under `prefers-reduced-motion`. Under 860px the three columns stack.

### Where the logic is

- `src/boardLogic.js`: `todayISO`, `daysUntil`, `dueLabel`, `cardState`, `filterTasks`, `groupByColumn`, `cardAriaLabel`. Plain functions, no React.
- `src/boardLogic.test.js`: `npm test` in `pm-frontend` (Node's built-in runner, no browser needed).
- `src/components/BoardPage.jsx` only renders what those functions return. Drag-and-drop, `updateStatus`, `openTask`, `createTask` and `addExistingTaskToBoard` are the same calls as before.
- `src/components/board.css`: all board styles, tokens only.

## 2. Task viewer & audit trail

### What was wrong

- The due-date pill had its own overdue test, duplicating the board's, and mixed emoji with text.
- The current status was shown only by a filled button, so it relied on colour.
- Each audit record showed only the status and assignee/priority, so you had to compare records by eye to see what a transaction actually did.
- Several inputs had no labels; many controls were under 44px; emoji stood in for words ("🗑 Archive Task", "📎", "💬").
- The detail panel had no state at all: an overdue, done or archived task looked the same as an open one.

### What changes

| Part | Change |
|---|---|
| Panel | Same status edge as a board card (grey / blue / green, red when overdue, dashed when archived), driven by the same `cardState` |
| Due date | Words first: "Overdue by 2 days · 2026-10-05", "Due tomorrow · …"; one overdue rule shared with the board |
| Status control | Segmented group, `aria-pressed`, current status has a ✓ in its label; disallowed moves stay disabled with the same tooltip |
| Audit trail | Ordered list, newest first; each record states what it changed ("Status To Do → In Progress", "Assignee changed", "Comment added", "Archived") computed from consecutive on-chain records |
| Labels | Task ID, title, assign, comment inputs get aria-labels; emoji replaced by words |
| Touch | Inputs/buttons ≥ 44px; status buttons stack full width under 560px |

### Where the logic is

- `src/taskLogic.js`: `isAllowedMove` (the same transition table the viewer already had), `describeChange`, `auditEntries`. Read-only: they only describe ledger records already loaded.
- `src/taskLogic.test.js`: run with `npm test`.
- `src/components/TaskPage.jsx` renders the result; `updateStatus`, `assignTask`, `uploadAndAttach`, `addComment`, `archiveTask`, `saveMeta` are untouched, and the chaincode still enforces every rule.
- `src/components/task.css`: tokens only.

## 3. Dashboard

### What was wrong

- Project rows were clickable `div`s: no keyboard focus, no accessible name. The status pill was just the raw word.
- The loaded-project preview showed three bare counts; nothing said how far along the project was or whether anything was late.
- Inline styles and duplicated pill colours for active/archived; "member(s)".
- Empty state was a plain grey sentence; inputs had no labels and were under 44px.

### What changes

| Part | Change |
|---|---|
| Project list | Each project is a real button in a list: name, ID and "N members", state tag; archived rows are dashed and transparent, active rows have a green edge |
| State | Tag says "active" / "archived" in words, never colour alone |
| Summary | Three counts (To Do / In Progress / Done with a coloured top rule), a progress bar (`role=progressbar`) and one sentence: "25% done · 4 tasks · 1 overdue" |
| Empty state | A dashed box that says what to do next |
| Layout | Two columns collapse to one under 860px; inputs/buttons ≥ 44px |

### Where the logic is

- `src/dashboardLogic.js`: `memberCountLabel`, `projectState`, `taskSummary` (archived tasks are not counted; overdue uses the board's `cardState`), `summaryText`. Read-only.
- `src/dashboardLogic.test.js`: run with `npm test`.
- `src/components/DashboardPage.jsx` renders it; `createProject`, `selectMyProject`, `loadProject`, `goTo` are untouched.
- `src/components/dashboard.css`: tokens only.

## 4. Project page

### What was wrong

- Member order was whatever the ledger held, so the owner could be buried; the roles were colour pills with no explanation.
- Project history only showed status and the member list, so you had to diff two records to see who joined or what was archived.
- Member rows were `div`s, the nickname input had a placeholder but no label, emoji stood in for words, and the add-member form was cramped on phones.
- Active/archived pill colours were duplicated inline.

### What changes

| Part | Change |
|---|---|
| Members | Real list; sorted owner → admin → contributor (stable inside a role, display only); tooltip explains the role; one summary line "1 owner · 2 admin · 3 contributor" |
| Nickname | Labelled "Nickname for <name>", 44px tall, visible focus ring |
| Add member | Same form and handler; controls ≥ 44px; fields stack under 560px |
| Project history | Ordered list, newest first; each record states its change ("Archived", "Sam joined as admin", "Lee is now admin", "Kim left") computed from consecutive on-chain records |
| State | "active" / "archived" tag, same component as the Dashboard |

### Where the logic is

- `src/projectLogic.js`: member-shape helpers (old string members and `{id, role}`), `avatarColor`, `initial`, `sortMembers`, `roleSummary`, `roleHelp`, `describeProjectChange`, `projectAuditEntries`. Read-only.
- `src/projectLogic.test.js`: run with `npm test`.
- `src/components/ProjectPage.jsx` renders it; `addMember`, `archiveProject`, `loadProjectHistory`, `setDisplayName` and the member-ID rules are untouched; the chaincode still enforces roles.
- `src/components/project.css`: tokens only.

## 5. Sign-in, sign-up and Account

### What was wrong

- A disabled "Create account" button gave no reason; people had to guess which field was missing.
- The username status text and the "can I submit?" rule were inline in the component, and the Account page's ledger-history sentences were inline too, so none of it was testable.
- Success and error banners relied on colour; tick marks and emoji stood in for words (✓, ☀️, 🌙).
- Show/hide, link buttons and fields were under 44px; the 380/440px card was cramped on phones.
- Security activity was a stack of `div`s.

### What changes

| Part | Change |
|---|---|
| Sign-up button | Disabled state is explained underneath in words ("Enter a valid email address.", "Choose a different username.", "The two passwords do not match.") via `aria-describedby` |
| Username | One status line: Checking… / ✓ Available / the exact reason / the "server will check" fallback |
| Banners | Prefixed "Problem:" / "Done:" so they read without colour |
| Theme toggle | Plain words "Light" / "Dark" with a full aria-label |
| Controls | Inputs, buttons, link buttons ≥ 44px; visible focus ring on every control; primary button full width in the card |
| Account | Security activity is a newest-first ordered list; confirmation/connected states are sentences, not ticks |
| Password rules | Unchanged: `lib/passwordRules.js` is still the single source shared with the server's parity test |

### Where the logic is

- `src/authLogic.js`: `normalizeUsername`, `usernameHint`, `suggestUsername`, `usernameStatus`, `signupBlocker`, `describeEvents` (the on-chain account history in words). The server re-checks every rule.
- `src/authLogic.test.js`: run with `npm test`.
- `AuthPage.jsx`, `AccountPage.jsx` render the result; login, sign-up, Google, password change, email confirmation and the cookie session flow are untouched. Accounts and every account change remain blockchain transactions.
- `src/components/auth.css`: tokens only.

## 6. Navigation bar and e-mail confirmation page

### What was wrong

- Tabs were labelled with emoji, and a disabled tab only explained itself in a tooltip that touch users and screen readers never see.
- Nothing marked the current tab except colour.
- The signed-in area showed an emoji and the full name, which crowded the bar on phones.
- The confirmation page used inline styles and an emoji as its icon.

### What changes

| Part | Change |
|---|---|
| Tabs | Words only; current tab has `aria-current="page"` and a thicker underline; unavailable tabs are struck through and their accessible name says why ("Board (unavailable: Open a project first)") |
| Tab size | ≥ 44px tall, focus ring, wraps on narrow screens |
| Account link | First name only, full name in its accessible label |
| Phones | The account/sign-out row drops under the tabs with a divider |
| Confirmation page | Inline styles replaced with classes; the button is still the only thing that spends the token |

### Where the logic is

- `src/navLogic.js`: `navTabs`, `tabAriaLabel`, `firstName`. `src/navLogic.test.js`: run with `npm test`.
- `Nav.jsx` still calls `setPage` and `onLogout` exactly as before; `VerifyEmailPage.jsx` still posts the token to `/auth/email/verify` only on the button press.
- `src/components/nav.css`: tokens only.

## 7. Profile (new screen)

### Why

The app had Account settings (security) but no place that answers "who am I in this system and who do I work with?". A profile fills that gap without touching the ledger.

### What it shows

| Part | Content |
|---|---|
| Header | Avatar (Google picture or coloured initial), name, @username, email, phone, "Member since <month year>", status badges in words ("Email confirmed", "Password set", "Google connected") |
| Overview | Active projects, as owner, as admin or contributor; one sentence ("2 active projects · 1 archived · 3 teammates") |
| Projects | Every project you belong to, your role in it, active/archived tag; selecting one opens it (same `selectMyProject` as the Dashboard) |
| People you work with | Everyone who shares a project with you, most shared first; expanding a person lists the shared projects and their role in each |
| Navigation | Your first name opens the profile; "Settings" opens Account settings; the profile has an "Account settings" button |

### Fundamentals unchanged

The profile is read-only and derived from data already loaded: `/auth/me` (the on-chain account), `/projects/mine` (the on-chain membership index) and `/users` (name and username only). No chaincode change, no new endpoint, no new on-chain field. Names and roles still change only through ledger transactions (sign-up, add member), so editing a profile is deliberately not offered.

### Where the logic is

- `src/profileLogic.js`: `memberSince`, `roleIn`, `profileStats`, `statsText`, `sharedProjects`, `teammates`, `accountBadges`. `src/profileLogic.test.js`: run with `npm test`.
- `src/components/ProfilePage.jsx` renders it; `src/components/profile.css`: tokens only.

## 8. Settings (new screen)

### Why

"Settings" in the top bar opened the security page. People expect preferences there; security and sign-in become one section of it.

### What it contains

| Section | Content |
|---|---|
| Appearance | Theme (Dark / Light / Match my device), text size (Normal / Large), animations (Follow my device / Always reduce) |
| When I open the app | Start on Dashboard or Profile; show archived tasks on boards by default |
| Account and security | Links to Security and sign-in (the previous Account page, now one click inside Settings, with a back link), View profile, Sign out |
| This browser | Reset preferences; clear saved nicknames and board lists (two-step confirm, shows the count, does not delete any task; a task can be added back by its Task ID) |
| About | One line each on ledger, IPFS and sessions |

Choices are real radio groups styled as a segmented control (selected option has a ✓, so it is not colour alone), visible focus ring, ≥ 44px targets, collapses on phones. The header's Light/Dark button still works and now flips whatever is on screen.

### Fundamentals unchanged

Preferences are stored only in this browser (`pm_settings`, with the old `pm_theme` kept in step and migrated on first run). They change display only. Accounts, projects, tasks and audit records stay on the ledger and files on IPFS; the login session is the backend's cookie. Clearing data removes only nicknames (`pm_names`) and per-project board lists (`pm_board_*`) and never touches the ledger, account or session. No chaincode, backend or route change.

### Where the logic is

- `src/settingsLogic.js`: `normalizeSettings` (repairs corrupt or old data), `loadSettings`/`saveSettings` (storage injected), `resolveTheme`, `toggledTheme`, `rootAttributes`, `localDataKeys`/`clearLocalData`, `describeSetting`. `src/settingsLogic.test.js`: run with `npm test` (uses a fake storage).
- `App.jsx` holds the settings state and sets `data-theme`, `data-text`, `data-motion` on `<html>`; `src/components/SettingsPage.jsx` renders; `src/components/settings.css`: tokens only plus the three global hooks.

## 9. Automatic refresh (behaviour of every screen, no new screen)

### Why

Screens only loaded data when opened, so a change made by a teammate (a moved task, a new member, a new project) stayed invisible until a manual reload.

### What it does

Every 15 seconds, while the tab is visible and online, the open screen re-reads what it shows: Dashboard and Profile re-read "my projects"; Project re-reads the project; Board re-reads the project and each pinned task; Task re-reads the task and its audit trail. It also refreshes right after the tab becomes visible again.

| Rule | Behaviour |
|---|---|
| No flicker | Data is replaced only if it actually changed (`sameData`); no loading spinners |
| Never fights the user | Paused while a status change is in flight, and on the Task page while "Edit Details" is open |
| Failure is silent | The screen keeps its last good data; the delay doubles after each failure (15 s → 30 s → … → 2 min) and resets on success |
| Cards never vanish | If one task fetch fails, its previous copy is kept (`mergeBoard`) |
| Wrong project | A result that arrives after you switched project or task is discarded |
| Off switch | Settings → "Refresh the open screen automatically" |

### Fundamentals unchanged

Refresh only issues the same GET requests the screens already use. It never writes to the ledger, adds no endpoint and does not change the chaincode. It is polling, not a push channel, so a change made elsewhere shows up within about 15 seconds.

### Where the logic is

- `src/refreshLogic.js`: `nextDelay`, `shouldRun`, `sameData`, `refreshTargets`, `mergeBoard`. `src/refreshLogic.test.js`: run with `npm test`.
- `src/lib/useAutoRefresh.js` (timer, visibility and online handling, no overlapping runs); `App.jsx` `refreshOpenScreen` does the reads.

## 10. Permissions (ledger-enforced, mirrored in the UI)

### Why

Who may do what inside a project was decided by the backend only. A bug or a direct call could bypass it. Now the **chaincode** checks the role of the acting person on every state-changing call, and the UI mirrors those rules so buttons explain themselves.

### The rules (same table in `pm-chaincode/index.js` and `src/permissionLogic.js`)

| Action | Owner | Admin | Contributor | Not a member |
|---|---|---|---|---|
| Add a member | any role | contributors only | no | no |
| Archive the project | yes | no | no | no |
| Create a task | yes | yes | yes | no |
| Assign a task | anyone | anyone | only themselves, only if free | no |
| Change status, edit details, attach files | any task | any task | tasks assigned to them or unassigned | no |
| Archive a task | yes | yes | no | no |
| Comment | yes | yes | yes | no |

A project that is archived is read-only. Refusals come back as HTTP 403 with a sentence starting "Permission denied: …".

### UI behaviour

Disabled buttons carry the reason as a tooltip and, where space allows, as visible text ("Only the owner or an admin can add members."). The project header shows "Your role: admin". The UI check is a convenience only: the chaincode refuses anything not allowed.

### Where the logic is

- `pm-chaincode/index.js`: `roleOf`, `isManager`, `canWorkOnTask`, checks in every state-changing function; the actor is the last argument and the backend fills it from the verified session (never from the request body).
- `src/permissionLogic.js` + `src/permissionLogic.test.js`; `pm-backend/test/permissions.test.js` proves the contract (all roles, outsiders, legacy members, body cannot name another actor).

## 11. Boards read from the ledger

Boards used to list only the task IDs remembered by one browser. `getProjectTasks` (a range scan over `task:` keys filtered by project) now returns every task of the project, exposed as `GET /api/projects/:id/tasks`. `refreshBoard` and the automatic refresh use it; the old per-browser list remains only as an offline fallback. The "Add existing Task ID" row is gone because it is no longer needed.

## 12. Audit verification panel

On the Task and Project screens, **Verify audit trail** asks the backend for `GET /api/tasks/:id/audit` (or projects): the full history, a SHA-256 digest chain over it (`lib/audit.js`), and a per-transaction check against the peer (`qscc GetTransactionByID`). The result is shown in words ("Verified. All 3 records are in committed blocks on the ledger. Fingerprint: 1a2b3c4d…") with an expandable list of transactions, and **Download audit report** saves the JSON. `npm run verify-audit -- file.json` re-checks a downloaded file offline.

Logic: `src/auditLogic.js` (+ test), `src/components/AuditVerifier.jsx`, `src/components/audit.css`; backend `lib/audit.js`, `test/audit.test.js`.
