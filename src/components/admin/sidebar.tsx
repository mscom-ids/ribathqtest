"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import Cookies from "js-cookie"
import {
    LayoutDashboard, Users, Calendar, UserCog,
    Settings, HelpCircle, LogOut, DoorOpen, BookOpen,
    Landmark, BookMarked, School, GraduationCap,
    ChevronDown, ChevronRight, Menu, MessageCircle, ClipboardCheck
} from "lucide-react"
import api from "@/lib/api"
import { cn } from "@/lib/utils"

function decodeUser(token: string) {
    try {
        const p = JSON.parse(atob(token.split('.')[1]))
        const roles: Record<string, string> = {
            admin: 'Administrator', principal: 'Principal',
            vice_principal: 'Vice Principal', controller: 'Controller', staff: 'Mentor'
        }
        return { name: p.name || 'Admin', role: roles[p.role] || 'Staff' }
    } catch { return { name: 'Admin', role: 'Administrator' } }
}

type SimpleItem = {
    href: string; label: string; icon: React.ElementType;
    badge?: string | number | null; group?: string[]
}
type ExpandableItem = {
    label: string; icon: React.ElementType; group: string[]
    children: { href: string; label: string }[]
}
type NavEntry = (SimpleItem & { children?: never }) | ExpandableItem

// ── Nav data ─────────────────────────────────────────────────────────────────
const menuLinks: NavEntry[] = [
    { href: "/admin",          label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/students", label: "Students",  icon: Users,          group: ["/admin/students"] },
    { href: "/admin/alumni",   label: "Alumni",    icon: GraduationCap },
    { href: "/admin/calendar", label: "Calendar",  icon: Calendar },
    {
        label: "Time Table", icon: BookMarked, group: ["/admin/timetable"],
        children: [
            { href: "/admin/timetable/setup",     label: "Time Table Setup" },
            { href: "/admin/timetable/view",      label: "Time Table View" },
        ],
    },
    { href: "/admin/student-attendance", label: "Attendance Dashboard", icon: ClipboardCheck, group: ["/admin/student-attendance"] },
    { href: "/admin/staff",    label: "Staff",     icon: UserCog },
    { href: "/admin/chat",     label: "Chat",      icon: MessageCircle },
]

const academicLinks: NavEntry[] = [
    {
        label: "Madrasa", icon: BookMarked, group: ["/admin/madrassa"],
        children: [
            { href: "/admin/madrassa/attendance", label: "Attendance" },
            { href: "/admin/madrassa/exams",      label: "Exams" },
        ],
    },
    {
        label: "School", icon: School, group: ["/admin/school"],
        children: [
            { href: "/admin/school/attendance", label: "Attendance" },
            { href: "/admin/school/exams",      label: "Exams" },
        ],
    },
    {
        label: "Hifz", icon: BookOpen, group: ["/admin/hifz"],
        children: [
            { href: "/admin/hifz/attendance",     label: "Attendance" },
            { href: "/admin/hifz/tracking",       label: "Hifz Recording" },
            { href: "/admin/hifz/monthly-report", label: "Monthly Report" },
            { href: "/admin/hifz/exams",          label: "Exams" },
        ],
    },
]

const managementLinks: NavEntry[] = [
    { href: "/admin/finance/dashboard", label: "Finance", icon: Landmark, group: ["/admin/finance"] },
    { href: "/admin/leaves",            label: "Leaves",  icon: DoorOpen },
]

const generalLinks: SimpleItem[] = [
    { href: "/admin/setup/academic-years", label: "Settings", icon: Settings },
    { href: "#help",                       label: "Help",     icon: HelpCircle },
]

function isItemActive(item: NavEntry, pathname: string): boolean {
    if ('href' in item && item.href) {
        if (item.href === '/admin') return pathname === '/admin'
        if (item.group) return item.group.some(g => pathname.startsWith(g))
        return pathname.startsWith(item.href)
    }
    if (item.group) return item.group.some(g => pathname.startsWith(g))
    return false
}

// ── Sidebar component ─────────────────────────────────────────────────────────
export function AdminSidebar({ 
    mobileOpen, 
    onClose, 
    isCollapsed = false, 
    onToggleCollapse 
}: { 
    mobileOpen?: boolean; 
    onClose?: () => void;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}) {
    const pathname = usePathname()
    const router   = useRouter()
    const [user, setUser]       = useState({ name: 'Admin User', role: 'Administrator' })
    const [expanded, setExpanded] = useState<Record<string, boolean>>({})

    useEffect(() => {
        const token = Cookies.get('auth_token')
        if (token) setUser(decodeUser(token))
    }, [])

    // Auto-expand active sections
    useEffect(() => {
        const open: Record<string, boolean> = {}
        ;[...menuLinks, ...academicLinks, ...managementLinks].forEach(item => {
            if (item.children && isItemActive(item, pathname)) open[item.label] = true
        })
        setExpanded(prev => ({ ...prev, ...open }))
    }, [pathname])

    const handleLogout = async () => {
        try { await api.post('/auth/logout') } catch {}
        document.cookie = 'auth_token=; Max-Age=0; path=/'
        router.push('/login')
    }

    const toggle = (label: string) => setExpanded(prev => ({ ...prev, [label]: !prev[label] }))
    const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

    // ── renders label ─────────────────────────────────────────────────────────
    function SectionLabel({ label }: { label: string }) {
        return (
            <div className={cn(
                "flex items-center gap-3 mt-6 mb-2 transition-all duration-300",
                isCollapsed ? "px-0 justify-center" : "px-3"
            )}>
                {!isCollapsed ? (
                    <>
                        <span className="text-[11px] font-bold tracking-widest uppercase text-slate-400 dark:text-slate-500 whitespace-nowrap animate-in fade-in duration-300">
                            {label}
                        </span>
                        <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                    </>
                ) : (
                    <div className="w-8 h-px bg-slate-200 dark:bg-slate-800" />
                )}
            </div>
        )
    }

    // ── renders a single nav item (simple or expandable) ─────────────────────
    function NavItem({ item }: { item: NavEntry }) {
        const active  = isItemActive(item, pathname)

        /* ── Expandable ── */
        if (item.children) {
            const isOpen = expanded[item.label] ?? false
            return (
                <div className="mb-1">
                    <button
                        suppressHydrationWarning
                        onClick={() => toggle(item.label)}
                        className={cn(
                            "group w-full flex items-center gap-3 rounded-lg py-[10px] text-[13.5px] font-semibold transition-all duration-200",
                            isCollapsed ? "px-0 justify-center" : "px-3",
                            active
                                ? "bg-[#F0F5FF] text-[#2563EB] dark:bg-[#3B82F6]/10 dark:text-[#60A5FA]"
                                : "text-[#475569] dark:text-[#94A3B8] hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-[#1e293b] dark:hover:text-slate-200"
                        )}
                        title={isCollapsed ? item.label : ""}
                    >
                        <item.icon className={cn(
                            "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
                            active ? "text-[#2563EB] dark:text-[#60A5FA]" : "text-[#94A3B8] dark:text-[#64748B] group-hover:text-[#64748B] dark:group-hover:text-slate-300"
                        )} />
                        {!isCollapsed && <span className="flex-1 text-left animate-in fade-in duration-300">{item.label}</span>}
                        {!isCollapsed && (
                            <ChevronRight className={cn(
                                "h-4 w-4 shrink-0 transition-transform duration-200",
                                isOpen ? "rotate-90 text-[#2563EB] dark:text-[#60A5FA]" : "text-[#94A3B8] dark:text-[#64748B]"
                            )} />
                        )}
                    </button>

                    {/* Sub-items */}
                    {!isCollapsed && (
                        <div className={cn(
                            "grid transition-all duration-200 ease-in-out",
                            isOpen ? "grid-rows-[1fr] opacity-100 mt-1" : "grid-rows-[0fr] opacity-0"
                        )}>
                            <div className="overflow-hidden">
                                <div className="ml-5 mt-1 border-l-[1.5px] border-slate-200 dark:border-slate-800 pl-3 space-y-1">
                                    {item.children.map(child => {
                                        const ca = pathname === child.href || pathname.startsWith(child.href + '/')
                                        return (
                                            <Link key={child.href} href={child.href}
                                                className={cn(
                                                    "flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                                                    ca
                                                        ? "text-[#2563EB] dark:text-[#60A5FA] font-bold"
                                                        : "text-[#64748B] dark:text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-slate-200"
                                                )}>
                                                <span className={cn(
                                                    "h-1.5 w-1.5 rounded-full shrink-0 transition-all",
                                                    ca ? "bg-[#2563EB] dark:bg-[#60A5FA] ring-4 ring-[#2563EB]/10 dark:ring-[#60A5FA]/10" : "bg-slate-300 dark:bg-slate-600"
                                                )} />
                                                {child.label}
                                            </Link>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )
        }

        /* ── Simple ── */
        const si = item as SimpleItem
        return (
            <div className="mb-1">
                <Link href={si.href}
                    className={cn(
                        "group w-full flex items-center gap-3 rounded-lg py-[10px] text-[13.5px] font-semibold transition-all duration-200",
                        isCollapsed ? "px-0 justify-center" : "px-3",
                        active
                            ? "bg-[#F0F5FF] text-[#2563EB] dark:bg-[#3B82F6]/10 dark:text-[#60A5FA]"
                            : "text-[#475569] dark:text-[#94A3B8] hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-[#1e293b] dark:hover:text-slate-200"
                    )}
                    title={isCollapsed ? si.label : ""}
                >
                    <si.icon className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
                        active ? "text-[#2563EB] dark:text-[#60A5FA]" : "text-[#94A3B8] dark:text-[#64748B] group-hover:text-[#64748B] dark:group-hover:text-slate-300"
                    )} />
                    {!isCollapsed && <span className="flex-1 animate-in fade-in duration-300">{si.label}</span>}
                    
                    {!isCollapsed && (
                        si.badge != null ? (
                            <span className="text-[10px] font-bold bg-[#E8F5EE] text-[#1a7a45] px-2 py-0.5 rounded-full">{si.badge}</span>
                        ) : (
                            <ChevronRight className={cn(
                                "h-4 w-4 shrink-0 transition-transform duration-200",
                                active ? "text-[#2563EB] dark:text-[#60A5FA]" : "text-[#94A3B8] dark:text-[#64748B] opacity-0 group-hover:opacity-100"
                            )} />
                        )
                    )}
                </Link>
            </div>
        )
    }

    return (
        <>
            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
                    onClick={onClose}
                />
            )}

            <aside className={cn(
                "fixed left-0 top-0 bottom-0 z-50 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0",
                "bg-white dark:bg-[#0f172a]",
                "border-r border-slate-200 dark:border-slate-800",
                "shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-none",
                isCollapsed ? "w-[80px]" : "w-[260px]",
                mobileOpen ? "translate-x-0" : "-translate-x-full"
            )}>

                {/* ── Arrow Toggle Button — top-right edge, desktop only ── */}
                <button 
                    onClick={onToggleCollapse}
                    className="absolute -right-3.5 top-6 h-7 w-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md hidden lg:flex items-center justify-center text-slate-500 hover:text-[#3d5ee1] hover:border-[#3d5ee1] transition-all duration-200 z-10"
                    title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    <ChevronRight className={cn(
                        "h-3.5 w-3.5 transition-transform duration-300",
                        isCollapsed ? "rotate-0" : "rotate-180"
                    )} />
                </button>

                {/* ── Brand Header ─────────────────────────────────────────────── */}
                <div className="relative px-4 py-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
                    <div className={cn(
                        "flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/50 shadow-sm transition-all duration-300",
                        isCollapsed ? "p-2 justify-center" : "p-3"
                    )}>
                        <img
                            src="/logo.png"
                            alt="Ribathul Quran"
                            className="h-10 w-10 min-w-[40px] rounded-lg object-cover ring-1 ring-slate-100 dark:ring-slate-800"
                        />
                        {!isCollapsed && (
                            <div className="flex-1 min-w-0 animate-in fade-in duration-300">
                                <p className="text-[15px] font-bold text-slate-800 dark:text-slate-100 truncate tracking-tight">Ribathul Quran</p>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">Admin Portal</p>
                            </div>
                        )}
                    </div>
                </div>


                {/* ── Scrollable nav ────────────────────────────────────── */}
                <nav className="flex-1 overflow-y-auto px-4 py-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">

                    <SectionLabel label="Main" />
                    <div className="space-y-0.5 mt-1">
                        {menuLinks.map(item => (
                            <NavItem key={'href' in item ? item.href : item.label} item={item} />
                        ))}
                    </div>

                    <SectionLabel label="Academics" />
                    <div className="space-y-0.5 mt-1">
                        {academicLinks.map(item => (
                            <NavItem key={item.label} item={item} />
                        ))}
                    </div>

                    <SectionLabel label="Management" />
                    <div className="space-y-0.5 mt-1">
                        {managementLinks.map(item => (
                            <NavItem key={'href' in item ? item.href : item.label} item={item} />
                        ))}
                    </div>

                    <SectionLabel label="Settings" />
                    <div className="space-y-0.5 mt-1">
                        {generalLinks.map(item => <NavItem key={item.href} item={item} />)}

                        {/* Logout */}
                        <button
                            suppressHydrationWarning
                            onClick={handleLogout}
                            className={cn(
                                "group w-full flex items-center gap-3 rounded-lg py-[10px] text-[13.5px] font-semibold text-[#475569] dark:text-[#94A3B8] hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 transition-all duration-200",
                                isCollapsed ? "px-0 justify-center" : "px-3"
                            )}
                            title={isCollapsed ? "Logout" : ""}
                        >
                            <LogOut className={cn(
                                "h-[18px] w-[18px] shrink-0 text-[#94A3B8] dark:text-[#64748B] group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors",
                            )} />
                            {!isCollapsed && <span className="animate-in fade-in duration-300">Logout</span>}
                        </button>
                    </div>
                </nav>

                {/* ── User strip at bottom ─────────────────────────────── */}
                <div className={cn(
                    "shrink-0 border-t border-slate-200 dark:border-slate-800 p-4 transition-all duration-300 bg-slate-50 dark:bg-[#0f172a]",
                    isCollapsed ? "flex flex-col items-center gap-2" : "flex items-center gap-3"
                )}>
                    <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-800">
                        <span className="text-[13px] font-bold text-indigo-700 dark:text-indigo-300">{initials}</span>
                    </div>
                    {!isCollapsed ? (
                        <>
                            <div className="flex-1 min-w-0 animate-in fade-in duration-300">
                                <p className="text-[13px] font-bold text-slate-800 dark:text-slate-200 truncate">{user.name}</p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">{user.role}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                        </>
                    ) : null}
                </div>

            </aside>
        </>
    )
}
