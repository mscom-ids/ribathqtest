"use client"

import { Search, Bell, Maximize, ChevronDown, School } from "lucide-react"

export function TopHeader() {
    return (
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 w-full border-b border-slate-100/50 pb-4 animate-in fade-in duration-500">
            {/* Left side: School Branding */}
            <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
                    <School className="h-6 w-6" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                        Ribathul Quran
                    </h2>
                </div>
            </div>

            {/* Right side: Actions & Profile */}
            <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 w-full sm:w-auto mt-4 sm:mt-0">
                <div className="relative flex-1 sm:w-64 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-full pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <button className="h-10 w-10 hidden sm:flex rounded-full bg-slate-50 border border-slate-200 items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all">
                        <Maximize className="h-4 w-4" />
                    </button>
                    <button className="h-10 w-10 bg-slate-50 border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all relative">
                        <Bell className="h-4 w-4" />
                        <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full border border-white bg-rose-500 font-bold text-[8px] flex items-center justify-center text-white"></span>
                    </button>
                </div>

                <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>

                <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity shrink-0">
                    <div className="hidden md:block text-right">
                        <p className="text-sm font-bold text-slate-800 leading-tight">Admin User</p>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Administrator</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shadow-sm">
                        <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Admin&backgroundColor=e0e7ff" alt="Admin" className="h-full w-full object-cover" />
                    </div>
                </div>
            </div>
        </header>
    )
}
