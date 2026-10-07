'use strict';

// Google ID-token verification. The browser's Google Identity Services button
// returns a signed ID token; we verify its signature and audience (our own
// client id) with google-auth-library. No client secret and no redirect URIs
// are needed. We never trust a client-supplied email for Google sign-in — only
// what Google's signed token confirms.

function createGoogleVerifier(clientId) {
    if (!clientId) return null;
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(clientId);
    return async function verify(idToken) {
        const ticket = await client.verifyIdToken({ idToken, audience: clientId });
        const p = ticket.getPayload();
        return {
            email: String(p.email || '').toLowerCase(),
            emailVerified: p.email_verified === true,
            name: p.name || '',
            googleId: p.sub,
            picture: p.picture || ''
        };
    };
}

module.exports = { createGoogleVerifier };
