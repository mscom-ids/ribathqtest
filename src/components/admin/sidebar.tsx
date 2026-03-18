"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import Cookies from "js-cookie"
import {
    LayoutDashboard, Users, Calendar, BarChart3, UserCog,
    Settings, HelpCircle, LogOut, DoorOpen, BookOpen,
    Landmark, BookMarked, School, Smartphone, GraduationCap,
    ChevronDown, ClipboardList, FileText, BookCheck,
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

// ── Simple nav item (no children) ─────────────────────────────────────────
type SimpleItem = {
    href: string; label: string; icon: React.ElementType;
    badge?: string | number | null; group?: string[]
}

// ── Expandable nav item (with children) ────────────────────────────────────
type ExpandableItem = {
    label: string; icon: React.ElementType; group: string[]
    children: { href: string; label: string }[]
}

type NavEntry = (SimpleItem & { children?: never }) | ExpandableItem

const menuLinks: NavEntry[] = [
    { href: "/admin",                        label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/students",               label: "Students",  icon: Users, group: ["/admin/students"] },
    { href: "/admin/alumni",                 label: "Alumni",    icon: GraduationCap },
    { href: "/admin/calendar",               label: "Calendar",  icon: Calendar },
    { href: "/admin/staff",                  label: "Staff",     icon: UserCog },
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
            { href: "/admin/hifz/tracking",       label: "Hifz Recording" },
            { href: "/admin/hifz/monthly-report", label: "Monthly Report" },
            { href: "/admin/hifz/exams",           label: "Exams" },
        ],
    },
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

export function AdminSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [user, setUser] = useState({ name: 'Admin', role: 'Administrator' })
    const [expanded, setExpanded] = useState<Record<string, boolean>>({})

    useEffect(() => {
        const token = Cookies.get('auth_token')
        if (token) setUser(decodeUser(token))
    }, [])

    // Auto-expand sections that have an active child
    useEffect(() => {
        const newExpanded: Record<string, boolean> = {}
        ;[...menuLinks, ...academicLinks].forEach(item => {
            if (item.children && isItemActive(item, pathname)) {
                newExpanded[item.label] = true
            }
        })
        setExpanded(prev => ({ ...prev, ...newExpanded }))
    }, [pathname])

    const handleLogout = async () => {
        try { await api.post('/auth/logout') } catch {}
        document.cookie = 'auth_token=; Max-Age=0; path=/'
        router.push('/login')
    }

    const toggleExpand = (label: string) => {
        setExpanded(prev => ({ ...prev, [label]: !prev[label] }))
    }

    const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

    function renderItem(item: NavEntry) {
        const active = isItemActive(item, pathname)

        // ── Expandable item ──────────────────────────────────────────
        if (item.children) {
            const isOpen = expanded[item.label] || false
            return (
                <div key={item.label}>
                    <button onClick={() => toggleExpand(item.label)}
                        className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all relative group",
                            active
                                ? "bg-[#eaf4ee] text-[#1a3d2a] font-bold"
                                : "text-[#6b7280] hover:bg-[#f5f9f6] hover:text-[#1a3d2a]"
                        )}>
                        {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[#1a3d2a]" />}
                        <item.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-[#1a3d2a]" : "text-[#9ca3af]")} />
                        <span className="flex-1 text-left">{item.label}</span>
                        <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform duration-200", isOpen && "rotate-180")} />
                    </button>
                    {/* Sub-items */}
                    <div className={cn(
                        "overflow-hidden transition-all duration-200",
                        isOpen ? "max-h-40 opacity-100 mt-0.5" : "max-h-0 opacity-0"
                    )}>
                        {item.children.map(child => {
                            const childActive = pathname === child.href || pathname.startsWith(child.href + '/')
                            return (
                                <Link key={child.href} href={child.href}
                                    className={cn(
                                        "flex items-center gap-2 pl-10 pr-3 py-2 rounded-lg text-[12px] font-medium transition-all ml-1",
                                        childActive
                                            ? "text-[#1a3d2a] bg-[#eaf4ee] font-bold"
                                            : "text-[#9ca3af] hover:text-[#1a3d2a] hover:bg-[#f5f9f6]"
                                    )}>
                                    <span className={cn(
                                        "w-1.5 h-1.5 rounded-full shrink-0",
                                        childActive ? "bg-[#1a3d2a]" : "bg-[#d1d5db]"
                                    )} />
                                    {child.label}
                                </Link>
                            )
                        })}
                    </div>
                </div>
            )
        }

        // ── Simple item ──────────────────────────────────────────────
        const simpleItem = item as SimpleItem
        return (
            <Link key={simpleItem.href} href={simpleItem.href}
                className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all relative group",
                    active
                        ? "bg-[#eaf4ee] text-[#1a3d2a] font-bold"
                        : "text-[#6b7280] hover:bg-[#f5f9f6] hover:text-[#1a3d2a]"
                )}>
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[#1a3d2a]" />}
                <simpleItem.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-[#1a3d2a]" : "text-[#9ca3af]")} />
                <span className="flex-1">{simpleItem.label}</span>
                {simpleItem.badge != null && (
                    <span className="text-[10px] font-bold bg-[#e6f4eb] text-[#1a3d2a] px-1.5 py-0.5 rounded-full leading-none">{simpleItem.badge}</span>
                )}
            </Link>
        )
    }

    return (
        <aside className="fixed left-0 top-0 bottom-0 w-[220px] z-40 bg-white border-r border-[#e8ede9] flex flex-col">

            {/* ── Logo ──────────────────────────────────────────────────── */}
            <div className="h-[76px] px-4 flex items-center gap-2 shrink-0">
                <img src="/logo.png" alt="Ribathul Quran" className="h-[56px] w-[56px] rounded-full object-cover shrink-0" />
                <div className="leading-none">
                    <p className="text-[13px] font-semibold text-[#2c3e50] tracking-[0.08em] uppercase" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>Ribathul</p>
                    <p className="text-[13px] font-semibold text-[#2c3e50] tracking-[0.08em] uppercase" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>Quran</p>
                </div>
            </div>

            {/* ── Nav sections ──────────────────────────────────────────── */}
            <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-4">
                {/* MENU */}
                <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-[0.15em] px-3 mb-2">Menu</p>
                <div className="space-y-0.5 mb-5">
                    {menuLinks.map(renderItem)}
                </div>

                {/* ACADEMICS */}
                <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-[0.15em] px-3 mb-2">Academics</p>
                <div className="space-y-0.5 mb-5">
                    {academicLinks.map(renderItem)}
                </div>

                {/* GENERAL */}
                <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-[0.15em] px-3 mb-2">General</p>
                <div className="space-y-0.5">
                    {generalLinks.map(item => renderItem(item))}
                    <button onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-[#6b7280] hover:bg-rose-50 hover:text-rose-500 transition-all">
                        <LogOut className="h-[18px] w-[18px] shrink-0" />
                        <span>Logout</span>
                    </button>
                </div>
            </nav>

        </aside>
    )
}
