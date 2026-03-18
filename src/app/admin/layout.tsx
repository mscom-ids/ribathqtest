"use client"

import { AdminSidebar } from "@/components/admin/sidebar"
import { TopNav } from "@/components/admin/top-nav"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const pathname = usePathname()

    // Close sidebar on navigation
    useEffect(() => {
        setSidebarOpen(false)
    }, [pathname])

    return (
        <div className="min-h-screen bg-[#f5f8f5] dark:bg-[#111520] transition-colors relative">
            <AdminSidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <div className="lg:pl-[220px] flex flex-col min-h-screen transition-all duration-300">
                <TopNav onOpenSidebar={() => setSidebarOpen(true)} />
                <main className="flex-1 pt-[60px]">
                    <div className="p-4 sm:p-6 lg:py-7">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    )
}
