"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    LayoutDashboard,
    GraduationCap,
    UserCog,
    LogOut,
    Calendar,
    Settings,
    BookOpen,
    ClipboardList,
    Moon,
    Sun,
    Bell,
    Building2,
    BookMarked,
    School,
    Menu,
    ChevronDown,
    DoorOpen,
    Landmark
} from "lucide-react"
import { supabase } from "@/lib/auth"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"

export function AdminSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [isDark, setIsDark] = useState(false)
    const [expandedDept, setExpandedDept] = useState<string | null>(null)

    const mainLinks = [
        { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
        { href: "/admin/students", label: "Students", icon: GraduationCap },
        { href: "/admin/staff", label: "Staff", icon: UserCog },
        { href: "/admin/leaves", label: "Leaves", icon: DoorOpen },
        { href: "/admin/calendar", label: "Calendar", icon: Calendar },
    ]

    const departments = [
        {
            name: "Finance",
            icon: Landmark,
            links: [
                { href: "/admin/finance/dashboard", label: "Dashboard" },
                { href: "/admin/finance/monthly-fees", label: "Monthly Fees" },
                { href: "/admin/finance/student-ledger", label: "Student Ledger" },
                { href: "/admin/finance/payments", label: "Payments" },
                { href: "/admin/finance/salary", label: "Salary" },
                { href: "/admin/finance/settings", label: "Settings" },
            ]
        },
        {
            name: "Hifz",
            icon: BookOpen,
            links: [
                { href: "/admin/hifz/tracking", label: "Hifz Tracking" },
                { href: "/admin/hifz/attendance", label: "Attendance" },
                { href: "/admin/hifz/exams", label: "Exams" },
                { href: "/admin/hifz/monthly-report", label: "Monthly Report" },
            ]
        },
        {
            name: "School",
            icon: School,
            links: [
                { href: "/admin/school/attendance", label: "Attendance" },
                { href: "/admin/school/exams", label: "Exams" },
            ]
        },
        {
            name: "Madrassa",
            icon: BookMarked,
            links: [
                { href: "/admin/madrassa/attendance", label: "Attendance" },
                { href: "/admin/madrassa/exams", label: "Exams" },
            ]
        }
    ]

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push("/login")
    }

    const toggleDarkMode = () => {
        setIsDark(!isDark)
        document.documentElement.classList.toggle("dark")
    }

    return (
        <div className="w-full flex flex-col">
            <nav className="w-full bg-[#0f1420] border-b border-slate-800 sticky top-0 z-50">
                <div className="flex items-center justify-between px-6 h-16">
                    {/* Logo & Global Links */}
                    <div className="flex items-center gap-3 md:gap-6">
                        {/* Mobile Menu Toggle */}
                        <div className="block md:hidden">
                            <Sheet>
                                <SheetTrigger asChild>
                                    <button className="text-slate-400 hover:text-white p-2 -ml-2 rounded-lg transition-colors focus:outline-none">
                                        <Menu className="h-6 w-6" />
                                    </button>
                                </SheetTrigger>
                                <SheetContent side="left" className="w-72 bg-[#0f1420] border-r border-slate-800 p-0 flex flex-col">
                                    <SheetHeader className="p-6 border-b border-slate-800 text-left">
                                        <SheetTitle className="text-white flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-emerald-500/30">
                                                I
                                            </div>
                                            RQP ERP
                                        </SheetTitle>
                                    </SheetHeader>

                                    <div className="overflow-y-auto flex-1 p-4 space-y-6">
                                        {/* Main Links */}
                                        <div className="space-y-1">
                                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">Main Navigation</h3>
                                            {mainLinks.map((link) => {
                                                const Icon = link.icon
                                                const isActive = pathname === link.href || (link.href !== "/admin" && pathname.startsWith(link.href))

                                                return (
                                                    <Link key={link.href} href={link.href}>
                                                        <div
                                                            className={cn(
                                                                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                                                                isActive
                                                                    ? "bg-emerald-500/10 text-emerald-400"
                                                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                                                            )}
                                                        >
                                                            <Icon className="h-5 w-5" />
                                                            <span>{link.label}</span>
                                                        </div>
                                                    </Link>
                                                )
                                            })}
                                        </div>

                                        {/* Departments */}
                                        <div className="space-y-1">
                                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">Departments</h3>
                                            {departments.map((dept) => {
                                                const DeptIcon = dept.icon;
                                                const isDeptActive = pathname.startsWith(`/admin/${dept.name.toLowerCase()}`)
                                                const defaultHref = dept.links[0]?.href || "#"

                                                return (
                                                    <Link
                                                        key={dept.name}
                                                        href={defaultHref}
                                                        className={cn(
                                                            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                                                            isDeptActive
                                                                ? "bg-blue-500/10 text-blue-400"
                                                                : "text-slate-400 hover:text-white hover:bg-white/5"
                                                        )}
                                                    >
                                                        <DeptIcon className="h-5 w-5" />
                                                        <span>{dept.name}</span>
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-emerald-500/30">
                                I
                            </div>
                            <div className="hidden lg:block">
                                <h2 className="text-base font-bold text-white tracking-tight">RQP ERP</h2>
                            </div>
                        </div>

                        {/* Main Global Navigation Links */}
                        <div className="hidden md:flex items-center gap-1 border-l border-slate-800 pl-4">
                            {mainLinks.map((link) => {
                                const Icon = link.icon
                                const isActive = pathname === link.href || (link.href !== "/admin" && pathname.startsWith(link.href))

                                return (
                                    <Link key={link.href} href={link.href}>
                                        <div
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                                                isActive
                                                    ? "bg-emerald-500/20 text-emerald-400"
                                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                            <span>{link.label}</span>
                                        </div>
                                    </Link>
                                )
                            })}

                            {/* Department Top-Level Links */}
                            <div className="flex items-center gap-1 ml-2 border-l border-slate-800 pl-2">
                                {departments.map((dept) => {
                                    const DeptIcon = dept.icon;
                                    const isDeptActive = pathname.startsWith(`/admin/${dept.name.toLowerCase()}`)
                                    // Determine the default route for the department when clicked
                                    const defaultHref = dept.links[0]?.href || "#"

                                    return (
                                        <Link
                                            key={dept.name}
                                            href={defaultHref}
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 focus:outline-none",
                                                isDeptActive
                                                    ? "bg-blue-500/20 text-blue-400"
                                                    : "text-slate-300 hover:text-white hover:bg-white/5"
                                            )}
                                        >
                                            <DeptIcon className="h-4 w-4" />
                                            <span>{dept.name}</span>
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Right side Profile & Actions */}
                    <div className="flex items-center gap-2 md:gap-4">
                        <button
                            title="Toggle Mode"
                            className="text-slate-400 hover:text-white hover:bg-white/5 h-9 w-9 rounded-lg flex items-center justify-center transition-colors"
                            onClick={toggleDarkMode}
                        >
                            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                        </button>

                        <div className="h-8 w-px bg-slate-800 mx-1 hidden sm:block"></div>

                        {/* Profile Dropdown */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="flex items-center gap-3 pl-2 pr-1 py-1 rounded-full hover:bg-white/5 transition-colors focus:outline-none">
                                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-500 to-emerald-500 flex items-center justify-center text-white font-medium text-sm shadow-inner overflow-hidden">
                                        <div className="h-full w-full bg-black/20 flex items-center justify-center">
                                            AD
                                        </div>
                                    </div>
                                    <div className="hidden sm:block text-left">
                                        <p className="text-sm font-medium text-slate-200 leading-none">Admin User</p>
                                        <p className="text-[10px] text-slate-500 mt-1">Administrator</p>
                                    </div>
                                    <ChevronDown className="h-4 w-4 text-slate-500 ml-1" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-[#0f1420] border-slate-800 text-slate-300">
                                <DropdownMenuItem className="hover:bg-slate-800 hover:text-white cursor-pointer focus:bg-slate-800 py-2">
                                    <Settings className="mr-2 h-4 w-4" />
                                    <span>System Settings</span>
                                </DropdownMenuItem>
                                <div className="h-px bg-slate-800 my-1 mx-2"></div>
                                <DropdownMenuItem
                                    className="text-red-400 hover:bg-red-500/10 hover:text-red-300 cursor-pointer focus:bg-red-500/10 py-2"
                                    onClick={handleLogout}
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Sign out</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </nav>

            {/* Sub-Navbar for Active Department */}
            {departments.map(dept => {
                const isDeptActive = pathname.startsWith(`/admin/${dept.name.toLowerCase()}`)
                if (!isDeptActive) return null;

                return (
                    <div key={`subnav-${dept.name}`} className="bg-[#0f1420] border-b border-slate-800/80 px-4 md:px-6 py-2 overflow-x-auto">
                        <div className="max-w-[1600px] mx-auto flex items-center gap-6">
                            {dept.links.map(link => {
                                const isActive = pathname === link.href;
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className={cn(
                                            "text-sm font-medium whitespace-nowrap transition-colors pb-1 border-b-2",
                                            isActive
                                                ? "text-emerald-400 border-emerald-400"
                                                : "text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600"
                                        )}
                                    >
                                        {link.label}
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
