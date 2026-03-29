"use client"

import { useState, useEffect } from "react"
import { Download, Search, Loader2, ArrowLeft, GraduationCap, Calendar, CheckCircle, XCircle, Clock } from "lucide-react"
import api from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

export default function StudentReportsPage() {
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
            const res = await api.get(`/reports/students?month=${targetMonth}&year=${targetYear}`)
            if (res.data?.success) setData(res.data.data)
        } catch (error) {
            toast({ title: "Error", description: "Failed to load student reports", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const filtered = data.filter(s => 
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        s.adm_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.standard && s.standard.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    const handleDownloadExcel = () => {
        if (!data || data.length === 0) {
            toast({ title: "No Data", description: "There is no data to export." })
            return
        }

        const headers = ["ID", "Name", "Standard", "Batch", "Status", "Att-Classes", "Att-Present", "Att-Absent", "Att-Late", "Att-Leave", "Hifz Progress", "Latest Exam Score"]
        const csvRows = [headers.join(",")]

        filtered.forEach(s => {
            const row = [
                s.adm_no,
                `"${s.name}"`,
                `"${s.standard || 'N/A'}"`,
                s.batch_year || 'N/A',
                s.status || 'Active',
                s.attendance?.total_classes || 0,
                s.attendance?.present || 0,
                s.attendance?.absent || 0,
                s.attendance?.late || 0,
                s.attendance?.leave || 0,
                `"${s.hifz_progress || 'N/A'}"`,
                `"${s.latest_exam_score || 'N/A'}"`
            ]
            csvRows.push(row.join(","))
        })

        const csvContent = csvRows.join("\n")
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.setAttribute("href", url)
        link.setAttribute("download", `Student_Report_${targetYear}_${targetMonth}.csv`)
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
                        <div className="h-10 w-10 bg-cyan-100 rounded-xl flex items-center justify-center">
                            <GraduationCap className="h-6 w-6 text-cyan-600" />
                        </div>
                        Student Reports
                    </h1>
                    <p className="text-slate-500 font-medium mt-1">Comprehensive monthly snapshot of student performance & attendance</p>
                </div>

                <div className="flex gap-4">
                    <select value={targetMonth} onChange={e => setTargetMonth(e.target.value)} className="bg-white border border-slate-200 text-sm font-bold text-slate-700 px-4 py-2.5 rounded-xl shadow-sm outline-none w-36 cursor-pointer hover:border-cyan-400 focus:border-cyan-500 transition-colors">
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
                            placeholder="Search by student name, ID or standard..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[13px] font-medium placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 shadow-sm transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-auto relative p-1">
                    {loading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10">
                            <Loader2 className="h-8 w-8 text-cyan-600 animate-spin mb-4" />
                            <span className="text-sm font-bold text-slate-500">Generating Report...</span>
                        </div>
                    ) : (
                        <table className="w-full min-w-[1200px]">
                            <thead className="sticky top-0 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] z-10">
                                <tr>
                                    <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-wider">Student Details</th>
                                    <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="px-4 py-4 text-center text-[11px] font-black text-slate-500 uppercase tracking-wider">
                                        <div className="flex items-center justify-center gap-1.5"><Calendar className="h-3 w-3" />Classes</div>
                                    </th>
                                    <th className="px-4 py-4 text-center text-[11px] font-black text-emerald-600 uppercase tracking-wider">
                                        <div className="flex items-center justify-center gap-1.5"><CheckCircle className="h-3 w-3" />Present</div>
                                    </th>
                                    <th className="px-4 py-4 text-center text-[11px] font-black text-rose-600 uppercase tracking-wider">
                                        <div className="flex items-center justify-center gap-1.5"><XCircle className="h-3 w-3" />Absent</div>
                                    </th>
                                    <th className="px-4 py-4 text-center text-[11px] font-black text-amber-500 uppercase tracking-wider">
                                        <div className="flex items-center justify-center gap-1.5"><Clock className="h-3 w-3" />Late / Leave</div>
                                    </th>
                                    <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-wider">Hifz Progress</th>
                                    <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-wider">Exam Results</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-16 text-center text-slate-500 font-medium text-[14px]">
                                            No student records found.
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((s, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-[14px] font-extrabold text-slate-800">{s.name}</span>
                                                    <span className="text-[12px] font-semibold text-slate-500">{s.adm_no} • {s.standard || 'No Std'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 text-[11px] font-bold rounded-md ${s.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {s.status ? s.status.toUpperCase() : 'ACTIVE'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className="text-[15px] font-black text-slate-700">{s.attendance?.total_classes || 0}</span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className="text-[15px] font-black text-emerald-600">{s.attendance?.present || 0}</span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className="text-[15px] font-black text-rose-600">{s.attendance?.absent || 0}</span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className="text-[14px] font-bold text-amber-600">{s.attendance?.late || 0}</span>
                                                <span className="text-slate-300 mx-1">/</span>
                                                <span className="text-[14px] font-bold text-blue-500">{s.attendance?.leave || 0}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-[13px] font-bold text-slate-700 p-2 bg-slate-100 rounded-lg inline-block">
                                                    {s.hifz_progress || 'N/A'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-[13px] font-bold text-slate-700">
                                                    Score: <span className="text-blue-600">{s.latest_exam_score || 'N/A'}</span>
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
