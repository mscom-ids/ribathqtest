type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

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

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = producer()
    .then((value) => setCached(key, value, ttlMs))
    .finally(() => inflight.delete(key));

  inflight.set(key, pending);
  return pending;
}

export function invalidateCacheByPrefix(prefix: string): number {
  let removed = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      removed++;
    }
  }
  return removed;
}
