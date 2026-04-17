"use client"

import { Bell, Moon, Sun, Menu, Users, MessageSquare, PartyPopper, CheckCheck } from "lucide-react"
import { useState, useEffect, useRef, useCallback } from "react"
import { useTheme } from "next-themes"
import Cookies from "js-cookie"
import api from "@/lib/api"
import { cachedGet } from "@/lib/api-cache"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"

// ── Types ───────────────────────────────────────────────────────────────────
type Notification = {
    id: string
    type: "delegation" | "chat" | "event"
    title: string
    body: string
    href: string
    time: Date
    read: boolean
    initials?: string
    color?: string
}

function decodeUser(token: string) {
    try {
        const p = JSON.parse(atob(token.split('.')[1]))
        const roles: Record<string, string> = {
            admin: 'Administrator', principal: 'Principal',
            vice_principal: 'VP', controller: 'Controller', staff: 'Mentor'
        }
        return { name: p.name || 'Admin User', role: roles[p.role] || 'Staff', email: p.email || '' }
    } catch { return { name: 'Admin User', role: 'Administrator', email: '' } }
}

// ── Notification Bell ───────────────────────────────────────────────────────
function NotificationBell() {
    const [open, setOpen]             = useState(false)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [loading, setLoading]       = useState(false)
    const panelRef                    = useRef<HTMLDivElement>(null)

    // Close on outside click
    useEffect(() => {
        function onClick(e: MouseEvent) {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", onClick)
        return () => document.removeEventListener("mousedown", onClick)
    }, [])

    const fetchNotifications = useCallback(async () => {
        setLoading(true)
        try {
            // All 3 calls fire in parallel (was sequential).
            // /delegations + /events + /chat use cachedGet so navigating between
            // admin pages doesn't repeatedly re-hit the backend within the TTL.
            // /delegations now uses count_only mode + a separate small fetch
            // for the actual pending preview list — no more 3-table JOIN every
            // 60 seconds.
            const [delRes, chatRes, evtRes] = await Promise.all([
                cachedGet("/delegations/admin/all", undefined, 60_000),
                cachedGet("/chat/conversations", undefined, 60_000),
                cachedGet("/events", undefined, 60_000),
            ])

            const notifs: Notification[] = []

            if (delRes.data?.success) {
                const pending = (delRes.data.requests || []).filter((r: any) => r.status === "pending")
                pending.forEach((r: any) => {
                    notifs.push({
                        id: `del-${r.id}`,
                        type: "delegation",
                        title: "Mentor Reassignment Request",
                        body: `${r.requester_name || "A mentor"} requested to delegate ${r.student_name || "a student"}.`,
                        href: "/admin/delegations",
                        time: new Date(r.created_at),
                        read: false,
                        initials: (r.requester_name || "M").substring(0, 2).toUpperCase(),
                        color: "bg-purple-500",
                    })
                })
            }

            if (chatRes.data) {
                const convs: any[] = chatRes.data?.conversations || (Array.isArray(chatRes.data) ? chatRes.data : [])
                const unread = convs.filter(c => c.unread_count > 0)
                unread.slice(0, 3).forEach(c => {
                    notifs.push({
                        id: `chat-${c.id}`,
                        type: "chat",
                        title: c.name || "New Message",
                        body: c.last_message || "You have an unread message.",
                        href: `/admin/chat`,
                        time: new Date(c.last_message_at || Date.now()),
                        read: false,
                        initials: (c.name || "C").substring(0, 2).toUpperCase(),
                        color: "bg-blue-500",
                    })
                })
            }

            if (evtRes.data?.success) {
                const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
                const recent = (evtRes.data.events || []).filter(
                    (e: any) => new Date(e.created_at || e.start_date) >= cutoff
                )
                recent.slice(0, 2).forEach((e: any) => {
                    notifs.push({
                        id: `evt-${e.id}`,
                        type: "event",
                        title: e.title || "New Event",
                        body: `Scheduled for ${new Date(e.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
                        href: "/admin/calendar",
                        time: new Date(e.created_at || e.start_date),
                        read: false,
                        initials: "EV",
                        color: "bg-emerald-500",
                    })
                })
            }

            notifs.sort((a, b) => b.time.getTime() - a.time.getTime())
            setNotifications(notifs)
        } catch { /* non-blocking */ }
        setLoading(false)
    }, [])

    // Fetch on mount and every 2 minutes (was 60s — notifications don't change
    // that fast; the 60s polling was doubling network noise unnecessarily).
    useEffect(() => {
        fetchNotifications()
        const t = setInterval(fetchNotifications, 120_000)
        return () => clearInterval(t)
    }, [fetchNotifications])

    const unreadCount = notifications.filter(n => !n.read).length

    function markAllRead() {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    }

    const TYPE_ICON: Record<string, React.ElementType> = {
        delegation: Users,
        chat: MessageSquare,
        event: PartyPopper,
    }

    return (
        <div ref={panelRef} className="relative">
            {/* Bell button */}
            <button
                suppressHydrationWarning
                onClick={() => setOpen(v => !v)}
                className="relative flex h-9 w-9 rounded-xl bg-[#f7f9f7] dark:bg-[#232838] border border-[#e8ede9] dark:border-[#2a2f3e] items-center justify-center text-[#9ca3af] hover:text-[#1a3d2a] dark:hover:text-[#7de0a8] hover:bg-[#eaf4ee] dark:hover:bg-[#2a2f3e] transition-all shrink-0"
            >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 border-2 border-white dark:border-[#1a1f2e]" />
                )}
            </button>

            {/* Dropdown panel */}
            {open && (
                <div className="absolute right-0 top-12 w-[360px] bg-white dark:bg-[#1a1f2e] border border-[#e8ede9] dark:border-[#2a2f3e] rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8ede9] dark:border-[#2a2f3e]">
                        <div>
                            <h3 className="text-[14px] font-bold text-slate-800 dark:text-slate-100">
                                Notifications {unreadCount > 0 && <span className="ml-1 text-[11px] bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
                            </h3>
                        </div>
                        {unreadCount > 0 && (
                            <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <div className="max-h-[340px] overflow-y-auto divide-y divide-[#f0f4f0] dark:divide-[#2a2f3e]">
                        {loading ? (
                            <div className="text-center py-8 text-[13px] text-slate-400">Loading...</div>
                        ) : notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-6">
                                <span className="text-3xl">🎉</span>
                                <p className="text-[14px] font-bold text-slate-700 dark:text-slate-300">You&apos;re all caught up!</p>
                                <p className="text-[12px] text-slate-400">No new notifications right now.</p>
                            </div>
                        ) : (
                            notifications.map(n => {
                                const Icon = TYPE_ICON[n.type] || Bell
                                return (
                                    <Link
                                        key={n.id}
                                        href={n.href}
                                        onClick={() => { setOpen(false); setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x)) }}
                                        className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-[#232838] transition-colors ${!n.read ? "bg-blue-50/40 dark:bg-blue-900/10" : ""}`}
                                    >
                                        {/* Avatar */}
                                        <div className={`h-9 w-9 rounded-full ${n.color || "bg-slate-400"} flex items-center justify-center shrink-0 text-white font-bold text-[11px]`}>
                                            {n.initials}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 leading-tight">{n.title}</p>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                                                {formatDistanceToNow(n.time, { addSuffix: true })}
                                            </p>
                                        </div>
                                        {!n.read && <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                                    </Link>
                                )
                            })
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 border-t border-[#e8ede9] dark:border-[#2a2f3e] bg-slate-50 dark:bg-[#161b28]">
                        <Link
                            href="/admin/delegations"
                            onClick={() => setOpen(false)}
                            className="block w-full text-center bg-[#1a3d2a] hover:bg-[#15302100] text-white dark:text-white dark:bg-blue-600 dark:hover:bg-blue-700 text-[13px] font-bold py-2 rounded-xl transition-colors"
                        >
                            View All
                        </Link>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Main TopNav ─────────────────────────────────────────────────────────────
export function TopNav({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
    const [user, setUser] = useState({ name: 'Admin User', role: 'Administrator', email: '' })
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        const token = Cookies.get('auth_token')
        if (token) setUser(decodeUser(token))
    }, [])

    const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    const isDark = mounted && theme === 'dark'

    return (
        <header suppressHydrationWarning className="fixed top-0 lg:left-[260px] left-0 right-0 z-30 h-[60px] bg-white dark:bg-[#1a1f2e] border-b border-[#e8ede9] dark:border-[#2a2f3e] flex items-center px-4 lg:px-6 gap-3 transition-colors">
            {/* Mobile Menu Button */}
            <button
                onClick={onOpenSidebar}
                className="lg:hidden h-9 w-9 rounded-xl bg-[#f7f9f7] dark:bg-[#232838] border border-[#e8ede9] dark:border-[#2a2f3e] flex items-center justify-center text-[#9ca3af] hover:text-[#1a3d2a] dark:hover:text-[#7de0a8] transition-all shrink-0"
            >
                <Menu className="h-4 w-4" />
            </button>

            {/* Spacer — pushes actions to the right */}
            <div className="flex-1" />

            <div className="flex items-center gap-3">
                {/* Notification Bell */}
                <NotificationBell />

                {/* Dark Mode Toggle */}
                <button
                    suppressHydrationWarning
                    onClick={() => setTheme(isDark ? 'light' : 'dark')}
                    className="flex h-9 w-9 rounded-xl bg-[#f7f9f7] dark:bg-[#232838] border border-[#e8ede9] dark:border-[#2a2f3e] items-center justify-center text-[#9ca3af] hover:text-[#1a3d2a] dark:hover:text-[#7de0a8] hover:bg-[#eaf4ee] dark:hover:bg-[#2a2f3e] transition-all shrink-0"
                    title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {mounted ? (isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />) : <Moon className="h-4 w-4" />}
                </button>

                <div className="h-5 w-px bg-[#e8ede9] dark:bg-[#2a2f3e]" />

                {/* User */}
                <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-[#1a3d2a] flex items-center justify-center text-white font-black text-sm shadow-sm shrink-0">
                        {initials}
                    </div>
                    <div className="hidden md:block">
                        <p className="text-[12px] font-bold text-[#1a1a1a] dark:text-[#e0e0e0] leading-tight">{user.name}</p>
                        <p className="text-[10px] text-[#9ca3af]">{user.email || user.role}</p>
                    </div>
                </div>
            </div>
        </header>
    )
}
