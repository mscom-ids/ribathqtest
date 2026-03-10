import { AdminSidebar } from "@/components/admin/sidebar"

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-[#0a0e17]">
            <AdminSidebar />
            <main className="p-4 md:p-6">
                {children}
            </main>
        </div>
    )
}
