import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Backend origin (the API server, without /api). Derived from
// NEXT_PUBLIC_API_URL so dev (localhost:5000) and prod (deployed origin)
// both work without code changes.
export const BACKEND_ORIGIN = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"
).replace(/\/api\/?$/, "")

// Resolve a possibly-relative photo / file URL to an absolute one.
// Backend stores relative paths like "/public/avatars/foo.jpg" — those need
// the backend origin prefixed. Absolute URLs (http/https) pass through.
export function resolveBackendUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (/^https?:\/\//i.test(url)) return url
  return `${BACKEND_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`
}
