// Lightweight in-memory GET cache + in-flight request dedup.
// For static-ish endpoints (staff list, academic years, calendar policies)
// that are called from many components within the same session.
//
// Usage:
//   import { cachedGet, invalidateCache } from "@/lib/api-cache"
//   const res = await cachedGet("/staff", undefined, 60_000)   // 60s TTL
//   const res = await cachedGet("/classes/academic-years", undefined, 5 * 60_000)
//
// Call invalidateCache("/staff") after a mutation that affects the data.

import api from "./api"
import type { AxiosRequestConfig, AxiosResponse } from "axios"

const DEFAULT_TTL_MS = 60_000 // 1 minute

type Entry = { promise: Promise<AxiosResponse>; expiresAt: number }
const cache = new Map<string, Entry>()

function buildKey(url: string, params?: Record<string, unknown>): string {
    if (!params) return url
    // Stable JSON: sort keys so different orderings hit the same cache entry.
    const sorted = Object.keys(params)
        .sort()
        .reduce((acc, k) => { acc[k] = params[k]; return acc }, {} as Record<string, unknown>)
    return `${url}?${JSON.stringify(sorted)}`
}

export async function cachedGet<T = any>(
    url: string,
    params?: Record<string, unknown>,
    ttlMs: number = DEFAULT_TTL_MS,
    extraConfig?: AxiosRequestConfig,
): Promise<AxiosResponse<T>> {
    const key = buildKey(url, params)
    const now = Date.now()
    const hit = cache.get(key)

    // Return existing promise if it's still fresh OR still in flight.
    // (An in-flight promise has expiresAt > now anyway; once it resolves
    // we leave the entry in place until expiry.)
    if (hit && hit.expiresAt > now) return hit.promise as Promise<AxiosResponse<T>>

    const promise = api.get<T>(url, { ...extraConfig, params })
        .catch(err => {
            // Don't cache failures — drop the entry so next call retries.
            cache.delete(key)
            throw err
        })

    cache.set(key, { promise, expiresAt: now + ttlMs })
    return promise as Promise<AxiosResponse<T>>
}

// Invalidate by exact url or by url-prefix (e.g. invalidateCache("/staff")
// drops both "/staff" and "/staff?{...}" variants).
export function invalidateCache(urlPrefix?: string) {
    if (!urlPrefix) { cache.clear(); return }
    for (const key of cache.keys()) {
        if (key === urlPrefix || key.startsWith(urlPrefix + "?")) {
            cache.delete(key)
        }
    }
}
