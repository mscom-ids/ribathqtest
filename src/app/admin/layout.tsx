"use client"

import { AdminSidebar } from "@/components/admin/sidebar"
import { TopNav } from "@/components/admin/top-nav"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [isCollapsed, setIsCollapsed] = useState(false)
    const pathname = usePathname()

    // Close sidebar on navigation (mobile)
    useEffect(() => {
        setSidebarOpen(false)
    }, [pathname])

    const isChatPage = pathname.startsWith('/admin/chat')

    return (
        <div className="min-h-screen bg-[#f5f8f5] dark:bg-[#111520] transition-colors relative">
            <AdminSidebar 
                mobileOpen={sidebarOpen} 
                onClose={() => setSidebarOpen(false)} 
                isCollapsed={isCollapsed}
                onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
            />
            <div className={cn(
                "flex flex-col min-h-screen transition-all duration-300",
                isCollapsed ? "lg:pl-[80px]" : "lg:pl-[260px]"
            )}>
                <TopNav onOpenSidebar={() => setSidebarOpen(true)} />
                <main className={`flex-1 pt-[60px] ${isChatPage ? 'overflow-hidden flex flex-col' : ''}`}>
                    {isChatPage ? (
                        children
                    ) : (
                        <div className="p-4 sm:p-6 lg:py-7">
                            {children}
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}
