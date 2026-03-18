"use client"

import { Search, Bell, Maximize, Moon, Sun } from "lucide-react"
import { useState, useEffect } from "react"
import Cookies from "js-cookie"

function decodeUser(token: string): { name: string; role: string } {
    try {
        const p = JSON.parse(atob(token.split('.')[1]))
        const roleLabel: Record<string, string> = {
            admin: 'Administrator',
            principal: 'Principal',
            vice_principal: 'Vice Principal',
            controller: 'Controller',
            staff: 'Mentor',
        }
        return { name: p.name || 'Admin User', role: roleLabel[p.role] || 'Staff' }
    } catch { return { name: 'Admin User', role: 'Administrator' } }
}

export function TopHeader() {
    const [user, setUser] = useState({ name: 'Admin User', role: 'Administrator' })

    useEffect(() => {
        const token = Cookies.get('auth_token')
        if (token) setUser(decodeUser(token))
    }, [])

    const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

    return (
        <header className="flex items-center justify-between gap-4 w-full border-b border-slate-100/70 pb-5 animate-in fade-in duration-500">
            {/* Left: Brand */}
            <div className="flex items-center gap-3 shrink-0">
                <img src="/logo.png" alt="Logo" className="h-10 w-10 object-contain" />
                <div>
                    <h2 className="text-base font-extrabold text-slate-800 leading-tight">Ribathul Quran</h2>
                    <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest leading-tight">{user.role}</p>
                </div>
            </div>

            {/* Center: Search */}
            <div className="flex-1 max-w-sm hidden sm:block">
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search students, staff, records..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-full pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                </div>
            </div>

            {/* Right: Actions + Avatar */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <button className="h-9 w-9 hidden sm:flex rounded-full bg-slate-50 border border-slate-200 items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all">
                    <Maximize className="h-4 w-4" />
                </button>
                <button className="relative h-9 w-9 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all">
                    <Bell className="h-4 w-4" />
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-rose-500 border-2 border-white" />
                </button>

                <div className="w-px h-6 bg-slate-200 hidden sm:block" />

                <div className="flex items-center gap-2.5 cursor-pointer group">
                    <div className="hidden md:block text-right">
                        <p className="text-sm font-bold text-slate-800 leading-tight">{user.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{user.role}</p>
                    </div>
                    <div className="h-9 w-9 rounded-full bg-[#5a60f5] flex items-center justify-center text-white font-black text-sm shadow-md shadow-indigo-200 group-hover:opacity-90 transition-opacity">
                        {initials}
                    </div>
                </div>
            </div>
        </header>
    )
}
