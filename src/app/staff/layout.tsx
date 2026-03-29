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

                        {/* Mobile Menu Trigger */}
                        <div className="md:hidden">
                            {mounted && (
                                <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                                    <SheetTrigger asChild>
                                        <Button variant="ghost" size="icon">
                                            <Menu className="h-6 w-6" />
                                        </Button>
                                    </SheetTrigger>
                                    <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                                        <div className="flex flex-col gap-6 pt-6">
                                            <div className="flex items-center gap-3 pb-6 border-b border-slate-200 dark:border-slate-800">
                                                <Avatar className="h-10 w-10">
                                                    <AvatarImage src={getPhotoUrl(staffPhoto)} className="object-cover" />
                                                    <AvatarFallback className="bg-emerald-100 text-emerald-700 font-bold">
                                                        {staffName ? staffName.substring(0, 2).toUpperCase() : "ST"}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <h3 className="font-medium">{staffName || "Mentor"}</h3>
                                                    <p className="text-xs text-muted-foreground">Logged in</p>
                                                </div>
                                            </div>
                                            <nav className="flex flex-col gap-3">
                                                {navItems.map((item) => {
                                                    const isActive = pathname === item.href
                                                    const Icon = item.icon
                                                    return (
                                                        <Link
                                                            key={item.href}
                                                            href={item.href}
                                                            onClick={() => setIsMobileOpen(false)}
                                                            className={`
                                                            flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors
                                                            ${isActive
                                                                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                                                                    : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"}
                                                        `}
                                                        >
                                                            <Icon className="h-5 w-5" />
                                                            {item.label}
                                                        </Link>
                                                    )
                                                })}
                                            </nav>
                                        </div>
                                    </SheetContent>
                                </Sheet>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-auto flex flex-col relative">
                {children}
            </main>
        </div>
    )
}
