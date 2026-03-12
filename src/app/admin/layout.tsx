import { AdminSidebar } from "@/components/admin/sidebar"
import { TopHeader } from "@/components/admin/top-header"

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex h-screen overflow-hidden bg-[#eff3f8] relative">
            <AdminSidebar />

            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white shadow-sm z-30 flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-[#4f46e5] flex items-center justify-center text-white font-bold text-lg">
                        R
                    </div>
                    <span className="font-bold text-slate-800">Ribathul Quran</span>
                </div>
                <button className="p-2 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-100">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
                </button>
            </div>

            {/* Main content — fixed height container with internal scrolling */}
            <main className="flex-1 w-full h-screen pt-20 pb-4 px-4 md:p-4 transition-all duration-300 md:ml-[68px] peer-data-[expanded=true]:md:ml-[188px] flex flex-col overflow-hidden">
                <div className="max-w-[1600px] w-full mx-auto bg-white/70 backdrop-blur-2xl rounded-[28px] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)] border border-white/80 flex flex-col h-full overflow-hidden">
                    {/* Fixed Top Header */}
                    <div className="px-5 md:px-7 pt-5 md:pt-7 shrink-0 z-20">
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
