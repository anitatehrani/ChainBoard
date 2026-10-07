'use strict';

const shim = require('fabric-shim');

// Projects and tasks are stored under separate key prefixes so a project and
// a task can never collide on the ledger even if given the same ID string
// (e.g. project "1" and task "1" used to overwrite the same ledger entry).
function projectKey(projectId) { return `project:${projectId}`; }
function taskKey(taskId) { return `task:${taskId}`; }
// Users are keyed by their (lowercased) email address rather than a generated
// ID. This lets login look a user up with a single direct getState() call —
// LevelDB (the default Fabric world-state store) has no secondary-index/query
// support, so a generated userId with a separate email->id lookup would need
// CouchDB's rich queries instead. Keying directly by email avoids that
// dependency entirely.
function userKey(email) { return `user:${email.toLowerCase()}`; }

// Because LevelDB cannot query "which user has this username/phone/Google
// account", uniqueness of those fields is enforced with small INDEX KEYS that
// point at the owning user's email. Creating a user writes the user record and
// its index keys in ONE transaction, so two people can never claim the same
// username even if they race (Fabric's MVCC check rejects the loser).
// The "idx:" prefix keeps these keys out of the "user:" range scan.
function usernameKey(username) { return `idx:username:${username.toLowerCase()}`; }
function phoneKey(phone) { return `idx:phone:${phone}`; }
function googleKey(googleId) { return `idx:google:${googleId}`; }

// Account field rules that the LEDGER itself enforces (defence in depth: the
// backend validates first for friendly messages, but the contract is the
// authority on what an on-chain account may look like). Password rules are
// deliberately NOT here — the plaintext password never reaches the chain,
// only its already-computed hash does.
const USERNAME_RE = /^[a-z0-9][a-z0-9._]{2,23}$/;
const PHONE_RE = /^\+[1-9]\d{6,14}$/;
const RESERVED_USERNAMES = new Set([
    'admin', 'administrator', 'api', 'root', 'support', 'login', 'logout', 'signup',
    'signin', 'settings', 'help', 'about', 'me', 'user', 'users', 'system', 'null',
    'undefined', 'www', 'mail', 'email', 'account', 'accounts', 'security', 'official'
]);

// Chaincode must be deterministic, so it never reads a clock. The transaction
// timestamp, however, is part of the signed proposal and is therefore
// identical on every endorsing peer — safe to use for "createdAt" style fields.
function txTime(stub) {
    const ts = stub.getTxTimestamp();
    const secs = ts.seconds && typeof ts.seconds.toString === 'function'
        ? Number(ts.seconds.toString()) : Number(ts.seconds);
    return new Date(secs * 1000).toISOString();
}

// ── Permissions ──────────────────────────────────────────────────────────────
// The LEDGER decides who may do what inside a project, not just the backend.
// Every state-changing project/task function takes the acting person's id as its
// LAST argument; the backend fills it in from the verified login session.
// (Fabric itself only knows the backend's single organisation identity, so the
// chaincode cannot see the end user by itself. The actor id is therefore trusted
// as far as the backend is trusted; see docs/EVALUATION.md, threat model.)
//
//   owner        everything, including archiving the project and granting any role
//   admin        add contributors, assign anyone, archive tasks, work on any task
//   contributor  create tasks, comment, and work on tasks assigned to them or unassigned
//   not a member nothing
const MANAGER_ROLES = ['owner', 'admin'];

// Old (pre-role) projects stored members as plain id strings: treat those as contributors.
function roleOf(project, id) {
    const found = (project.members || []).find(m => (typeof m === 'string' ? m : m.id) === id);
    if (!found) return null;
    return typeof found === 'string' ? 'contributor' : (found.role || 'contributor');
}
function isManager(role) { return MANAGER_ROLES.includes(role); }
// May this person change this particular task (status, details, files)?
function canWorkOnTask(role, task, actorId) {
    if (!role) return false;
    return isManager(role) || !task.assigneeId || task.assigneeId === actorId;
}
function validActor(actorId) {
    return typeof actorId === 'string' && actorId.trim().length > 0;
}

const PMChaincode = class {

    // Loads a project or returns null. Used by the permission checks.
    async _getProject(stub, projectId) {
        const data = await stub.getState(projectKey(projectId));
        if (!data || data.length === 0) return null;
        return JSON.parse(data.toString());
    }

    async Init(stub) {
        console.log('PM Chaincode initialized');
        return shim.success();
    }

    async Invoke(stub) {
        const { fcn, params } = stub.getFunctionAndParameters();

        // Project functions
        if (fcn === 'createProject')     return this.createProject(stub, params);
        if (fcn === 'getProject')        return this.getProject(stub, params);
        if (fcn === 'addProjectMember')  return this.addProjectMember(stub, params);
        if (fcn === 'archiveProject')    return this.archiveProject(stub, params);
        if (fcn === 'getProjectHistory') return this.getProjectHistory(stub, params);
        if (fcn === 'getProjectTasks')   return this.getProjectTasks(stub, params);

        // Task functions
        if (fcn === 'createTask')        return this.createTask(stub, params);
        if (fcn === 'getTask')           return this.getTask(stub, params);
        if (fcn === 'assignTask')        return this.assignTask(stub, params);
        if (fcn === 'updateTaskStatus')  return this.updateTaskStatus(stub, params);
        if (fcn === 'updateTaskMeta')    return this.updateTaskMeta(stub, params);
        if (fcn === 'archiveTask')       return this.archiveTask(stub, params);
        if (fcn === 'addComment')        return this.addComment(stub, params);
        if (fcn === 'getTaskHistory')    return this.getTaskHistory(stub, params);

        // File functions
        if (fcn === 'attachFile')        return this.attachFile(stub, params);

        // User / auth functions
        if (fcn === 'registerUser')        return this.registerUser(stub, params);
        if (fcn === 'getUser')             return this.getUser(stub, params);
        if (fcn === 'getUserByUsername')   return this.getUserByUsername(stub, params);
        if (fcn === 'getUserByGoogleId')   return this.getUserByGoogleId(stub, params);
        if (fcn === 'updatePasswordHash')  return this.updatePasswordHash(stub, params);
        if (fcn === 'linkGoogle')          return this.linkGoogle(stub, params);
        if (fcn === 'unlinkGoogle')        return this.unlinkGoogle(stub, params);
        if (fcn === 'markEmailVerified')   return this.markEmailVerified(stub, params);
        if (fcn === 'getUserHistory')      return this.getUserHistory(stub, params);
        if (fcn === 'getMyProjects')       return this.getMyProjects(stub, params);
        if (fcn === 'getAllUsers')         return this.getAllUsers(stub, params);

        return shim.error(`Unknown function: ${fcn}`);
    }

    // Keeps a user's on-chain "my projects" index in sync. Called whenever a
    // project is created (for the owner) or a member is added (for that
    // member). This exists because LevelDB — the default Fabric world-state
    // store — has no secondary-index/query support, so "find every project
    // this user belongs to" can't be expressed as a query; instead each
    // user record maintains its own list, updated as membership changes.
    // Silently does nothing if the given id isn't a registered account (e.g.
    // an old-style plain-string member ID from before login existed) — the
    // project membership itself is unaffected either way.
    async _addProjectToUserIndex(stub, email, projectId) {
        const data = await stub.getState(userKey(email));
        if (!data || data.length === 0) return;
        const user = JSON.parse(data.toString());
        if (!user.projectIds) user.projectIds = [];
        if (!user.projectIds.includes(projectId)) {
            user.projectIds.push(projectId);
            await stub.putState(userKey(email), Buffer.from(JSON.stringify(user)));
        }
    }

    // ─────────────────────────────────────────────
    // PROJECT FUNCTIONS
    // ─────────────────────────────────────────────

    async createProject(stub, params) {
        if (params.length !== 4) return shim.error('Expected: projectId, name, description, ownerId');
        const [projectId, name, description, ownerId] = params;

        const existing = await stub.getState(projectKey(projectId));
        if (existing && existing.length > 0) return shim.error(`Project ${projectId} already exists`);

        const project = {
            docType: 'project',
            projectId, name, description, ownerId,
            members: [{ id: ownerId, role: 'owner' }],
            status: 'active'
        };

        await stub.putState(projectKey(projectId), Buffer.from(JSON.stringify(project)));
        await this._addProjectToUserIndex(stub, ownerId, projectId);
        return shim.success(Buffer.from(JSON.stringify(project)));
    }

    async getProject(stub, params) {
        if (params.length !== 1) return shim.error('Expected: projectId');
        const data = await stub.getState(projectKey(params[0]));
        if (!data || data.length === 0) return shim.error(`Project ${params[0]} does not exist`);
        return shim.success(data);
    }

    async addProjectMember(stub, params) {
        if (params.length !== 4) return shim.error('Expected: projectId, memberId, role, actorId');
        const [projectId, memberId, role, actorId] = params;

        const validRoles = ['owner', 'admin', 'contributor'];
        if (!validRoles.includes(role)) return shim.error(`Role must be one of: owner, admin, contributor`);
        if (!validActor(actorId)) return shim.error('Missing actor');

        const data = await stub.getState(projectKey(projectId));
        if (!data || data.length === 0) return shim.error(`Project ${projectId} does not exist`);

        const project = JSON.parse(data.toString());

        const actorRole = roleOf(project, actorId);
        if (!isManager(actorRole)) {
            return shim.error('Permission denied: only project owners and admins can add members');
        }
        if (actorRole === 'admin' && role !== 'contributor') {
            return shim.error('Permission denied: admins can only add contributors; ask the owner to grant a higher role');
        }
        if (project.status === 'archived') return shim.error(`Project ${projectId} is archived (read-only)`);

        if (project.members.some(m => (typeof m === 'string' ? m : m.id) === memberId)) {
            return shim.error(`Member ${memberId} already in project`);
        }

        project.members.push({ id: memberId, role });
        await stub.putState(projectKey(projectId), Buffer.from(JSON.stringify(project)));
        await this._addProjectToUserIndex(stub, memberId, projectId);
        return shim.success(Buffer.from(JSON.stringify(project)));
    }

    async archiveProject(stub, params) {
        if (params.length !== 2) return shim.error('Expected: projectId, actorId');
        if (!validActor(params[1])) return shim.error('Missing actor');
        const data = await stub.getState(projectKey(params[0]));
        if (!data || data.length === 0) return shim.error(`Project ${params[0]} does not exist`);

        const project = JSON.parse(data.toString());
        if (roleOf(project, params[1]) !== 'owner') {
            return shim.error('Permission denied: only the project owner can archive the project');
        }
        if (project.status === 'archived') return shim.error(`Project ${params[0]} is already archived`);

        project.status = 'archived';
        await stub.putState(projectKey(params[0]), Buffer.from(JSON.stringify(project)));
        return shim.success(Buffer.from(JSON.stringify(project)));
    }

    async getProjectHistory(stub, params) {
        if (params.length !== 1) return shim.error('Expected: projectId');
        const iterator = await stub.getHistoryForKey(projectKey(params[0]));
        const history = [];

        while (true) {
            const result = await iterator.next();
            if (result.done) break;
            history.push({
                txId: result.value.tx_id,
                value: JSON.parse(result.value.value.toString())
            });
        }

        await iterator.close();
        return shim.success(Buffer.from(JSON.stringify(history)));
    }

    // Every task of one project. LevelDB has no queries, but it does support a plain
    // range scan over a key prefix, so this walks all "task:" keys and keeps the
    // ones that belong to the project. This is what lets a board load its tasks
    // from the ledger instead of from a list remembered by the browser.
    async getProjectTasks(stub, params) {
        if (params.length !== 1) return shim.error('Expected: projectId');
        const project = await this._getProject(stub, params[0]);
        if (!project) return shim.error(`Project ${params[0]} does not exist`);

        const iterator = await stub.getStateByRange('task:', 'task:~');
        const tasks = [];
        while (true) {
            const result = await iterator.next();
            if (result.done) break;
            const task = JSON.parse(result.value.value.toString());
            if (task.projectId === params[0]) tasks.push(task);
        }
        await iterator.close();
        tasks.sort((a, b) => (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0));
        return shim.success(Buffer.from(JSON.stringify(tasks)));
    }

    // ─────────────────────────────────────────────
    // TASK FUNCTIONS
    // ─────────────────────────────────────────────

    async createTask(stub, params) {
        if (params.length !== 7) return shim.error('Expected: taskId, projectId, title, description, priority, dueDate, actorId');
        const [taskId, projectId, title, description, priority, dueDate, actorId] = params;
        if (!validActor(actorId)) return shim.error('Missing actor');

        // Verify project exists
        const projectData = await stub.getState(projectKey(projectId));
        if (!projectData || projectData.length === 0) return shim.error(`Project ${projectId} does not exist`);

        // Verify project is active
        const project = JSON.parse(projectData.toString());
        if (!roleOf(project, actorId)) {
            return shim.error('Permission denied: only project members can create tasks');
        }
        if (project.status === 'archived') return shim.error(`Cannot add tasks to archived project ${projectId}`);

        // Verify task does not already exist
        const existing = await stub.getState(taskKey(taskId));
        if (existing && existing.length > 0) return shim.error(`Task ${taskId} already exists`);

        // Validate priority
        const validPriorities = ['low', 'medium', 'high'];
        if (!validPriorities.includes(priority)) return shim.error(`Priority must be one of: low, medium, high`);

        const task = {
            docType: 'task',
            taskId, projectId, title, description,
            priority,
            dueDate: dueDate || '',
            status: 'todo',
            assigneeId: null,
            archived: false,
            attachments: [],
            comments: []
        };

        await stub.putState(taskKey(taskId), Buffer.from(JSON.stringify(task)));
        return shim.success(Buffer.from(JSON.stringify(task)));
    }

    async getTask(stub, params) {
        if (params.length !== 1) return shim.error('Expected: taskId');
        const data = await stub.getState(taskKey(params[0]));
        if (!data || data.length === 0) return shim.error(`Task ${params[0]} does not exist`);
        return shim.success(data);
    }

    // Loads a task and its project, and checks that the actor may work on it.
    // Returns { task, project, role } or { error }.
    async _taskForWork(stub, taskId, actorId, what) {
        if (!validActor(actorId)) return { error: 'Missing actor' };
        const data = await stub.getState(taskKey(taskId));
        if (!data || data.length === 0) return { error: `Task ${taskId} does not exist` };
        const task = JSON.parse(data.toString());
        const project = await this._getProject(stub, task.projectId);
        if (!project) return { error: `Project ${task.projectId} does not exist` };
        const role = roleOf(project, actorId);
        if (!role) return { error: `Permission denied: only project members can ${what}` };
        if (!canWorkOnTask(role, task, actorId)) {
            return { error: `Permission denied: this task is assigned to someone else; only the assignee, an admin or the owner can ${what}` };
        }
        return { task, project, role };
    }

    async assignTask(stub, params) {
        if (params.length !== 3) return shim.error('Expected: taskId, assigneeId, actorId');
        const [taskId, assigneeId, actorId] = params;
        if (!validActor(actorId)) return shim.error('Missing actor');

        const data = await stub.getState(taskKey(taskId));
        if (!data || data.length === 0) return shim.error(`Task ${taskId} does not exist`);

        const task = JSON.parse(data.toString());
        if (task.status === 'done') return shim.error(`Cannot reassign a completed task`);

        // Verify assignee is a member of the project
        const projectData = await stub.getState(projectKey(task.projectId));
        const project = JSON.parse(projectData.toString());
        const actorRole = roleOf(project, actorId);
        if (!actorRole) return shim.error('Permission denied: only project members can assign tasks');
        // Owners and admins may assign anyone; a contributor may only take a task for themselves.
        if (!isManager(actorRole) && assigneeId !== actorId) {
            return shim.error('Permission denied: contributors can only assign tasks to themselves');
        }
        if (!isManager(actorRole) && task.assigneeId && task.assigneeId !== actorId) {
            return shim.error('Permission denied: this task is assigned to someone else');
        }
        if (!roleOf(project, assigneeId)) {
            return shim.error(`User ${assigneeId} is not a member of project ${task.projectId}`);
        }

        task.assigneeId = assigneeId;
        await stub.putState(taskKey(taskId), Buffer.from(JSON.stringify(task)));
        return shim.success(Buffer.from(JSON.stringify(task)));
    }

    async updateTaskStatus(stub, params) {
        if (params.length !== 3) return shim.error('Expected: taskId, newStatus, actorId');
        const [taskId, newStatus, actorId] = params;

        const validStatuses = ['todo', 'in-progress', 'done'];
        if (!validStatuses.includes(newStatus)) {
            return shim.error(`Status must be one of: todo, in-progress, done`);
        }

        const ctx = await this._taskForWork(stub, taskId, actorId, 'change its status');
        if (ctx.error) return shim.error(ctx.error);
        const task = ctx.task;

        // Enforce valid status transitions.
        // 'done' can be reopened back to 'in-progress' or 'todo' if more work
        // turns out to be needed — the change itself still lands on the
        // immutable audit trail, so reopenings are fully visible in history.
        const transitions = {
            'todo':        ['in-progress'],
            'in-progress': ['todo', 'done'],
            'done':        ['in-progress', 'todo']
        };

        if (!transitions[task.status].includes(newStatus)) {
            return shim.error(`Invalid transition: ${task.status} → ${newStatus}`);
        }

        task.status = newStatus;
        await stub.putState(taskKey(taskId), Buffer.from(JSON.stringify(task)));
        return shim.success(Buffer.from(JSON.stringify(task)));
    }

    async updateTaskMeta(stub, params) {
        if (params.length !== 4) return shim.error('Expected: taskId, field, value, actorId');
        const [taskId, field, value, actorId] = params;

        const editableFields = ['title', 'description', 'priority', 'dueDate'];
        if (!editableFields.includes(field)) {
            return shim.error(`Field must be one of: title, description, priority, dueDate`);
        }

        if (field === 'priority') {
            const validPriorities = ['low', 'medium', 'high'];
            if (!validPriorities.includes(value)) {
                return shim.error(`Priority must be one of: low, medium, high`);
            }
        }

        const ctx = await this._taskForWork(stub, taskId, actorId, 'edit its details');
        if (ctx.error) return shim.error(ctx.error);
        const task = ctx.task;
        if (task.status === 'done') return shim.error(`Cannot edit a completed task`);

        task[field] = value;
        await stub.putState(taskKey(taskId), Buffer.from(JSON.stringify(task)));
        return shim.success(Buffer.from(JSON.stringify(task)));
    }

    async archiveTask(stub, params) {
        // A ledger can't truly delete history, so "deleting" a task means
        // marking it archived — it drops off the active board but its full
        // history remains permanently on-chain, same pattern as archiveProject.
        if (params.length !== 2) return shim.error('Expected: taskId, actorId');
        if (!validActor(params[1])) return shim.error('Missing actor');
        const data = await stub.getState(taskKey(params[0]));
        if (!data || data.length === 0) return shim.error(`Task ${params[0]} does not exist`);

        const task = JSON.parse(data.toString());
        const project = await this._getProject(stub, task.projectId);
        if (!project || !isManager(roleOf(project, params[1]))) {
            return shim.error('Permission denied: only project owners and admins can archive tasks');
        }
        if (task.archived) return shim.error(`Task ${params[0]} is already archived`);

        task.archived = true;
        await stub.putState(taskKey(params[0]), Buffer.from(JSON.stringify(task)));
        return shim.success(Buffer.from(JSON.stringify(task)));
    }

    async addComment(stub, params) {
        if (params.length !== 3) return shim.error('Expected: taskId, authorId, text');
        const [taskId, authorId, text] = params;
        if (!validActor(authorId)) return shim.error('Missing actor');
        if (!text || !text.trim()) return shim.error('Comment text cannot be empty');

        const data = await stub.getState(taskKey(taskId));
        if (!data || data.length === 0) return shim.error(`Task ${taskId} does not exist`);

        const task = JSON.parse(data.toString());
        // Any project member may comment (the author id IS the actor).
        const project = await this._getProject(stub, task.projectId);
        if (!project || !roleOf(project, authorId)) {
            return shim.error('Permission denied: only project members can comment');
        }
        // No timestamp is generated here (each peer would compute a different
        // one, breaking endorsement) — comment order is recovered from the
        // audit trail's transaction sequence instead, same as everywhere else.
        if (!task.comments) task.comments = [];
        task.comments.push({ authorId, text });
        await stub.putState(taskKey(taskId), Buffer.from(JSON.stringify(task)));
        return shim.success(Buffer.from(JSON.stringify(task)));
    }

    async getTaskHistory(stub, params) {
        if (params.length !== 1) return shim.error('Expected: taskId');
        const iterator = await stub.getHistoryForKey(taskKey(params[0]));
        const history = [];

        while (true) {
            const result = await iterator.next();
            if (result.done) break;
            history.push({
                txId: result.value.tx_id,
                value: JSON.parse(result.value.value.toString())
            });
        }

        await iterator.close();
        return shim.success(Buffer.from(JSON.stringify(history)));
    }

    // ─────────────────────────────────────────────
    // FILE FUNCTIONS
    // ─────────────────────────────────────────────

    async attachFile(stub, params) {
        if (params.length !== 4) return shim.error('Expected: taskId, fileName, ipfsCid, actorId');
        const [taskId, fileName, ipfsCid, actorId] = params;

        const ctx = await this._taskForWork(stub, taskId, actorId, 'attach files');
        if (ctx.error) return shim.error(ctx.error);
        const task = ctx.task;
        if (task.status === 'done') return shim.error(`Cannot attach files to a completed task`);

        // Check for duplicate CID
        if (task.attachments.find(a => a.cid === ipfsCid)) {
            return shim.error(`File with CID ${ipfsCid} already attached to task ${taskId}`);
        }

        task.attachments.push({ fileName, cid: ipfsCid });
        await stub.putState(taskKey(taskId), Buffer.from(JSON.stringify(task)));
        return shim.success(Buffer.from(JSON.stringify(task)));
    }

    // ─────────────────────────────────────────────
    // USER / AUTH FUNCTIONS
    // ─────────────────────────────────────────────
    //
    // Login accounts live on the ledger like everything else in this system,
    // so account creation, password changes, Google link/unlink and email
    // confirmation are all transactions with a permanent audit trail
    // (see getUserHistory). Two constraints shape this section:
    //
    // 1. Hashing must NEVER happen inside chaincode. scrypt/bcrypt use a
    //    random salt per call — if every peer hashed independently during
    //    endorsement each would produce a different hash and the transaction
    //    could never reach agreement. The backend hashes once, off-chain, and
    //    passes the finished hash string in as a plain parameter.
    // 2. LevelDB has no queries, so username/phone/Google uniqueness is kept
    //    with index keys written in the same transaction as the user record.
    //
    // Sessions (the login cookie) are deliberately NOT on the ledger: they are
    // short-lived, high-churn infrastructure rather than business records.

    _toUser(data) {
        const u = JSON.parse(data.toString());
        return {
            docType: 'user',
            email: u.email,
            name: u.name,
            username: u.username || '',
            phone: u.phone || '',
            passwordHash: u.passwordHash || '',
            googleId: u.googleId || '',
            googlePicture: u.googlePicture || '',
            emailVerifiedAt: u.emailVerifiedAt || '',
            passwordChanges: u.passwordChanges || 0,
            authProviders: u.authProviders || [],
            projectIds: u.projectIds || [],
            createdAt: u.createdAt || ''
        };
    }

    async _loadUser(stub, email) {
        const data = await stub.getState(userKey(email));
        if (!data || data.length === 0) return null;
        return this._toUser(data);
    }

    async _saveUser(stub, user) {
        await stub.putState(userKey(user.email), Buffer.from(JSON.stringify(user)));
    }

    async registerUser(stub, params) {
        // params: email, name, username, phone, passwordHash, authProvider,
        //         googleId, googlePicture, emailVerified ('true' | 'false')
        // - passwordHash: '' if this account only ever uses Google sign-in
        // - googleId / googlePicture: '' for plain email/password accounts
        // - phone: '' when not given
        if (params.length !== 9) {
            return shim.error('Expected: email, name, username, phone, passwordHash, authProvider, googleId, googlePicture, emailVerified');
        }
        const [emailRaw, nameRaw, usernameRaw, phone, passwordHash, authProvider, googleId, googlePicture, emailVerified] = params;

        if (!['email', 'google'].includes(authProvider)) {
            return shim.error('authProvider must be one of: email, google');
        }

        const email = emailRaw.trim().toLowerCase();
        if (!email || email.length > 254 || !email.includes('@')) return shim.error('A valid email is required');

        const name = nameRaw.trim();
        if (name.length < 1 || name.length > 80) return shim.error('Name must be 1-80 characters');

        const username = usernameRaw.trim().replace(/^@/, '').toLowerCase();
        if (!USERNAME_RE.test(username) || /[._]{2}/.test(username)) {
            return shim.error('Username must be 3-24 characters: letters, digits, "." or "_", not starting with a symbol and with no two symbols in a row');
        }
        if (RESERVED_USERNAMES.has(username)) return shim.error(`Username @${username} is reserved`);

        if (phone && !PHONE_RE.test(phone)) {
            return shim.error('Phone number must be in international format, e.g. +491701234567');
        }
        if (authProvider === 'email' && !passwordHash) return shim.error('A password hash is required for email accounts');
        if (authProvider === 'google' && !googleId) return shim.error('A Google id is required for Google accounts');

        const existing = await stub.getState(userKey(email));
        if (existing && existing.length > 0) return shim.error(`User ${email} already exists`);

        const uTaken = await stub.getState(usernameKey(username));
        if (uTaken && uTaken.length > 0) return shim.error(`Username @${username} is already taken`);

        if (phone) {
            const pTaken = await stub.getState(phoneKey(phone));
            if (pTaken && pTaken.length > 0) return shim.error('That phone number is already used by another account');
        }
        if (googleId) {
            const gTaken = await stub.getState(googleKey(googleId));
            if (gTaken && gTaken.length > 0) return shim.error('That Google account is already linked to another user');
        }

        const now = txTime(stub);
        const user = {
            docType: 'user',
            email, name, username,
            phone: phone || '',
            passwordHash: passwordHash || '',
            googleId: googleId || '',
            googlePicture: googlePicture || '',
            emailVerifiedAt: emailVerified === 'true' ? now : '',
            passwordChanges: 0,
            authProviders: [authProvider],
            projectIds: [],
            createdAt: now
        };

        await this._saveUser(stub, user);
        await stub.putState(usernameKey(username), Buffer.from(email));
        if (phone) await stub.putState(phoneKey(phone), Buffer.from(email));
        if (googleId) await stub.putState(googleKey(googleId), Buffer.from(email));
        return shim.success(Buffer.from(JSON.stringify(user)));
    }

    async getUser(stub, params) {
        if (params.length !== 1) return shim.error('Expected: email');
        const user = await this._loadUser(stub, params[0]);
        if (!user) return shim.error(`User ${params[0]} does not exist`);
        return shim.success(Buffer.from(JSON.stringify(user)));
    }

    async getUserByUsername(stub, params) {
        if (params.length !== 1) return shim.error('Expected: username');
        const username = params[0].trim().replace(/^@/, '').toLowerCase();
        const idx = await stub.getState(usernameKey(username));
        if (!idx || idx.length === 0) return shim.error(`User @${username} does not exist`);
        const user = await this._loadUser(stub, idx.toString());
        if (!user) return shim.error(`User @${username} does not exist`);
        return shim.success(Buffer.from(JSON.stringify(user)));
    }

    async getUserByGoogleId(stub, params) {
        if (params.length !== 1) return shim.error('Expected: googleId');
        const idx = await stub.getState(googleKey(params[0]));
        if (!idx || idx.length === 0) return shim.error('No user is linked to that Google account');
        const user = await this._loadUser(stub, idx.toString());
        if (!user) return shim.error('No user is linked to that Google account');
        return shim.success(Buffer.from(JSON.stringify(user)));
    }

    async updatePasswordHash(stub, params) {
        // params: email, newPasswordHash — the backend has already verified the
        // current password and applied the password rules before calling this.
        if (params.length !== 2) return shim.error('Expected: email, newPasswordHash');
        const [email, newHash] = params;
        if (!newHash) return shim.error('A password hash is required');
        const user = await this._loadUser(stub, email);
        if (!user) return shim.error(`User ${email} does not exist`);
        user.passwordHash = newHash;
        user.passwordChanges = (user.passwordChanges || 0) + 1; // lets the activity feed tell "changed" apart
        if (!user.authProviders.includes('email')) user.authProviders.push('email');
        await this._saveUser(stub, user);
        return shim.success(Buffer.from(JSON.stringify(user)));
    }

    async linkGoogle(stub, params) {
        // params: email, googleId, googlePicture
        if (params.length !== 3) return shim.error('Expected: email, googleId, googlePicture');
        const [email, googleId, googlePicture] = params;
        if (!googleId) return shim.error('A Google id is required');

        const user = await this._loadUser(stub, email);
        if (!user) return shim.error(`User ${email} does not exist`);

        const owner = await stub.getState(googleKey(googleId));
        if (owner && owner.length > 0 && owner.toString() !== user.email) {
            return shim.error('That Google account is already linked to another user');
        }
        if (user.googleId && user.googleId !== googleId) {
            return shim.error('A different Google account is already connected. Disconnect it first.');
        }

        user.googleId = googleId;
        user.googlePicture = googlePicture || user.googlePicture;
        if (!user.authProviders.includes('google')) user.authProviders.push('google');
        await this._saveUser(stub, user);
        await stub.putState(googleKey(googleId), Buffer.from(user.email));
        return shim.success(Buffer.from(JSON.stringify(user)));
    }

    async unlinkGoogle(stub, params) {
        if (params.length !== 1) return shim.error('Expected: email');
        const user = await this._loadUser(stub, params[0]);
        if (!user) return shim.error(`User ${params[0]} does not exist`);
        if (!user.googleId) return shim.error('No Google account is connected');
        if (!user.passwordHash) {
            return shim.error('Set a password first, otherwise you could not sign in again.');
        }
        await stub.deleteState(googleKey(user.googleId));
        user.googleId = '';
        user.googlePicture = '';
        user.authProviders = user.authProviders.filter(p => p !== 'google');
        await this._saveUser(stub, user);
        return shim.success(Buffer.from(JSON.stringify(user)));
    }

    async markEmailVerified(stub, params) {
        if (params.length !== 1) return shim.error('Expected: email');
        const user = await this._loadUser(stub, params[0]);
        if (!user) return shim.error(`User ${params[0]} does not exist`);
        if (!user.emailVerifiedAt) {
            user.emailVerifiedAt = txTime(stub);
            await this._saveUser(stub, user);
        }
        return shim.success(Buffer.from(JSON.stringify(user)));
    }

    // The account's security audit trail, straight from the ledger history:
    // every sign-up, password change, Google link/unlink and email
    // confirmation is a transaction. Secrets (password hash, Google id) are
    // stripped — only booleans about them are returned.
    async getUserHistory(stub, params) {
        if (params.length !== 1) return shim.error('Expected: email');
        const iterator = await stub.getHistoryForKey(userKey(params[0]));
        const history = [];
        while (true) {
            const result = await iterator.next();
            if (result.done) break;
            if (result.value.is_delete) continue;
            const u = JSON.parse(result.value.value.toString());
            const ts = result.value.timestamp;
            const secs = ts && ts.seconds && typeof ts.seconds.toString === 'function'
                ? Number(ts.seconds.toString()) : Number(ts && ts.seconds);
            history.push({
                txId: result.value.tx_id,
                timestamp: secs ? new Date(secs * 1000).toISOString() : '',
                value: {
                    email: u.email,
                    username: u.username || '',
                    authProviders: u.authProviders || [],
                    hasPassword: !!u.passwordHash,
                    passwordChanges: u.passwordChanges || 0,
                    googleLinked: !!u.googleId,
                    emailVerified: !!u.emailVerifiedAt,
                    projectCount: (u.projectIds || []).length
                }
            });
        }
        await iterator.close();
        return shim.success(Buffer.from(JSON.stringify(history)));
    }

    async getMyProjects(stub, params) {
        if (params.length !== 1) return shim.error('Expected: email');
        const data = await stub.getState(userKey(params[0]));
        if (!data || data.length === 0) return shim.error(`User ${params[0]} does not exist`);

        const user = JSON.parse(data.toString());
        const projectIds = user.projectIds || [];
        const projects = [];
        for (const id of projectIds) {
            const pData = await stub.getState(projectKey(id));
            if (pData && pData.length > 0) projects.push(JSON.parse(pData.toString()));
        }
        return shim.success(Buffer.from(JSON.stringify(projects)));
    }

    // Returns every registered account as {email, name, username} only — never
    // passwordHash, phone or googleId — so the frontend can offer a "pick a
    // person by name" list instead of making anyone type or see raw email
    // addresses. All user records share the "user:" key prefix, and
    // LevelDB (unlike CouchDB) does support plain range scans over keys
    // even without rich-query support, so this is a simple getStateByRange.
    async getAllUsers(stub) {
        const iterator = await stub.getStateByRange('user:', 'user:~');
        const users = [];
        while (true) {
            const result = await iterator.next();
            if (result.done) break;
            const user = JSON.parse(result.value.value.toString());
            users.push({ email: user.email, name: user.name, username: user.username || '' });
        }
        await iterator.close();
        return shim.success(Buffer.from(JSON.stringify(users)));
    }
};

module.exports = { PMChaincode };

// Started normally by the Fabric peer. Tests load this file with
// PM_CHAINCODE_NO_START=1 so they can drive the contract on a mock stub.
if (process.env.PM_CHAINCODE_NO_START !== '1') {
    shim.start(new PMChaincode());
}
