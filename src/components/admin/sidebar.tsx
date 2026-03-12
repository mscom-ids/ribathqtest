"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    LayoutDashboard,
    GraduationCap,
    Users,
    UserCheck,
    UserCog,
    LogOut,
    Calendar,
    BookOpen,
    Landmark,
    School,
    BookMarked,
    DoorOpen,
    ChevronDown,
    ChevronRight,
    ChevronLeft,
    Settings,
} from "lucide-react"
import api from "@/lib/api"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"

type NavItem = {
    href: string
    label: string
    icon: React.ElementType
    children?: { href: string; label: string }[]
}

export function AdminSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [isExpanded, setIsExpanded] = useState(false)
    const [openGroups, setOpenGroups] = useState<string[]>([])

    const mainLinks: NavItem[] = [
        { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
        { href: "/admin/students", label: "Students", icon: Users },
        { href: "/admin/alumni", label: "Alumni", icon: GraduationCap },
        {
            href: "/admin/finance", label: "Finance", icon: Landmark,
            children: [
                { href: "/admin/finance/dashboard", label: "Dashboard" },
                { href: "/admin/finance/payments", label: "Fee Collection" },
                { href: "/admin/finance/monthly-fees", label: "Monthly Fees" },
                { href: "/admin/finance/student-ledger", label: "Student Ledger" },
                { href: "/admin/finance/salary", label: "Salary" },
            ]
        },
        {
            href: "/admin/madrassa", label: "Madrasa", icon: BookMarked,
            children: [
                { href: "/admin/madrassa/attendance", label: "Attendance" },
                { href: "/admin/madrassa/exams", label: "Exams" },
            ]
        },
        {
            href: "/admin/school", label: "School", icon: School,
            children: [
                { href: "/admin/school/attendance", label: "Attendance" },
                { href: "/admin/school/exams", label: "Exams" },
            ]
        },
        {
            href: "/admin/hifz", label: "Hifz", icon: BookOpen,
            children: [
                { href: "/admin/hifz/tracking", label: "Daily Tracking" },
                { href: "/admin/hifz/monthly-report", label: "Monthly Report" },
                { href: "/admin/hifz/attendance", label: "Attendance" },
                { href: "/admin/hifz/exams", label: "Exams" },
            ]
        },
        { href: "/admin/staff", label: "Staff", icon: UserCog },
        { href: "/admin/leaves", label: "Leaves", icon: DoorOpen },
        { href: "/admin/calendar", label: "Events", icon: Calendar },
        {
            href: "/admin/setup", label: "Setup", icon: Settings,
            children: [
                { href: "/admin/setup/academic-years", label: "Academic Years" },
                { href: "/admin/setup/classes", label: "Classes" },
            ]
        },
    ]

    const handleLogout = async () => {
        try { await api.post('/auth/logout') } catch (e) { /* ignore */ }
        document.cookie = 'auth_token=; Max-Age=0; path=/'
        router.push("/login")
    }

    const toggleGroup = (href: string) => {
        setOpenGroups(prev =>
            prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href]
        )
    }

    const isGroupActive = (item: NavItem) => {
        if (item.href === "/admin") return pathname === "/admin"
        if (item.children) {
            return item.children.some(child => pathname.startsWith(child.href)) || pathname.startsWith(item.href)
        }
        return pathname.startsWith(item.href)
    }

    const isGroupOpen = (href: string) => openGroups.includes(href)

    return (
        <aside
            data-expanded={isExpanded}
            className={cn(
                "peer fixed left-4 z-40 hidden md:flex flex-col",
                "bg-[#5a60f5] text-white",
                "shadow-[4px_0_30px_rgba(90,96,245,0.35)]",
                "rounded-[20px] h-fit min-h-[50vh] max-h-[calc(100vh-64px)] top-1/2 -translate-y-1/2",
                "transition-all duration-300 ease-in-out overflow-hidden",
                isExpanded ? "w-[172px]" : "w-[52px]"
            )}
        >
            {/* Navigation */}
            <nav className={cn(
                "flex-1 overflow-y-auto py-3 space-y-0.5",
                isExpanded ? "px-3" : "px-2"
            )}>
                {mainLinks.map((link) => {
                    const active = isGroupActive(link)
                    const hasChildren = !!(link.children && link.children.length > 0)
                    const isOpen = isGroupOpen(link.href)

                    return (
                        <div key={link.href}>
                            {hasChildren ? (
                                <button
                                    onClick={() => {
                                        if (!isExpanded) setIsExpanded(true)
                                        toggleGroup(link.href)
                                    }}
                                    title={!isExpanded ? link.label : undefined}
                                    className={cn(
                                        "relative w-full flex items-center rounded-[14px] transition-all duration-200",
                                        isExpanded ? "px-3 py-2.5 gap-3" : "flex-col justify-center py-3 px-1",
                                        active
                                            ? "bg-white text-[#4f46e5] shadow-sm"
                                            : "text-blue-100 hover:bg-white/10 hover:text-white"
                                    )}
                                >
                                    <link.icon className={cn(
                                        "shrink-0 h-[18px] w-[18px] transition-colors",
                                        active ? "text-[#5a60f5]" : "text-blue-100"
                                    )} />
                                    {isExpanded && (
                                        <>
                                            <span className="flex-1 text-left text-xs font-bold uppercase tracking-wider">{link.label}</span>
                                            {isOpen
                                                ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                                                : <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                                            }
                                        </>
                                    )}
                                </button>
                            ) : (
                                <Link
                                    href={link.href}
                                    title={!isExpanded ? link.label : undefined}
                                    className={cn(
                                        "relative w-full flex items-center rounded-[14px] transition-all duration-200",
                                        isExpanded ? "px-3 py-2.5 gap-3" : "flex-col justify-center py-3 px-1",
                                        active
                                            ? "bg-white text-[#4f46e5] shadow-sm"
                                            : "text-blue-100 hover:bg-white/10 hover:text-white"
                                    )}
                                >
                                    <link.icon className={cn(
                                        "shrink-0 h-[18px] w-[18px] transition-colors",
                                        active ? "text-[#5a60f5]" : "text-blue-100"
                                    )} />
                                    {isExpanded && (
                                        <span className="flex-1 text-left text-xs font-bold uppercase tracking-wider">{link.label}</span>
                                    )}
                                </Link>
                            )}

                            {/* Sub-menu: only when expanded AND open */}
                            {hasChildren && isExpanded && isOpen && (
                                <div className="mt-0.5 ml-3 space-y-0.5 border-l border-white/20 pl-3">
                                    {link.children!.map(child => {
                                        const childActive = pathname === child.href || pathname.startsWith(child.href + '?') || pathname.startsWith(child.href + '/')
                                        return (
                                            <Link
                                                key={child.href}
                                                href={child.href}
                                                className={cn(
                                                    "block py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-colors",
                                                    childActive
                                                        ? "bg-white/20 text-white"
                                                        : "text-blue-200 hover:text-white hover:bg-white/10"
                                                )}
                                            >
                                                {child.label}
                                            </Link>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })}
            </nav>

            {/* Bottom: Expand toggle + Logout */}
            <div className="shrink-0 border-t border-white/10 py-3 flex flex-col items-center gap-2 px-2">
                <button
                    onClick={() => setIsExpanded(prev => !prev)}
                    className={cn(
                        "flex items-center justify-center p-2 rounded-xl transition-colors bg-white/10 hover:bg-white/20 text-white w-full",
                        isExpanded ? "gap-2 px-3" : ""
                    )}
                    title={isExpanded ? "Collapse" : "Expand"}
                >
                    {isExpanded
                        ? <><ChevronLeft className="h-4 w-4" /><span className="text-[10px] font-bold">Collapse</span></>
                        : <ChevronRight className="h-4 w-4" />
                    }
                </button>

                <button
                    onClick={handleLogout}
                    className={cn(
                        "flex items-center justify-center p-2 rounded-xl transition-colors bg-white/5 hover:bg-red-500/30 text-red-200 hover:text-white w-full",
                        isExpanded ? "gap-2 px-3" : ""
                    )}
                    title="Log Out"
                >
                    <LogOut className="h-4 w-4 shrink-0" />
                    {isExpanded && <span className="text-[10px] font-bold">Logout</span>}
                </button>
            </div>
        </aside>
    )
}
