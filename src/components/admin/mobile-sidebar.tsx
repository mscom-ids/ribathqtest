"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { X, LayoutDashboard, Users, GraduationCap, Landmark, BookMarked, School, BookOpen, UserCog, DoorOpen, Calendar, Settings, LogOut } from "lucide-react"
import { useEffect } from "react"
import Cookies from "js-cookie"
import api from "@/lib/api"
import { cn } from "@/lib/utils"

const navLinks = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/students", label: "Students", icon: Users },
    { href: "/admin/alumni", label: "Alumni", icon: GraduationCap },
    { href: "/admin/finance/dashboard", label: "Finance", icon: Landmark },
    { href: "/admin/madrassa/attendance", label: "Madrasa", icon: BookMarked },
    { href: "/admin/school/attendance", label: "School", icon: School },
    { href: "/admin/hifz/tracking", label: "Hifz", icon: BookOpen },
    { href: "/admin/staff", label: "Staff", icon: UserCog },
    { href: "/admin/leaves", label: "Leaves", icon: DoorOpen },
    { href: "/admin/calendar", label: "Events", icon: Calendar },
    { href: "/admin/setup/academic-years", label: "Setup", icon: Settings },
]

interface MobileSidebarProps {
    open: boolean
    onClose: () => void
}

export function MobileSidebar({ open, onClose }: MobileSidebarProps) {
    const pathname = usePathname()
    const router = useRouter()

    const handleLogout = async () => {
        try { await api.post('/auth/logout') } catch (e) { /* ignore */ }
        Cookies.remove('auth_token')
        onClose()
        router.push('/login')
    }

    // Close on route change
    useEffect(() => { onClose() }, [pathname])

    // Prevent body scrolling when open
    useEffect(() => {
        document.body.style.overflow = open ? "hidden" : ""
        return () => { document.body.style.overflow = "" }
    }, [open])

    return (
        <>
            {/* Backdrop */}
            <div
                className={cn(
                    "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 md:hidden",
                    open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                onClick={onClose}
            />

            {/* Drawer */}
            <aside
                className={cn(
                    "fixed top-0 left-0 z-50 h-full w-72 bg-[#5a60f5] text-white shadow-2xl transition-transform duration-300 ease-in-out md:hidden flex flex-col",
                    open ? "translate-x-0" : "-translate-x-full"
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <img src="/logo.png" alt="Ribathul Quran Logo" className="h-9 w-9 object-contain" />
                        <span className="font-bold text-lg"> Ma'din Ribathul Quran</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-white/10 transition-colors"
                        aria-label="Close menu"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Nav links */}
                <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                    {navLinks.map(link => {
                        const isActive = link.href === "/admin"
                            ? pathname === "/admin"
                            : pathname.startsWith(link.href)

                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all",
                                    isActive
                                        ? "bg-white text-[#4f46e5] shadow"
                                        : "text-blue-100 hover:bg-white/10"
                                )}
                            >
                                <link.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-[#5a60f5]" : "text-blue-100")} />
                                {link.label}
                            </Link>
                        )
                    })}
                </nav>

                {/* Footer and Logout */}
                <div className="p-4 border-t border-white/10 flex flex-col gap-2">
                    <button
                        onClick={handleLogout}
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-white/10 hover:bg-red-500/80 text-white transition-colors font-semibold"
                    >
                        <LogOut className="h-4 w-4" />
                        Logout
                    </button>
                    <div className="text-[10px] text-blue-200 text-center mt-2 opacity-70">
                        Ribathul Quran Admin
                    </div>
                </div>
            </aside>
        </>
    )
}
