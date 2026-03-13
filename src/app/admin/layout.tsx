"use client"

import { useState, useEffect } from "react"
import Cookies from "js-cookie"
import { AdminSidebar } from "@/components/admin/sidebar"
import { TopHeader } from "@/components/admin/top-header"
import { MobileSidebar } from "@/components/admin/mobile-sidebar"

const PORTAL_LABELS: Record<string, string> = {
    admin: "Admin Portal",
    principal: "Principal Portal",
    vice_principal: "VP Portal",
    staff: "Mentor Portal",
    controller: "School Controller Portal",
}

function decodeRole(token: string): string {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        return PORTAL_LABELS[payload.role] || "Admin Portal"
    } catch { return "Admin Portal" }
}

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [mobileNavOpen, setMobileNavOpen] = useState(false)
    const [portalLabel, setPortalLabel] = useState("Admin Portal")

    useEffect(() => {
        const token = Cookies.get("auth_token")
        if (token) setPortalLabel(decodeRole(token))
    }, [])

    return (
        <div className="flex h-screen overflow-hidden bg-[#eff3f8] relative">
            {/* Desktop Sidebar — hidden on mobile */}
            <AdminSidebar />

            {/* Mobile Sidebar Drawer */}
            <MobileSidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

            {/* Mobile Header bar — only visible on mobile */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white shadow-sm z-30 flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                    <img src="/logo.png" alt="Ribathul Quran Logo" className="h-8 w-8 object-contain" />
                    <div className="flex flex-col">
                        <span className="font-bold text-slate-800 leading-tight">Ribathul Quran</span>
                        <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide leading-tight">{portalLabel}</span>
                    </div>
                </div>
                <button
                    className="p-2 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-100"
                    onClick={() => setMobileNavOpen(true)}
                    aria-label="Open navigation"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="4" x2="20" y1="12" y2="12" />
                        <line x1="4" x2="20" y1="6" y2="6" />
                        <line x1="4" x2="20" y1="18" y2="18" />
                    </svg>
                </button>
            </div>

            {/* Main content */}
            <main className="flex-1 w-full h-screen pt-14 md:pt-0 pb-4 px-4 md:p-4 transition-all duration-300 md:ml-[68px] peer-data-[expanded=true]:md:ml-[188px] flex flex-col overflow-hidden">
                <div className="max-w-[1600px] w-full mx-auto bg-white/70 backdrop-blur-2xl rounded-[28px] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)] border border-white/80 flex flex-col h-full overflow-hidden mt-2 md:mt-0">
                    {/* Fixed Top Header — hidden on mobile (mobile uses the fixed bar above) */}
                    <div className="hidden md:block px-5 md:px-7 pt-5 md:pt-7 shrink-0 z-20">
                        <TopHeader />
                    </div>
                    {/* Scrollable page content */}
                    <div className="flex-1 overflow-y-auto px-5 md:px-7 pt-5 md:pt-7 pb-5 md:pb-7">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    )
}
