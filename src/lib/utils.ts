import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Backend origin. In production, we proxy /api and /public to the actual backend,
// so we just return empty string to use relative paths. In dev, use localhost:5000.
export const BACKEND_ORIGIN = process.env.NODE_ENV === 'production' 
  ? "" 
  : "http://localhost:5000"

// Resolve a possibly-relative photo / file URL to an absolute one.
// Backend stores relative paths like "/public/avatars/foo.jpg" — those need
// the backend origin prefixed. Absolute URLs (http/https) pass through.
export function resolveBackendUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (/^https?:\/\//i.test(url)) return url
  return `${BACKEND_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`
}
