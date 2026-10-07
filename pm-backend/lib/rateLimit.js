'use strict';

// Small in-memory sliding-window limiter. NOTE: limits are per process; if you
// ever run several backend instances, move this to Redis.

function createLimiter({ windowMs, max, now = () => Date.now() }) {
    const hits = new Map(); // key -> [timestamps]

    function prune(list, t) {
        const cutoff = t - windowMs;
        while (list.length && list[0] <= cutoff) list.shift();
    }

    return {
        // Counts one attempt for `key`. Returns { allowed, retryAfterSec }.
        hit(key) {
            const t = now();
            let list = hits.get(key);
            if (!list) { list = []; hits.set(key, list); }
            prune(list, t);
            if (list.length >= max) {
                const retryAfterSec = Math.max(1, Math.ceil((list[0] + windowMs - t) / 1000));
                return { allowed: false, retryAfterSec };
            }
            list.push(t);
            return { allowed: true, retryAfterSec: 0 };
        },
        reset(key) { hits.delete(key); },
        sweep() {
            const t = now();
            for (const [key, list] of hits) {
                prune(list, t);
                if (!list.length) hits.delete(key);
            }
        }
    };
}

// Sends the friendly 429 and returns true when the attempt is NOT allowed.
function rejectIfLimited(res, result) {
    if (result.allowed) return false;
    const minutes = Math.ceil(result.retryAfterSec / 60);
    res.set('Retry-After', String(result.retryAfterSec));
    res.status(429).json({
        error: `Too many attempts. Please wait about ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`
    });
    return true;
}

module.exports = { createLimiter, rejectIfLimited };
