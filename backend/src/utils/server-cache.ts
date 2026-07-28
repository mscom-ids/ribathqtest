type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type InflightEntry = {
  generation: number;
  promise: Promise<unknown>;
};

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, InflightEntry>();
const generations = new Map<string, number>();

export function makeCacheKey(scope: string, parts?: Record<string, unknown>): string {
  if (!parts) return scope;

  const normalized = Object.keys(parts)
    .sort()
    .map((key) => `${key}=${String(parts[key] ?? '')}`)
    .join('&');

  return normalized ? `${scope}:${normalized}` : scope;
}

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;

  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    if (!inflight.has(key)) generations.delete(key);
    return undefined;
  }

  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export async function cachedResult<T>(
  key: string,
  ttlMs: number,
  producer: () => Promise<T>
): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== undefined) return hit;

  const generation = generations.get(key) || 0;
  const existing = inflight.get(key);
  if (existing?.generation === generation) return existing.promise as Promise<T>;

  let pending: Promise<T>;
  pending = producer()
    .then((value) => {
      if ((generations.get(key) || 0) === generation) {
        setCached(key, value, ttlMs);
      }
      return value;
    })
    .finally(() => {
      if (inflight.get(key)?.promise === pending) inflight.delete(key);
      if (!inflight.has(key) && !store.has(key)) generations.delete(key);
    });

  inflight.set(key, { generation, promise: pending });
  return pending;
}

export function invalidateCacheByPrefix(prefix: string): number {
  let removed = 0;
  const affectedKeys = new Set([
    ...Array.from(store.keys()).filter((key) => key.startsWith(prefix)),
    ...Array.from(inflight.keys()).filter((key) => key.startsWith(prefix)),
  ]);

  for (const key of affectedKeys) {
    if (store.delete(key)) removed++;
    if (inflight.has(key)) {
      generations.set(key, (generations.get(key) || 0) + 1);
      inflight.delete(key);
    } else {
      generations.delete(key);
    }
  }
  return removed;
}