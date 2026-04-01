"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, CalendarCheck, FileText, Menu, X, LogOut, BookOpen, DoorOpen, Landmark, MessageCircle, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import api from "@/lib/api"
import { ModeToggle } from "@/components/mode-toggle"
import Cookies from "js-cookie"

export default function StaffLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [staffName, setStaffName] = useState("")
    const [staffPhoto, setStaffPhoto] = useState("")
    const [isMobileOpen, setIsMobileOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const pathname = usePathname()
    const router = useRouter()
    
    const [actingAsMentorName, setActingAsMentorName] = useState<string | null>(null)
    const [actingAsStudentName, setActingAsStudentName] = useState<string | null>(null)
    
    const getPhotoUrl = (url: string | null | undefined) => {
        if (!url) return undefined;
        return url.startsWith('http') ? url : `http://localhost:5000${url}`;
    }

    useEffect(() => {
        setMounted(true)
        const delegationToken = sessionStorage.getItem('delegationToken')
        const mentorName = sessionStorage.getItem('delegationMentorName')
        const studentName = sessionStorage.getItem('delegationStudentName')
        if (delegationToken && mentorName) {
            setActingAsMentorName(mentorName)
            setActingAsStudentName(studentName)
        }
    }, [])

    useEffect(() => {
        async function loadStaffProfile() {
            try {
                const res = await api.get('/staff/me')
                if (!res.data.success || !res.data.staff) {
                    console.error("Staff profile not found in database")
                    // Clear cookie and hard-redirect to break any loop
                    document.cookie = 'auth_token=; path=/; max-age=0'
                    window.location.href = '/login'
                    return
                }
                setStaffName(res.data.staff.name || "Mentor")
                setStaffPhoto(res.data.staff.photo_url || "")
            } catch (e: any) {
                console.error("Error loading staff layout profile:", e)
                // Only redirect to login if it's an auth error (401)
                // For network errors or 500s, don't redirect — it would cause a loop
                if (e?.response?.status === 401) {
                    window.location.href = '/login'
                }
            }
        }
        loadStaffProfile()
    }, [router])

    const handleSignOut = async () => {
        try { await api.post('/auth/logout') } catch (e) { /* ignore */ }
        Cookies.remove('auth_token', { path: '/' })
        document.cookie = 'auth_token=; path=/; max-age=0'
        sessionStorage.removeItem('delegationToken')
        sessionStorage.removeItem('delegationMentorName')
        sessionStorage.removeItem('delegationStudentName')
        router.push("/login")
    }

    const exitDelegationMode = () => {
        sessionStorage.removeItem('delegationToken')
        sessionStorage.removeItem('delegationMentorName')
        sessionStorage.removeItem('delegationStudentName')
        setActingAsMentorName(null)
        setActingAsStudentName(null)
        window.location.href = "/staff"
    }

    const navItems = [
        { href: "/staff", label: "My Class", icon: LayoutDashboard },
        { href: "/staff/attendance", label: "Attendance", icon: CalendarCheck },
        { href: "/staff/leaves", label: "Leaves", icon: DoorOpen },
        { href: "/staff/reports", label: "Reports", icon: FileText },
        { href: "/staff/assigned", label: "Assigned", icon: Users },
        { href: "/staff/chat", label: "Chat", icon: MessageCircle },
        { href: "/staff/finance", label: "Finance", icon: Landmark },
    ]

    const mobileNavItems = [
        { href: "/staff", label: "Class", icon: LayoutDashboard },
        { href: "/staff/attendance", label: "Attend", icon: CalendarCheck },
        { href: "/staff/chat", label: "Chat", icon: MessageCircle, highlight: true },
        { href: "/staff/leaves", label: "Leaves", icon: DoorOpen },
        { href: "/staff/reports", label: "Reports", icon: FileText },
    ]

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
            {/* Delegation Banner */}
            {actingAsMentorName && (
                <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-4 py-2 flex items-center justify-between text-sm shadow-sm border-b border-amber-200 dark:border-amber-800/50 z-50">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold">Delegation Mode Active:</span>
                        <span>
                            {actingAsStudentName 
                                ? `You are managing ${actingAsStudentName} for ${actingAsMentorName}` 
                                : `You are managing students for ${actingAsMentorName}`}
                        </span>
                    </div>
                    <Button variant="outline" size="sm" onClick={exitDelegationMode} className="h-7 text-amber-700 border-amber-300 hover:bg-amber-50">
                        Exit Mode
                    </Button>
                </div>
            )}
            {/* Header */}
            <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-sm" suppressHydrationWarning>
                <div className="container flex h-16 items-center justify-between px-4 md:px-6">
                    {/* Logo / Brand */}
                    <div className="flex items-center gap-2.5 font-bold text-lg">
                        <img src="/logo.png" alt="Ribath" className="h-8 w-auto object-contain drop-shadow-sm" />
                        <span className="hidden md:inline-block bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Mentor Portal</span>
                    </div>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-1">
                        {navItems.map((item) => {
                            const isActive = pathname === item.href
                            const Icon = item.icon
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`
                                        relative flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-all
                                        ${isActive
                                            ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50"
                                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"}
                                    `}
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.label}
                                    {isActive && (
                                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-600 dark:bg-blue-400" />
                                    )}
                                </Link>
                            )
                        })}
                    </nav>

                    {/* Right Side: User Profile & Actions */}
                    <div className="flex items-center gap-3">
                        <div className="hidden md:flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
                            <Avatar className="h-7 w-7 ring-2 ring-white dark:ring-slate-900">
                                <AvatarImage src={getPhotoUrl(staffPhoto)} className="object-cover" />
                                <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs font-bold">
                                    {staffName ? staffName.substring(0, 2).toUpperCase() : "ST"}
                                </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[100px]">
                                {staffName}
                            </span>
                        </div>

                        {mounted && <ModeToggle />}

                        <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign Out">
                            <LogOut className="h-5 w-5 text-slate-500 hover:text-red-500 transition-colors" />
                        </Button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-auto flex flex-col relative pb-20 md:pb-0">
                {children}
            </main>

            {/* Bottom Mobile Navigation */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-safe rounded-t-2xl shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
                <div className="flex items-center justify-around h-16 px-2">
                    {mobileNavItems.map((item) => {
                        const isActive = pathname === item.href
                        const Icon = item.icon
                        
                        if (item.highlight) {
                            return (
                                <Link key={item.href} href={item.href} className="relative -top-5 flex flex-col items-center justify-center">
                                    <div className={`h-14 w-14 rounded-full flex items-center justify-center shadow-lg transition-transform ${isActive ? 'bg-blue-600 outline outline-4 outline-white dark:outline-slate-900 scale-110' : 'bg-blue-500 outline outline-4 outline-white dark:outline-slate-900'}`}>
                                        <Icon className="h-6 w-6 text-white" />
                                    </div>
                                    <span className={`text-[10px] mt-1 font-medium ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                        {item.label}
                                    </span>
                                </Link>
                            )
                        }

                        return (
                            <Link key={item.href} href={item.href} className="flex flex-col items-center justify-center w-16 h-full gap-1">
                                <div className={`flex items-center justify-center h-8 w-12 rounded-full transition-colors ${isActive ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                    <Icon className={`h-5 w-5 ${isActive ? 'fill-current opacity-20' : ''}`} />
                                    {isActive && <Icon className="h-5 w-5 absolute" />}
                                </div>
                                <span className={`text-[10px] font-medium ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                    {item.label}
                                </span>
                            </Link>
                        )
                    })}
                </div>
            </nav>
        </div>
    )
}
