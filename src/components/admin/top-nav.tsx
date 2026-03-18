"use client"

import { Search, Bell, Mail } from "lucide-react"
import { useState, useEffect } from "react"
import Cookies from "js-cookie"

function decodeUser(token: string) {
    try {
        const p = JSON.parse(atob(token.split('.')[1]))
        const roles: Record<string, string> = { admin: 'Administrator', principal: 'Principal', vice_principal: 'VP', controller: 'Controller', staff: 'Mentor' }
        return { name: p.name || 'Admin User', role: roles[p.role] || 'Staff', email: p.email || 'admin@ribathulquran.com' }
    } catch { return { name: 'Admin User', role: 'Administrator', email: 'admin@ribathulquran.com' } }
}

export function TopNav() {
    const [user, setUser] = useState({ name: 'Admin User', role: 'Administrator', email: 'admin@ribathulquran.com' })

    useEffect(() => {
        const token = Cookies.get('auth_token')
        if (token) setUser(decodeUser(token))
    }, [])

    const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

    return (
        <header className="fixed top-0 left-[220px] right-0 z-30 h-[60px] bg-white border-b border-[#e8ede9] flex items-center px-6 gap-4">
            {/* Search — Donezo style with shortcut hint */}
            <div className="relative flex items-center">
                <Search className="absolute left-3 h-3.5 w-3.5 text-[#9ca3af]" />
                <input type="text" placeholder="Search students, staff..."
                    className="bg-[#f7f9f7] border border-[#e8ede9] rounded-xl pl-9 pr-4 py-2 text-[12px] placeholder:text-[#9ca3af] text-[#1a1a1a] focus:outline-none focus:border-[#2d6b45]/50 focus:ring-1 focus:ring-[#2d6b45]/20 w-64 transition-all" />
                <span className="absolute right-2.5 text-[10px] font-bold text-[#c0c0c0] bg-[#f0f0f0] rounded px-1 py-0.5">⌘F</span>
            </div>

            <div className="flex items-center gap-3 ml-auto">
                <button className="h-9 w-9 rounded-xl bg-[#f7f9f7] border border-[#e8ede9] flex items-center justify-center text-[#9ca3af] hover:text-[#1a3d2a] hover:bg-[#eaf4ee] transition-all">
                    <Mail className="h-4 w-4" />
                </button>
                <button className="relative h-9 w-9 rounded-xl bg-[#f7f9f7] border border-[#e8ede9] flex items-center justify-center text-[#9ca3af] hover:text-[#1a3d2a] hover:bg-[#eaf4ee] transition-all">
                    <Bell className="h-4 w-4" />
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-400 border-2 border-white" />
                </button>
                <div className="h-5 w-px bg-[#e8ede9]" />
                {/* User — Donezo style: avatar + name + email */}
                <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-[#1a3d2a] flex items-center justify-center text-white font-black text-sm shadow-sm shrink-0">
                        {initials}
                    </div>
                    <div className="hidden md:block">
                        <p className="text-[12px] font-bold text-[#1a1a1a] leading-tight">{user.name}</p>
                        <p className="text-[10px] text-[#9ca3af]">{user.email}</p>
                    </div>
                </div>
            </div>
        </header>
    )
}
