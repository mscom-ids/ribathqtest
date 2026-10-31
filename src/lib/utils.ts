import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Next proxies /public in both development and production. Use the portal host
// so phones/tablets never request their own localhost for an uploaded photo.
export const BACKEND_ORIGIN = ""

// Cloud photo URLs pass through; legacy upload paths use the same-origin proxy.
export function resolveBackendUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (/^(?:https?:\/\/|blob:|data:image\/)/i.test(url)) return url
  return `${BACKEND_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`
}
