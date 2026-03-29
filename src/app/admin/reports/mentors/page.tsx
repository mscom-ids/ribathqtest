"use client"

import { useState, useEffect } from "react"
import { Download, Search, Loader2, ArrowLeft, UserCog, Calendar, CheckCircle, XCircle } from "lucide-react"
import api from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

export default function MentorReportsPage() {
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [targetMonth, setTargetMonth] = useState((new Date().getMonth() + 1).toString())
    const [targetYear, setTargetYear] = useState((new Date().getFullYear()).toString())
    const { toast } = useToast()
    const router = useRouter()

    useEffect(() => {
        fetchReports()
    }, [targetMonth, targetYear])

    const fetchReports = async () => {
        setLoading(true)
        try {
            const res = await api.get(`/reports/mentors?month=${targetMonth}&year=${targetYear}`)
            if (res.data?.success) setData(res.data.data)
        } catch (error) {
            toast({ title: "Error", description: "Failed to load mentor reports", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const filtered = data.filter(m => 
        m.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        m.role?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const handleDownloadExcel = () => {
        if (!data || data.length === 0) {
            toast({ title: "No Data", description: "There is no data to export." })
            return
        }

        const headers = ["ID", "Name", "Role", "Phone", "Status", "Total Marked Days", "Present", "Absent", "Leave Used"]
        const csvRows = [headers.join(",")]

        filtered.forEach(m => {
            const row = [
                m.id,
                `"${m.name || 'Un-named Mentor'}"`,
                `"${m.role || 'Role N/A'}"`,
                m.phone || 'N/A',
                m.active ? 'Active' : 'Archived',
                m.attendance?.total_marked || 0,
                m.attendance?.present || 0,
                m.attendance?.absent || 0,
                m.attendance?.leave || 0
            ]
            csvRows.push(row.join(","))
        })

        const csvContent = csvRows.join("\n")
        // Create Blob and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.setAttribute("href", url)
        link.setAttribute("download", `Mentor_Report_${targetYear}_${targetMonth}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] w-full">
            {/* Header Area */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <button onClick={() => router.push('/admin')} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 text-[13px] font-bold mb-4 transition-colors">
                        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
                    </button>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                        <div className="h-10 w-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <UserCog className="h-6 w-6 text-emerald-600" />
                        </div>
                        Mentor Reports
                    </h1>
                    <p className="text-slate-500 font-medium mt-1">Monthly evaluation logs and attendance status for active mentors</p>
                </div>

                <div className="flex gap-4">
                    <select value={targetMonth} onChange={e => setTargetMonth(e.target.value)} className="bg-white border border-slate-200 text-sm font-bold text-slate-700 px-4 py-2.5 rounded-xl shadow-sm outline-none w-36 cursor-pointer hover:border-emerald-400 focus:border-emerald-500 transition-colors">
                        {months.map((m, i) => (
                            <option key={i} value={i + 1}>{m}</option>
                        ))}
                    </select>

                    <button onClick={handleDownloadExcel} className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-[14px] px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
                        <Download className="h-4 w-4" />
                        Download CSV
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by mentor name or core role..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[13px] font-medium placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-sm transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-auto relative p-1">
                    {loading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10">
                            <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mb-4" />
                            <span className="text-sm font-bold text-slate-500">Generating Report...</span>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="sticky top-0 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] z-10">
                                <tr>
                                    <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-wider">Mentor Profile</th>
                                    <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-wider">Role & Status</th>
                                    <th className="px-4 py-4 text-center text-[11px] font-black text-slate-500 uppercase tracking-wider">
                                        <div className="flex items-center justify-center gap-1.5"><Calendar className="h-3 w-3" />Days Expected</div>
                                    </th>
                                    <th className="px-4 py-4 text-center text-[11px] font-black text-emerald-600 uppercase tracking-wider">
                                        <div className="flex items-center justify-center gap-1.5"><CheckCircle className="h-3 w-3" />Present</div>
                                    </th>
                                    <th className="px-4 py-4 text-center text-[11px] font-black text-rose-600 uppercase tracking-wider">
                                        <div className="flex items-center justify-center gap-1.5"><XCircle className="h-3 w-3" />Absent</div>
                                    </th>
                                    <th className="px-4 py-4 text-center text-[11px] font-black text-blue-500 uppercase tracking-wider">Leaves Taken</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-16 text-center text-slate-500 font-medium text-[14px]">
                                            No explicit mentor records tracked for this period.
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((m, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-[14px] font-extrabold text-slate-800">{m.name}</span>
                                                    <span className="text-[12px] font-semibold text-slate-500">{m.phone || 'No phone record'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col items-start gap-1">
                                                    <span className="text-[14px] font-bold text-slate-700">{m.role}</span>
                                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${m.active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                                        {m.active ? 'ACTIVE' : 'ARCHIVED'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className="text-[15px] font-black text-slate-700">{m.attendance?.total_marked || 0}</span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className="text-[15px] font-black text-emerald-600">{m.attendance?.present || 0}</span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className="text-[15px] font-black text-rose-600">{m.attendance?.absent || 0}</span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <div className="text-[15px] font-bold mt-1 text-blue-600">
                                                    {m.attendance?.leave || 0} <span className="text-[10px] text-slate-400 font-medium">days</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}
