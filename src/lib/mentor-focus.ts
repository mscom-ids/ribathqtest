import { invalidateCache } from "@/lib/api-cache"

export function clearMentorFocus() {
  for (const key of ["delegationToken", "delegationMentorName", "delegationStudentName", "mentorFocus"]) sessionStorage.removeItem(key)
  invalidateCache()
}

export function setMentorFocus(token: string, mentorName: string) {
  if (!token || !mentorName) throw new Error("Missing mentor focus context")
  sessionStorage.setItem("delegationToken", token)
  sessionStorage.setItem("delegationMentorName", mentorName)
  sessionStorage.setItem("mentorFocus", "1")
  sessionStorage.removeItem("delegationStudentName")
  invalidateCache()
}
