export class PortalRequestError extends Error {
    constructor(message: string, public status: number) { super(message) }
}
const inflight = new Map<string, { promise: Promise<unknown>; controller: AbortController }>()

// Share in-flight GETs only (including React development remounts), never saved
// responses. Mutations clear them so logout/reset cannot reuse an earlier read.
export function portalRequest<T = Record<string, unknown>>(url: string, body?: unknown): Promise<T> {
    if (body === undefined) {
        const pending = inflight.get(url)
        if (pending) return pending.promise as Promise<T>
    } else inflight.clear()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const pending = (async () => {
        try {
            const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', credentials: 'include', cache: 'no-store', signal: controller.signal,
                headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
            const data = await response.json().catch(() => { throw new Error('The exam service is unavailable. Please try again.') })
            if (!response.ok) throw new PortalRequestError(data.error || 'Unable to complete this request.', response.status)
            return data as T
        } catch (error) {
            if (controller.signal.aborted) throw new Error('The connection took too long. Please try again; your saved marks are safe.')
            throw error
        } finally {
            clearTimeout(timer)
            if (body !== undefined) inflight.clear()
            else if (inflight.get(url)?.controller === controller) inflight.delete(url)
        }
    })()
    if (body === undefined) inflight.set(url, { promise: pending, controller })
    return pending
}
