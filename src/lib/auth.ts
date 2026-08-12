import api from '@/lib/api'

// sessionStorage key for the cached role.
// Cleared on logout; refreshed on every successful /auth/me response.
const ROLE_CACHE_KEY = '__urole'

/**
 * Synchronously read the cached role from sessionStorage.
 * Returns null on the server (SSR) or if the cache is empty.
 * Use this for zero-latency initial state to avoid layout flicker.
 */
export function getUserRoleSync(): string | null {
    try {
        return typeof window !== 'undefined' ? sessionStorage.getItem(ROLE_CACHE_KEY) : null
    } catch {
        return null
    }
}

/** Wipe the role cache — call this on logout. */
export function clearRoleCache(): void {
    try {
        if (typeof window !== 'undefined') sessionStorage.removeItem(ROLE_CACHE_KEY)
    } catch { /* ignore */ }
}

export async function getUserRole() {
    // Return the cached role immediately if available; still re-fetches below
    // so the cache stays fresh, but callers see the value without waiting.
    const cached = getUserRoleSync()
    if (cached) {
        // Background refresh — don't await so callers aren't blocked
        api.get('/auth/me').then(r => {
            const fresh = r.data?.user?.role
            if (fresh && fresh !== cached) {
                try { sessionStorage.setItem(ROLE_CACHE_KEY, fresh) } catch { /* ignore */ }
            }
        }).catch(() => { /* non-critical */ })
        return cached
    }

    try {
        const response = await api.get('/auth/me')
        if (response.data?.success && response.data?.user?.role) {
            const role: string = response.data.user.role
            try { sessionStorage.setItem(ROLE_CACHE_KEY, role) } catch { /* ignore */ }
            return role
        }
        return null
    } catch {
        return null
    }
}

export const getRedirectPathForRole = (role: string) => {
    switch (role) {
        case 'admin':
            return '/admin'
        case 'principal':
        case 'vice_principal':
            return '/staff'
        case 'controller':
            return '/admin'
        case 'staff':
        case 'usthad':
        case 'mentor':
            return '/staff'
        case 'parent':
            return '/parent'
        default:
            return '/staff' // Default to staff portal instead of homepage
    }
}
