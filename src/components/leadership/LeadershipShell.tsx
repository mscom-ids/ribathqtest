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
import { LeadershipMobileMenu } from "@/components/leadership/LeadershipMobileMenu"

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
  const primaryItems = navigation.slice(0, 4)
  const moreItems = items.filter(item => !primaryItems.some(primary => primary.href === item.href))
  const isActive = (href: string) => pathname === href || (href !== "/leadership" && pathname.startsWith(href + "/"))
  return <div className="leadership-portal min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100" data-portal="leadership">
    <header className="leadership-header border-b border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="leadership-header-grid mx-auto max-w-[1600px] px-4 py-3 lg:px-6">
        <Link href="/leadership" className="flex min-w-0 items-center gap-2.5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-700"><img src="/logo.png" alt="Ribathul Quran" className="h-8 w-8 object-contain" /></span><span className="min-w-0"><span className="block truncate text-[15px] font-bold tracking-tight text-slate-900 dark:text-white lg:text-base">Leadership Portal</span><span className="mt-0.5 block text-[10px] font-medium tracking-wide text-slate-400">Institution workspace</span></span></Link>
        <nav aria-label="Leadership navigation" className="leadership-desktop-nav gap-1.5">
          {items.map(item => { const active = isActive(item.href); const Icon = item.icon; return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium ${active ? "bg-slate-900 text-white shadow-sm dark:bg-indigo-500" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"}`}><Icon className="h-4 w-4" />{item.label}</Link> })}
        </nav>
        <div className="flex items-center justify-end gap-1 sm:gap-2">
          {identity && <div className="mr-1 hidden min-w-0 items-center gap-2.5 min-[380px]:flex sm:mr-2">{identity.photo_url ? <img src={resolveBackendUrl(identity.photo_url)} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-slate-200 dark:ring-slate-700" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xs font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-200">{identity.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span>}<span className="hidden min-w-0 sm:block"><span className="block max-w-36 truncate text-xs font-semibold">{identity.name}</span><span className="mt-0.5 block text-[10px] capitalize text-slate-400">{identity.role.replace(/_/g, " ")}</span></span></div>}
          <ModeToggle /><button type="button" onClick={() => void signOut()} aria-label="Sign out" className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><LogOut className="h-5 w-5" /></button>
        </div>
      </div>
    </header>
    {focusedName && <div className="border-b border-indigo-200 bg-indigo-50 px-5 py-2 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">Mentor Focus: {focusedName}<Link href="/leadership" className="ml-4 font-semibold underline">Exit focus</Link></div>}
    <main className="mx-auto w-full max-w-[1600px] pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-8">
      {error ? <div role="alert" className="m-6 rounded-xl border border-amber-200 p-5">{error}<button type="button" className="ml-3 font-semibold underline" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : identity ? <LeadershipContext.Provider value={identity}>{children}</LeadershipContext.Provider> : <div className="flex min-h-[50vh] items-center justify-center gap-3 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Loading leadership portal…</div>}
    </main>
    <nav aria-label="Leadership mobile navigation" className="leadership-mobile-nav fixed inset-x-0 bottom-0 z-[60] grid grid-cols-5 border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900 lg:hidden">
      {primaryItems.map(item => { const Icon = item.icon; const active = isActive(item.href); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`leadership-mobile-nav-item ${active ? "is-active" : ""}`}><span className="leadership-mobile-nav-icon"><Icon className="h-5 w-5" /></span><span>{item.label}</span></Link> })}
      <LeadershipMobileMenu items={moreItems} pathname={pathname} />
    </nav>
  </div>
}
