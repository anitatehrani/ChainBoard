# ChainBoard: evaluation method and threat model

Material for the thesis evaluation chapter. Nothing here has numbers yet: run the benchmark on your own machine and paste the results.

## 1. Performance evaluation

### What is measured

`npm run benchmark` (in `pm-backend`, with the network, chaincode and backend running) sends real requests through the backend to the Fabric network. Every write is a complete transaction: proposal, endorsement, ordering, validation, commit. The script creates its own throw-away account and project (`bench-…`) and never touches other data.

| Phase | What it does | What it shows |
|---|---|---|
| Write latency | `createTask`, one request at a time | The cost of one transaction end to end (p50, p95, max) |
| Write throughput | the same, with 1, 2, 4, 8 concurrent requests on different keys | How throughput scales until the ordering service or block timeout dominates |
| Contention | 8 writers editing the same task at once | Fabric's optimistic concurrency: one write per block wins, the rest get an MVCC read conflict (reported as HTTP 409 "ledger was busy") |
| Read latency | `GET` one task, `GET` all tasks of a project | Queries do not need ordering, so they are much faster; the project query is a range scan |

Settings: `WRITES=100 READS=300 LEVELS=1,2,4,8,16 CONTENDERS=8 npm run benchmark`. Output: a table in the terminal plus `benchmark-results.json` and `benchmark-results.csv` (the JSON includes the machine description).

### How to run it for the thesis

1. Close other heavy programs. Run on a fresh network (`./network.sh down`, then up and deploy) so the ledger size is the same each time.
2. Run the benchmark **at least 3 times** and report the median run (or mean and standard deviation of the p50). Never report a single run.
3. Record the environment: CPU model and core count, RAM, WSL2 or native Linux, Docker version, Fabric version, block batch timeout (the test network default is 2 seconds, which sets a floor on write latency), number of peers and orderers.
4. Report latencies as p50 and p95, not only the mean, and always report the number of failures.

### Expected shape (to check against your numbers, not to quote)

- Writes are dominated by the ordering service's **batch timeout**, so a single write usually takes about as long as the timeout plus endorsement and commit time. Throughput rises with concurrency because several transactions share a block, then flattens.
- Reads take a few milliseconds to tens of milliseconds, far below writes.
- Under contention on one key, roughly one writer per block succeeds. This is correct behaviour and a design constraint: avoid hot keys (the chaincode already uses one key per task and per account, and index keys written in the same transaction).

### Comparison with a conventional database (recommended for the discussion)

The same API against a conventional database would show lower latency and higher throughput. State this honestly and argue what the extra cost buys: tamper-evident history, no single administrator who can rewrite it, and multi-organisation trust. A suitable baseline is the same benchmark against a PostgreSQL-backed version of one endpoint (`createTask`); this repository does not include that baseline, so describe it as future work or add it yourself.

### Limits of this measurement

- It measures the whole stack (browser-free HTTP client, Express, gateway, a single-machine test network), not Fabric alone.
- The test network runs 2 peers and 1 orderer on one machine, so it says nothing about a geographically distributed deployment.
- The load generator and the network share the same CPU.

## 2. Threat model

### Assets

Account records (including password hashes), projects and memberships, tasks, comments, attachment references, and above all the **history** of every change.

### Trust assumptions

- The Fabric network (peers, orderer, certificate authority) is operated honestly enough that no single party controls endorsement and ordering.
- The **backend is a trusted gateway**: it holds the organisation's Fabric identity, verifies the user's login session, and tells the chaincode who the acting person is.
- Browsers are untrusted.

### What the blockchain protects against

| Threat | Protection |
|---|---|
| An administrator or database operator quietly changes a status, due date or comment | Every change is an endorsed transaction; the previous versions stay in the history and cannot be removed. The audit report's SHA-256 digest chain and the per-transaction ledger check make an altered history detectable |
| Someone rewrites history in a copy of the data | The downloaded audit report can be re-verified offline (`npm run verify-audit -- file.json`); any edit breaks the digests |
| Two people claim the same username, phone number or Google account | Uniqueness is enforced by index keys written in the same transaction as the account; Fabric's MVCC check rejects the second writer |
| A user performs an action their role does not allow, even if the backend has a bug | The **chaincode** checks the role of the acting person for every state-changing call (owner, admin, contributor, non-member) |
| Non-deterministic behaviour breaking endorsement | The chaincode uses no clocks, randomness or hashing; timestamps come from the transaction |

### What it does not protect against (be honest about these)

| Threat | Why it remains | Mitigation or future work |
|---|---|---|
| **A compromised or malicious backend** | Fabric sees only the backend's organisation identity, so the chaincode must trust the actor id the backend sends. A hacked backend could claim to be the owner | Per-user Fabric identities (one certificate per person, issued by the Fabric CA) so the chaincode reads the caller from `ctx.clientIdentity`; or multi-organisation endorsement of sensitive actions |
| A malicious **organisation** controlling all endorsers | The test network has two organisations but a single trust domain here | An endorsement policy requiring both organisations for critical transactions |
| Stolen login session or password | Standard web risk | scrypt hashing, HttpOnly SameSite cookie, hashed session tokens, rate limiting, CSRF check, password change signs out other devices |
| Reading data | Reads are not restricted by role (any signed-in user can read a project by its ID) | Role-checked reads, or Fabric private data collections |
| Attachment bytes changing or disappearing | IPFS addresses content by hash, so changed bytes get a different CID, but nothing forces anyone to keep the file | Pinning, and verifying the CID on download |
| Privacy: ledger data is permanent | A name or comment written to the ledger cannot be erased, which conflicts with a "right to erasure" | Keep personal data off-chain or in private data collections; store only hashes on-chain |
| Denial of service | A flood of transactions slows ordering | Rate limiting at the backend, ordering-service limits |

### The actor-id design choice, in one paragraph

Fabric's gateway authenticates the **client organisation**, not each end user. ChainBoard therefore authenticates people at the backend (login session), and passes the person's email to the chaincode as the *actor*, which the chaincode checks against the project's member roles. The ledger enforces the *rules* (who may do what), and the backend is trusted to say *who* is asking. The honest next step would be one Fabric identity per user.
