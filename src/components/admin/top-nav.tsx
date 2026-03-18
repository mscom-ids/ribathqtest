"use client"

import { Search, Bell, Mail, Moon, Sun, Menu } from "lucide-react"
import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import Cookies from "js-cookie"

function decodeUser(token: string) {
    try {
        const p = JSON.parse(atob(token.split('.')[1]))
        const roles: Record<string, string> = { admin: 'Administrator', principal: 'Principal', vice_principal: 'VP', controller: 'Controller', staff: 'Mentor' }
        return { name: p.name || 'Admin User', role: roles[p.role] || 'Staff', email: p.email || 'admin@ribathulquran.com' }
    } catch { return { name: 'Admin User', role: 'Administrator', email: 'admin@ribathulquran.com' } }
}

export function TopNav({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
    const [user, setUser] = useState({ name: 'Admin User', role: 'Administrator', email: 'admin@ribathulquran.com' })
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
        <header className="fixed top-0 lg:left-[220px] left-0 right-0 z-30 h-[60px] bg-white dark:bg-[#1a1f2e] border-b border-[#e8ede9] dark:border-[#2a2f3e] flex items-center px-4 lg:px-6 gap-3 transition-colors">
            {/* Mobile Menu Button */}
            <button 
                onClick={onOpenSidebar}
                className="lg:hidden h-9 w-9 rounded-xl bg-[#f7f9f7] dark:bg-[#232838] border border-[#e8ede9] dark:border-[#2a2f3e] flex items-center justify-center text-[#9ca3af] hover:text-[#1a3d2a] dark:hover:text-[#7de0a8] transition-all shrink-0"
            >
                <Menu className="h-4 w-4" />
            </button>

            {/* Search */}
            <div className="relative flex items-center flex-1 lg:flex-none">
                <Search className="absolute left-3 h-3.5 w-3.5 text-[#9ca3af]" />
                <input type="text" placeholder="Search..."
                    className="bg-[#f7f9f7] dark:bg-[#232838] border border-[#e8ede9] dark:border-[#2a2f3e] rounded-xl pl-9 pr-4 py-2 text-[12px] placeholder:text-[#9ca3af] text-[#1a1a1a] dark:text-[#e0e0e0] focus:outline-none focus:border-[#2d6b45]/50 focus:ring-1 focus:ring-[#2d6b45]/20 w-full lg:w-64 transition-all" />
                <span className="absolute right-2.5 text-[10px] font-bold text-[#c0c0c0] bg-[#f0f0f0] dark:bg-[#2a2f3e] dark:text-[#666] rounded px-1 py-0.5 hidden lg:block">⌘F</span>
            </div>

            <div className="flex items-center gap-3 ml-auto">
                <button className="hidden sm:flex h-9 w-9 rounded-xl bg-[#f7f9f7] dark:bg-[#232838] border border-[#e8ede9] dark:border-[#2a2f3e] items-center justify-center text-[#9ca3af] hover:text-[#1a3d2a] dark:hover:text-[#7de0a8] hover:bg-[#eaf4ee] dark:hover:bg-[#2a2f3e] transition-all shrink-0">
                    <Mail className="h-4 w-4" />
                </button>
                <button className="relative flex h-9 w-9 rounded-xl bg-[#f7f9f7] dark:bg-[#232838] border border-[#e8ede9] dark:border-[#2a2f3e] items-center justify-center text-[#9ca3af] hover:text-[#1a3d2a] dark:hover:text-[#7de0a8] hover:bg-[#eaf4ee] dark:hover:bg-[#2a2f3e] transition-all shrink-0">
                    <Bell className="h-4 w-4" />
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-400 border-2 border-white dark:border-[#1a1f2e]" />
                </button>

                {/* ── Dark Mode Toggle ──────────────────────────── */}
                <button
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
                        <p className="text-[10px] text-[#9ca3af]">{user.email}</p>
                    </div>
                </div>
            </div>
        </header>
    )
}
