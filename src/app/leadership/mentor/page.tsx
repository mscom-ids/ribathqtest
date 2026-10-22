"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import MentorDashboard from "@/components/staff/MentorDashboard"

/** The mentor workflow is entered explicitly, never overlaid on the overview. */
export default function FocusedMentorPage() {
  const [ready, setReady] = useState(false)
  const router = useRouter()
  useEffect(() => {
    if (sessionStorage.getItem("mentorFocus") === "1" && sessionStorage.getItem("delegationToken")) setReady(true)
    else router.replace("/leadership")
  }, [router])
  return ready ? <MentorDashboard /> : <p className="p-6 text-slate-500">Opening focused class…</p>
}
