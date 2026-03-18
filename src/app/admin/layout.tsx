"use client"

import { AdminSidebar } from "@/components/admin/sidebar"
import { TopNav } from "@/components/admin/top-nav"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-[#f5f8f5]">
            <AdminSidebar />
            <div className="pl-[220px] flex flex-col min-h-screen">
                <TopNav />
                <main className="flex-1 pt-[60px]">
                    <div className="px-6 py-7">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    )
}
