'use strict';

// Minimal stand-in for `fabric-shim`, so the real chaincode file can be loaded
// and driven in tests without a Fabric network (or the real shim installed).
// Same return shapes as the real shim: success -> status 200 + payload,
// error -> status 500 + message.

module.exports = {
    success(payload) { return { status: 200, payload: payload || Buffer.alloc(0) }; },
    error(message) { return { status: 500, message }; },
    start() { /* never started in tests */ }
};
