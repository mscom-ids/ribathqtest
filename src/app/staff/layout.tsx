"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, CalendarCheck, FileText, Menu, LogOut, DoorOpen, Landmark, MessageCircle, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import api from "@/lib/api"
import { getUserRole, getUserRoleSync, clearRoleCache } from "@/lib/auth"
import { ModeToggle } from "@/components/mode-toggle"
import { resolveBackendUrl as getPhotoUrl } from "@/lib/utils"

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
    // Mentor Focus (supervisor) vs regular mentor delegation — different banner.
    const [isFocusMode, setIsFocusMode] = useState(false)
    // Role-aware branding: leaders see "Leadership Portal", mentors "Mentor Portal".
    // Seeded from sessionStorage cache so the header renders correctly on the
    // first paint — no flicker from "Mentor Portal" → "Leadership Portal".
    const [brand, setBrand] = useState(() => {
        const r = getUserRoleSync()
        return (r === 'principal' || r === 'vice_principal') ? 'Leadership Portal' : 'Mentor Portal'
    })
    // Leaders (Principal / VP) don't request delegation — they use Mentor Focus —
    // so the "Assigned" (delegation requests) nav item is hidden for them.
    const [isLeader, setIsLeader] = useState(() => {
        const r = getUserRoleSync()
        return r === 'principal' || r === 'vice_principal'
    })

    useEffect(() => {
        setMounted(true)
        const delegationToken = sessionStorage.getItem('delegationToken')
        const mentorName = sessionStorage.getItem('delegationMentorName')
        const studentName = sessionStorage.getItem('delegationStudentName')
        if (delegationToken && mentorName) {
            setActingAsMentorName(mentorName)
            setActingAsStudentName(studentName)
            setIsFocusMode(sessionStorage.getItem('mentorFocus') === '1')
        }
        getUserRole()
            .then((r) => {
                if (r === 'principal' || r === 'vice_principal') {
                    setBrand('Leadership Portal')
                    setIsLeader(true)
                }
            })
            .catch(() => {})
    }, [])

    useEffect(() => {
        async function loadStaffProfile() {
            try {
                const res = await api.get('/staff/me')
                if (!res.data.success || !res.data.staff) {
                    console.warn("Staff profile not found in database")
                    await api.post('/auth/logout').catch(() => {})
                    window.location.href = '/login'
                    return
                }
                setStaffName(res.data.staff.name || "Mentor")
                setStaffPhoto(res.data.staff.photo_url || "")
            } catch (e: any) {
                console.warn("Error loading staff layout profile:", e)
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
        sessionStorage.removeItem('delegationToken')
        sessionStorage.removeItem('delegationMentorName')
        sessionStorage.removeItem('delegationStudentName')
        sessionStorage.removeItem('mentorFocus')
        clearRoleCache()
        router.push("/login")
    }

    const exitDelegationMode = () => {
        sessionStorage.removeItem('delegationToken')
        sessionStorage.removeItem('delegationMentorName')
        sessionStorage.removeItem('delegationStudentName')
        sessionStorage.removeItem('mentorFocus')
        setActingAsMentorName(null)
        setActingAsStudentName(null)
        setIsFocusMode(false)
        window.location.href = "/staff"
    }

    const navItems = [
        { href: "/staff", label: "My Class", icon: LayoutDashboard },
        { href: "/staff/attendance", label: "Attendance", icon: CalendarCheck },
        { href: "/staff/leaves", label: "Leaves", icon: DoorOpen },
        { href: "/staff/reports", label: "Reports", icon: FileText },
        ...(isLeader ? [] : [{ href: "/staff/assigned", label: "Assigned", icon: Users }]),
        { href: "/staff/chat", label: "Chat", icon: MessageCircle },
        { href: "/staff/finance", label: "Finance", icon: Landmark },
    ]

    const mobileNavItems = [
        { href: "/staff", label: "Class", icon: LayoutDashboard },
        { href: "/staff/attendance", label: "Attend", icon: CalendarCheck },
        { href: "/staff/chat", label: "Chat", icon: MessageCircle, highlight: true },
        { href: "/staff/leaves", label: "Leaves", icon: DoorOpen },
    ]

    const mobileMoreItems = [
        { href: "/staff/reports", label: "Reports", description: "Student progress reports", icon: FileText },
        ...(isLeader ? [] : [{ href: "/staff/assigned", label: "Assigned", description: "Assigned students", icon: Users }]),
        { href: "/staff/finance", label: "Finance", description: "Finance module", icon: Landmark },
    ]

    const isMoreActive = mobileMoreItems.some((item) =>
        pathname === item.href || pathname.startsWith(item.href + "/")
    )

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
            {/* Mentor Focus Banner (supervisor) */}
            {actingAsMentorName && isFocusMode && (
                <div className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 px-4 py-2 flex items-center justify-between text-sm shadow-sm border-b border-indigo-200 dark:border-indigo-800/50 z-50">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold">Mentor Focus:</span>
                        <span>You are viewing and managing {actingAsMentorName}&apos;s class</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={exitDelegationMode} className="h-7 text-indigo-700 border-indigo-300 hover:bg-indigo-50 dark:text-indigo-200 dark:border-indigo-700">
                        Exit Focus
                    </Button>
                </div>
            )}
            {/* Delegation Banner (mentor-to-mentor) */}
            {actingAsMentorName && !isFocusMode && (
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
            <header
                className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-sm"
                suppressHydrationWarning
            >
                {/* 
                  Three-section layout: [Logo | Nav | Profile]
                  - Logo: fixed min-width, never shrinks
                  - Nav: flex-1, scrollable on tablet
                  - Profile: fixed min-width, never shrinks
                */}
                <div className="flex items-center h-14 lg:h-16 px-3 md:px-5 gap-2 lg:gap-4 max-w-[1400px] mx-auto w-full">

                    {/* ── LEFT: Logo / Brand ── */}
                    <div className="flex items-center gap-2 font-bold shrink-0 min-w-[36px] md:min-w-[160px]">
                        <img
                            src="/logo.png"
                            alt="Ribath"
                            className="h-8 w-8 object-contain drop-shadow-sm rounded-md"
                        />
                        <span className="hidden md:inline-block text-base lg:text-lg bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent whitespace-nowrap">
                            {brand}
                        </span>
                    </div>

                    {/* ── CENTER: Desktop / Tablet Navigation — scrollable ── */}
                    <nav className="hidden md:flex flex-1 items-center overflow-x-auto scrollbar-none gap-0.5 lg:gap-1 min-w-0">
                        {navItems.map((item) => {
                            const isActive = pathname === item.href || (item.href !== "/staff" && pathname.startsWith(item.href))
                            const Icon = item.icon
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={[
                                        "relative flex items-center gap-1.5 whitespace-nowrap shrink-0",
                                        "text-[12px] lg:text-sm font-medium",
                                        "px-2.5 lg:px-3 py-2 rounded-lg transition-all duration-200",
                                        isActive
                                            ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50"
                                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    ].join(" ")}
                                >
                                    <Icon className="h-[15px] w-[15px] lg:h-4 lg:w-4 shrink-0" />
                                    <span>{item.label}</span>
                                    {isActive && (
                                        <span className="absolute bottom-[2px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-600 dark:bg-blue-400" />
                                    )}
                                </Link>
                            )
                        })}
                    </nav>

                    {/* ── RIGHT: Profile + Actions — fixed width, never shrinks ── */}
                    <div className="flex items-center gap-1.5 lg:gap-2.5 shrink-0 ml-auto md:ml-0">
                        {/* Staff name pill — only on lg+ */}
                        <div className="hidden lg:flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
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

                        {/* Avatar only on md–lg (tablet) */}
                        <div className="hidden md:flex lg:hidden">
                            <Avatar className="h-8 w-8 ring-2 ring-white dark:ring-slate-900">
                                <AvatarImage src={getPhotoUrl(staffPhoto)} className="object-cover" />
                                <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs font-bold">
                                    {staffName ? staffName.substring(0, 2).toUpperCase() : "ST"}
                                </AvatarFallback>
                            </Avatar>
                        </div>

                        {mounted && <ModeToggle />}

                        <Button variant="ghost" size="icon" className="h-8 w-8 lg:h-9 lg:w-9" onClick={handleSignOut} title="Sign Out">
                            <LogOut className="h-4 w-4 lg:h-5 lg:w-5 text-slate-500 hover:text-red-500 transition-colors" />
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

                    <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                        <SheetTrigger asChild>
                            <button
                                type="button"
                                className="flex flex-col items-center justify-center w-16 h-full gap-1"
                                aria-label="Open more navigation"
                                aria-expanded={isMobileOpen}
                            >
                                <div className={`flex items-center justify-center h-8 w-12 rounded-full transition-colors ${isMoreActive || isMobileOpen ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                    <Menu className="h-5 w-5" />
                                </div>
                                <span className={`text-[10px] font-medium ${isMoreActive || isMobileOpen ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                    More
                                </span>
                            </button>
                        </SheetTrigger>

                        <SheetContent
                            side="bottom"
                            className="md:hidden gap-0 rounded-t-3xl border-slate-200 bg-white p-0 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] dark:border-slate-800 dark:bg-slate-900"
                        >
                            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
                            <SheetHeader className="px-5 pb-3 pt-4 text-left">
                                <SheetTitle className="text-lg font-bold">More</SheetTitle>
                            </SheetHeader>

                            <div className="grid grid-cols-3 gap-3 px-4">
                                {mobileMoreItems.map((item) => {
                                    const Icon = item.icon
                                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/")

                                    return (
                                        <SheetClose asChild key={item.href}>
                                            <Link
                                                href={item.href}
                                                className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-4 text-center transition-colors ${isActive
                                                    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                                                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-200 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-blue-800 dark:hover:bg-blue-950/40'
                                                }`}
                                            >
                                                <span className={`flex h-11 w-11 items-center justify-center rounded-full ${isActive
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-white text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300'
                                                }`}>
                                                    <Icon className="h-5 w-5" />
                                                </span>
                                                <span>
                                                    <span className="block text-sm font-semibold">{item.label}</span>
                                                    <span className="mt-0.5 block text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                                                        {item.description}
                                                    </span>
                                                </span>
                                            </Link>
                                        </SheetClose>
                                    )
                                })}
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </nav>
        </div>
    )
}
