# ChainBoard: web client

React + Vite client for **ChainBoard**, a decentralized project management system built on
Hyperledger Fabric (accounts, projects, tasks and their audit trails) and IPFS (attachments).
Master's thesis project, Università di Genova (DIBRIS).

```
npm install
npm run dev     # http://localhost:5173, proxies /api to the backend on :3000
npm test        # unit tests for the screen logic (Node's built-in runner)
npm run build   # production build into dist/ (served by the backend)
```

The backend lives in `../pm-backend` (`npm run dev` there restarts it on every change),
the chaincode in `../pm-chaincode`. Design decisions per screen are in `docs/DESIGN.md`.
