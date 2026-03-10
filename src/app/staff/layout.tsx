"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, CalendarCheck, FileText, Menu, X, LogOut, BookOpen, DoorOpen, Landmark } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { supabase } from "@/lib/auth"
import { ModeToggle } from "@/components/mode-toggle"

export default function StaffLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [staffName, setStaffName] = useState("")
    const [isMobileOpen, setIsMobileOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const pathname = usePathname()
    const router = useRouter()

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        async function loadStaffProfile() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push("/login")
                return
            }

            const { data: staff } = await supabase
                .from("staff")
                .select("name")
                .eq("profile_id", user.id)
                .single()

            if (staff) {
                setStaffName(staff.name)
            }
        }
        loadStaffProfile()
    }, [router])

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push("/login")
    }

    const navItems = [
        { href: "/staff", label: "My Class", icon: LayoutDashboard },
        { href: "/staff/attendance", label: "Attendance", icon: CalendarCheck },
        { href: "/staff/leaves", label: "Leaves", icon: DoorOpen },
        { href: "/staff/reports", label: "Reports", icon: FileText },
        { href: "/staff/finance", label: "Finance", icon: Landmark },
    ]

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm" suppressHydrationWarning>
                <div className="container flex h-16 items-center justify-between px-4 md:px-6">
                    {/* Logo / Brand */}
                    <div className="flex items-center gap-2 font-bold text-xl text-emerald-600 dark:text-emerald-400">
                        <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                            <span className="text-lg">S</span>
                        </div>
                        <span className="hidden md:inline-block">Mentor Portal</span>
                    </div>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-6">
                        {navItems.map((item) => {
                            const isActive = pathname === item.href
                            const Icon = item.icon
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`
                                        flex items-center gap-2 text-sm font-medium transition-colors hover:text-emerald-600 dark:hover:text-emerald-400
                                        ${isActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-slate-400"}
                                    `}
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.label}
                                </Link>
                            )
                        })}
                    </nav>

                    {/* Right Side: User Profile & Actions */}
                    <div className="flex items-center gap-3">
                        <div className="hidden md:flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
                            <Avatar className="h-7 w-7 ring-2 ring-white dark:ring-slate-900">
                                <AvatarImage src="" />
                                <AvatarFallback className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-400 text-xs font-bold">
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
            <main className="flex-1 overflow-hidden flex flex-col relative">
                {children}
            </main>
        </div>
    )
}
