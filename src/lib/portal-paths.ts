/** Feature pages can be shared without mounting another portal's layout. */
export function getStaffPortalBase(pathname?: string): "/leadership" | "/staff" {
  const path = pathname ?? (typeof window === "undefined" ? "" : window.location.pathname)
  return path === "/leadership" || path.startsWith("/leadership/") ? "/leadership" : "/staff"
}

export function getFocusDestination(role: string, entering: boolean): string {
  const leadership = role === "principal" || role === "vice_principal" || getStaffPortalBase() === "/leadership"
  return leadership ? "/leadership" : "/staff"
}
