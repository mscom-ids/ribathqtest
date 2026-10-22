"use client"

import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, Users, CalendarCheck, DoorOpen, FileText, ShieldAlert, MessageCircle, Landmark, LogOut, Loader2 } from "lucide-react"
import api from "@/lib/api"
import { clearRoleCache } from "@/lib/auth"
import { clearMentorFocus } from "@/lib/mentor-focus"
import { ModeToggle } from "@/components/mode-toggle"
import { resolveBackendUrl } from "@/lib/utils"

type Leader = { id: string; name: string; role: string; photo_url?: string | null }
const LeadershipContext = createContext<Leader | null>(null)
export function useLeadershipIdentity() {
  const identity = useContext(LeadershipContext)
  if (!identity) throw new Error("Leadership features require LeadershipShell")
  return identity
}

const navigation = [
  { href: "/leadership", label: "Overview", icon: LayoutDashboard },
  { href: "/leadership/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/leadership/leaves", label: "Leaves", icon: DoorOpen },
  { href: "/leadership/reports", label: "Reports", icon: FileText },
  { href: "/leadership/disciplinary", label: "Discipline", icon: ShieldAlert },
  { href: "/leadership/chat", label: "Chat", icon: MessageCircle },
  { href: "/leadership/finance", label: "Finance", icon: Landmark },
]

/** Independent shell: never mounts StaffLayout or changes mentor/leader branding. */
export function LeadershipShell({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Leader | null>(null)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const [focusedName, setFocusedName] = useState<string | null>(null)
  const pathname = usePathname()
  const router = useRouter()

  useLayoutEffect(() => {
    // Leave the delegated mentor scope before an overview child starts fetching.
    if (pathname === "/leadership" && sessionStorage.getItem("mentorFocus") === "1") clearMentorFocus()
    setFocusedName(sessionStorage.getItem("mentorFocus") === "1" ? sessionStorage.getItem("delegationMentorName") : null)
  }, [pathname])

  useEffect(() => {
    let active = true
    setError("")
    // /auth/me always identifies the signed-in leader, even during Mentor Focus.
    api.get("/auth/me").then(response => {
      if (!active) return
      const user = response.data?.user as Leader | undefined
      if (!user || !["principal", "vice_principal", "admin", "controller"].includes(user.role)) {
        router.replace("/login")
        return
      }
      setIdentity(user)
    }).catch(() => { if (active) setError("Could not load your leadership profile. Please retry.") })
    return () => { active = false }
  }, [router, attempt])

  async function signOut() {
    try { await api.post("/auth/logout") } catch { /* Session cleanup still runs if the network is unavailable. */ } finally {
      clearMentorFocus()
      clearRoleCache()
      router.replace("/login")
    }
  }

  const items = focusedName ? [navigation[0], { href: "/leadership/mentor", label: "Focused class", icon: Users }, ...navigation.slice(1)] : navigation
  return <div className="leadership-portal min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100" data-portal="leadership">
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        <Link href="/leadership" className="flex shrink-0 items-center gap-2 font-bold text-indigo-600 dark:text-indigo-300"><img src="/logo.png" alt="Ribathul Quran" className="h-8 w-8 object-contain" /><span>Leadership Portal</span></Link>
        <div className="ml-auto flex items-center gap-2">
          {identity && <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-sm dark:bg-slate-800">{identity.photo_url && <img src={resolveBackendUrl(identity.photo_url)} alt="" className="h-7 w-7 rounded-full object-cover" />}<span className="max-w-36 truncate">{identity.name}</span></div>}
          <ModeToggle /><button type="button" onClick={() => void signOut()} aria-label="Sign out" className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><LogOut className="h-5 w-5" /></button>
        </div>
        <nav aria-label="Leadership navigation" className="flex w-full flex-wrap gap-1 lg:order-none lg:w-auto">
          {items.map(item => { const active = pathname === item.href || (item.href !== "/leadership" && pathname.startsWith(item.href + "/")); const Icon = item.icon; return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium md:text-sm ${active ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}><Icon className="h-4 w-4" />{item.label}</Link> })}
        </nav>
      </div>
    </header>
    {focusedName && <div className="border-b border-indigo-200 bg-indigo-50 px-5 py-2 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">Mentor Focus: {focusedName}<Link href="/leadership" className="ml-4 font-semibold underline">Exit focus</Link></div>}
    <main className="mx-auto w-full max-w-[1600px] pb-6">
      {error ? <div role="alert" className="m-6 rounded-xl border border-amber-200 p-5">{error}<button type="button" className="ml-3 font-semibold underline" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : identity ? <LeadershipContext.Provider value={identity}>{children}</LeadershipContext.Provider> : <div className="flex min-h-[50vh] items-center justify-center gap-3 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Loading leadership portal…</div>}
    </main>
  </div>
}
