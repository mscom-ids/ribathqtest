"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeCacheKey = makeCacheKey;
exports.getCached = getCached;
exports.setCached = setCached;
exports.cachedResult = cachedResult;
exports.invalidateCacheByPrefix = invalidateCacheByPrefix;
const store = new Map();
const inflight = new Map();
const generations = new Map();
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
        if (!inflight.has(key))
            generations.delete(key);
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
    const generation = generations.get(key) || 0;
    const existing = inflight.get(key);
    if (existing?.generation === generation)
        return existing.promise;
    let pending;
    pending = producer()
        .then((value) => {
        if ((generations.get(key) || 0) === generation) {
            setCached(key, value, ttlMs);
        }
        return value;
    })
        .finally(() => {
        if (inflight.get(key)?.promise === pending)
            inflight.delete(key);
        if (!inflight.has(key) && !store.has(key))
            generations.delete(key);
    });
    inflight.set(key, { generation, promise: pending });
    return pending;
}
function invalidateCacheByPrefix(prefix) {
    let removed = 0;
    const affectedKeys = new Set([
        ...Array.from(store.keys()).filter((key) => key.startsWith(prefix)),
        ...Array.from(inflight.keys()).filter((key) => key.startsWith(prefix)),
    ]);
    for (const key of affectedKeys) {
        if (store.delete(key))
            removed++;
        if (inflight.has(key)) {
            generations.set(key, (generations.get(key) || 0) + 1);
            inflight.delete(key);
        }
        else {
            generations.delete(key);
        }
    }
    return removed;
}
