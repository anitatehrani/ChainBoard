# ChainBoard: authentication design (thesis notes)

The fundamentals of the project are unchanged: **accounts and every account
change are blockchain transactions**; everything else about a login session is
ordinary, short-lived infrastructure and stays off-chain on purpose.

## What lives where

| Concern | Where | Why |
|---|---|---|
| Account record (name, username, phone, email, password **hash**, Google id, projects) | **Ledger** (`user:<email>`) | The thesis requirement: accounts on-chain |
| Uniqueness of username / phone / Google id | **Ledger** index keys `idx:username:*`, `idx:phone:*`, `idx:google:*`, written in the same transaction as the account | LevelDB has no queries; one transaction = no race |
| Sign-up, password change, Google link/unlink, email confirmation | **Ledger** transactions → `getUserHistory` = tamper-proof security activity | Audit trail for free |
| Password hashing (scrypt) | Backend, once, off-chain | Chaincode must be deterministic; a salted hash is not |
| Login sessions (cookie `sid`, 30 days, sliding) | Backend store, SHA-256 hashed tokens (`data/sessions.json`) | High-churn, short-lived, no business value on-chain |
| Email confirmation tokens, email log, rate limits | Backend | Same |

## Flow

1. `POST /api/auth/signup` → backend validates (zod + password rules), hashes with scrypt (`scrypt$N$r$p$salt$key`), submits `registerUser`; chaincode re-validates username/phone, checks every uniqueness index and writes user + indexes atomically.
2. `POST /api/auth/login` → look up by email or username (index key), verify scrypt (a dummy hash is verified for unknown users so timing does not leak which accounts exist), create a server-side session, set the `HttpOnly; SameSite=Lax` cookie.
3. Every protected request: cookie → session hash → `req.user.email`. Project owner, comment author, etc. come from the verified session, never from the request body.
4. Google: Google Identity Services ID token verified with `google-auth-library`; sign-in **never** takes over an existing password account (409).

## Hardening

Origin/Host CSRF check on every state-changing request, no CORS, security headers, `Cache-Control: no-store` on `/api`, rate limits (per IP+identifier, per IP+account, per IP, per user for email), body limit 100 kB, clean 400/413 for bad bodies.

## Running the tests

```
cd pm-backend
npm install
npm test
```

The tests run the **real chaincode** (`pm-chaincode/index.js`) on an in-memory mock stub behind the real Express app — no Fabric network needed. `passwords.test.js` also proves the browser's password rules (`pm-frontend/src/lib/passwordRules.js`) match the server's.
