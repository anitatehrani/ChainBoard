'use strict';

// The only place that talks to Hyperledger Fabric. The rest of the backend
// uses a tiny interface:
//     ledger.submit(fn, ...args)    -> parsed JSON  (a real, endorsed transaction)
//     ledger.evaluate(fn, ...args)  -> parsed JSON  (a read-only query)
// Tests plug in a different implementation that runs the real chaincode on an
// in-memory mock stub, so the auth logic can be tested without a network.

class LedgerError extends Error {
    constructor(message, kind = 'chaincode') {
        super(message);
        this.name = 'LedgerError';
        // 'chaincode' (a rule said no), 'not-found', 'conflict' or 'network'
        this.kind = kind;
    }
}

// Extracts the real chaincode-level reason out of a fabric-gateway error.
// fabric-gateway wraps everything in a generic "10 ABORTED: failed to endorse
// transaction..." message, with the actual reason (the string passed to
// shim.error(...) in the chaincode) buried in err.details/err.cause as
// something like "chaincode response 500, Project 1 already exists".
function formatError(err) {
    const raw = err.message || String(err);
    const extras = [];
    if (Array.isArray(err.details)) extras.push(...err.details.map(d => d.message || JSON.stringify(d)));
    if (err.cause) extras.push(err.cause.message || JSON.stringify(err.cause));
    const combined = [raw, ...extras].join(' | ');

    const match = combined.match(/chaincode response \d+,\s*(.+?)(?:"|$)/);
    // The lazy match can run on into the " | 10 ABORTED..." wrapper text; keep only the reason.
    if (match) return match[1].split(' | ')[0].trim();
    return (extras.find(Boolean) || raw).split(' | ')[0].trim();
}

function classify(message, err) {
    if (/does not exist|No user is linked/i.test(message)) return 'not-found';
    if (/MVCC_READ_CONFLICT|PHANTOM_READ_CONFLICT/i.test(message + (err && err.message))) return 'conflict';
    if (/ECONNREFUSED|UNAVAILABLE|No connection established/i.test(message)) return 'network';
    return 'chaincode';
}

function createFabricLedger(config) {
    const fs = require('node:fs');
    const path = require('node:path');
    const crypto = require('node:crypto');
    const grpc = require('@grpc/grpc-js');
    const { connect, hash, signers } = require('@hyperledger/fabric-gateway');

    const crypto_path = path.resolve(
        process.env.HOME,
        'fabric-samples/test-network/organizations/peerOrganizations/org1.example.com'
    );
    const TLS_CERT = path.join(crypto_path, 'peers/peer0.org1.example.com/tls/ca.crt');
    const KEY_DIR = path.join(crypto_path, 'users/Admin@org1.example.com/msp/keystore');
    // cryptogen names it "Admin@org1.example.com-cert.pem"; Fabric CA names it "cert.pem".
    const CERT_DIR = path.join(crypto_path, 'users/Admin@org1.example.com/msp/signcerts');
    const certFile = () => path.join(CERT_DIR, fs.readdirSync(CERT_DIR).find(f => f.endsWith('.pem')));

    async function withContract(work, chaincodeName = config.chaincode) {
        const tls = grpc.credentials.createSsl(fs.readFileSync(TLS_CERT));
        const client = new grpc.Client(config.peerAddr, tls, {
            'grpc.ssl_target_name_override': config.peerHost
        });
        const keyFile = fs.readdirSync(KEY_DIR)[0];
        const privateKey = crypto.createPrivateKey(fs.readFileSync(path.join(KEY_DIR, keyFile)));
        const gateway = connect({
            client,
            identity: { mspId: config.mspId, credentials: fs.readFileSync(certFile()) },
            signer: signers.newPrivateKeySigner(privateKey),
            hash: hash.sha256
        });
        try {
            const contract = gateway.getNetwork(config.channel).getContract(chaincodeName);
            return await work(contract);
        } finally {
            gateway.close();
            client.close();
        }
    }

    async function run(kind, fn, args) {
        try {
            const bytes = await withContract(contract => contract[kind](fn, ...args.map(String)));
            const text = Buffer.from(bytes).toString();
            return text ? JSON.parse(text) : null;
        } catch (err) {
            console.error(err);
            const message = formatError(err);
            throw new LedgerError(message, classify(message, err));
        }
    }

    // Asks the peer's system chaincode (qscc) whether a transaction id is in a committed block.
    //   true  = found, false = the peer says it does not know it, null = could not ask.
    async function checkTx(txId) {
        try {
            const bytes = await withContract(
                qscc => qscc.evaluateTransaction('GetTransactionByID', config.channel, String(txId)),
                'qscc'
            );
            return Buffer.from(bytes).length > 0;
        } catch (err) {
            const message = formatError(err);
            if (/not found|no such transaction|could not find/i.test(message)) return false;
            return null;
        }
    }

    return {
        submit: (fn, ...args) => run('submitTransaction', fn, args),
        evaluate: (fn, ...args) => run('evaluateTransaction', fn, args),
        checkTx
    };
}

module.exports = { LedgerError, formatError, classify, createFabricLedger };
