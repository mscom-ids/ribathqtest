"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeCacheKey = makeCacheKey;
exports.getCached = getCached;
exports.setCached = setCached;
exports.cachedResult = cachedResult;
exports.invalidateCacheByPrefix = invalidateCacheByPrefix;
const store = new Map();
const inflight = new Map();
function makeCacheKey(scope, parts) {
    if (!parts)
        return scope;
    const normalized = Object.keys(parts)
        .sort()
        .map((key) => `${key}=${String(parts[key] ?? '')}`)
        .join('&');
    return normalized ? `${scope}:${normalized}` : scope;
}
function getCached(key) {
    const entry = store.get(key);
    if (!entry)
        return undefined;
    if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
    }
    return entry.value;
}
function setCached(key, value, ttlMs) {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
}
async function cachedResult(key, ttlMs, producer) {
    const hit = getCached(key);
    if (hit !== undefined)
        return hit;
    const existing = inflight.get(key);
    if (existing)
        return existing;
    const pending = producer()
        .then((value) => setCached(key, value, ttlMs))
        .finally(() => inflight.delete(key));
    inflight.set(key, pending);
    return pending;
}
function invalidateCacheByPrefix(prefix) {
    let removed = 0;
    for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
            store.delete(key);
            removed++;
        }
    }
    return removed;
}
