"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import api from "@/lib/api"
import {
    EmptyState,
    formatDate,
    LeaveRecord,
    LoadingBlock,
    OutsideStudent,
    PrincipalFrame,
    PrincipalIcons,
    SectionHeader,
    StatCard,
    StudentSearchInput,
    usePrincipalRange,
} from "../_components/principal-ui"
import { Plus, X, User, Calendar, Clock, Check, AlertCircle, RefreshCw } from "lucide-react"
import { toast } from "sonner"

type ActiveStudentOption = {
    adm_no: string
    name: string
    standard?: string | null
}

export default function PrincipalLeavesPage() {
    const range = usePrincipalRange()
    const [outsideStudents, setOutsideStudents] = useState<OutsideStudent[]>([])
    const [activeLeaves, setActiveLeaves] = useState<LeaveRecord[]>([])
    const [history, setHistory] = useState<LeaveRecord[]>([])
    const [query, setQuery] = useState("")
    const [loading, setLoading] = useState(true)

    // Modal and student selection states
    const [showModal, setShowModal] = useState(false)
    const [studentsList, setStudentsList] = useState<ActiveStudentOption[]>([])
    const [studentSearch, setStudentSearch] = useState("")
    const [selectedStudent, setSelectedStudent] = useState<ActiveStudentOption | null>(null)
    const [showStudentDropdown, setShowStudentDropdown] = useState(false)

    // Form inputs
    const [leaveType, setLeaveType] = useState<"out-campus" | "on-campus" | "outdoor">("out-campus")
    const [startDatetime, setStartDatetime] = useState("")
    const [endDatetime, setEndDatetime] = useState("")
    const [reasonCategory, setReasonCategory] = useState("Personal")
    const [reason, setReason] = useState("")
    const [remarks, setRemarks] = useState("")
    const [companionName, setCompanionName] = useState("")
    const [companionRelationship, setCompanionRelationship] = useState("")
    const [submitting, setSubmitting] = useState(false)

    const fetchLeaves = async (silent = false) => {
        if (!silent) setLoading(true)
        try {
            const [outsideRes, activeRes, historyRes] = await Promise.allSettled([
                api.get("/leaves/outside-students"),
                api.get("/leaves/active"),
                api.get("/leaves"),
            ])
            if (outsideRes.status === "fulfilled") setOutsideStudents(outsideRes.value.data?.students || outsideRes.value.data?.data || [])
            if (activeRes.status === "fulfilled") setActiveLeaves(activeRes.value.data?.leaves || activeRes.value.data?.data || [])
            if (historyRes.status === "fulfilled") setHistory(historyRes.value.data?.leaves || historyRes.value.data?.data || [])
        } finally {
            if (!silent) setLoading(false)
        }
    }

    useEffect(() => {
        void fetchLeaves()
    }, [range.startDate, range.endDate])

    // Load active students list when modal is opened for searching
    useEffect(() => {
        if (!showModal) return
        async function fetchStudents() {
            try {
                const res = await api.get("/students", { params: { light: "true", status: "active", limit: 300 } })
                if (res.data?.success) {
                    setStudentsList(res.data.students || [])
                }
            } catch {
                toast.error("Failed to load students for select options")
            }
        }
        void fetchStudents()
    }, [showModal])

    const visibleOutside = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return outsideStudents
        return outsideStudents.filter((item) => [item.name, item.student_name, item.adm_no, item.student_id, item.standard].filter(Boolean).join(" ").toLowerCase().includes(q))
    }, [outsideStudents, query])

    const filteredStudentOptions = useMemo(() => {
        const q = studentSearch.trim().toLowerCase()
        if (!q) return studentsList.slice(0, 10)
        return studentsList.filter(s => s.name.toLowerCase().includes(q) || s.adm_no.toLowerCase().includes(q)).slice(0, 10)
    }, [studentsList, studentSearch])

    const handleRecordReturn = async (leaveId: string) => {
        try {
            await api.post("/leaves/record-return", {
                leave_id: leaveId,
                return_datetime: new Date().toISOString()
            })
            toast.success("Student return recorded successfully")
            void fetchLeaves(true)
        } catch (e: any) {
            toast.error(e.response?.data?.error || "Failed to record return")
        }
    }

    const resetForm = () => {
        setSelectedStudent(null)
        setStudentSearch("")
        setLeaveType("out-campus")
        setStartDatetime("")
        setEndDatetime("")
        setReasonCategory("Personal")
        setReason("")
        setRemarks("")
        setCompanionName("")
        setCompanionRelationship("")
    }

    const handleApplyLeave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedStudent) {
            toast.error("Please select a student")
            return
        }
        if (!startDatetime) {
            toast.error("Please enter a departure date & time")
            return
        }
        if (leaveType !== "outdoor" && !endDatetime) {
            toast.error("Please enter expected return date & time")
            return
        }

        setSubmitting(true)
        try {
            const payload = {
                student_id: selectedStudent.adm_no,
                leave_type: leaveType,
                start_datetime: new Date(startDatetime).toISOString(),
                end_datetime: endDatetime ? new Date(endDatetime).toISOString() : null,
                reason_category: reasonCategory,
                reason: reason || reasonCategory,
                remarks: remarks,
                companion_name: (leaveType === "out-campus" || leaveType === "outdoor") ? companionName : undefined,
                companion_relationship: (leaveType === "out-campus" || leaveType === "outdoor") ? companionRelationship : undefined,
            }

            await api.post("/leaves/personal", payload)
            toast.success(`Leave applied successfully for ${selectedStudent.name}`)
            setShowModal(false)
            resetForm()
            void fetchLeaves()
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Failed to register leave record")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <PrincipalFrame title="Leaves" subtitle="Institution leave visibility and principal leave actions." range={range}>
            {loading ? (
                <LoadingBlock label="Loading leave logs" />
            ) : (
                <div className="space-y-6">
                    {/* Metrics */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard icon={PrincipalIcons.DoorOpen} label="Currently Outside" value={outsideStudents.length} sub="Away from campus bounds" tone="amber" />
                        <StatCard icon={PrincipalIcons.CalendarDays} label="Active Leaves" value={activeLeaves.length} sub="Currently active records" tone="teal" />
                        <StatCard icon={PrincipalIcons.Users} label="Total Movements" value={history.length} sub="All logged history records" tone="sky" />
                        <StatCard icon={PrincipalIcons.AlertTriangle} label="Needs Return" value={outsideStudents.length} sub="Active outside counts" tone="rose" />
                    </div>

                    {/* Quick Launch Control */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <SectionHeader icon={PrincipalIcons.DoorOpen} title="Gatekeeper Controls" subtitle="Submit and record student leave movements directly." />
                        <div className="flex gap-2">
                            <button 
                                suppressHydrationWarning 
                                onClick={() => void fetchLeaves()}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 text-xs font-black text-slate-700 uppercase tracking-wider shadow-sm transition"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Refresh
                            </button>
                            <button 
                                suppressHydrationWarning 
                                onClick={() => setShowModal(true)}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 hover:bg-slate-900 px-5 text-xs font-black text-white uppercase tracking-wider shadow-md transition"
                            >
                                <Plus className="h-4 w-4 text-teal-400" />
                                Apply Leave
                            </button>
                        </div>
                    </section>

                    {/* Currently Outside List */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                        <SectionHeader icon={PrincipalIcons.DoorOpen} title="Currently Outside" subtitle="List of students currently checked out of campus grounds." />
                        <div className="max-w-md mt-2">
                            <StudentSearchInput value={query} onChange={setQuery} placeholder="Search outside students..." />
                        </div>
                        
                        {visibleOutside.length ? (
                            <div className="overflow-x-auto border border-slate-100 rounded-xl mt-4">
                                <table className="w-full border-collapse text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50 font-black text-slate-400 uppercase tracking-widest">
                                            <th className="px-5 py-4">Student</th>
                                            <th className="px-5 py-4 text-center">Admission No</th>
                                            <th className="px-5 py-4">Standard</th>
                                            <th className="px-5 py-4">Leave Class</th>
                                            <th className="px-5 py-4">Return Schedule</th>
                                            <th className="px-5 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                                        {visibleOutside.map((item, idx) => (
                                            <tr key={`${item.student_id || item.adm_no || idx}`} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-5 py-4 font-black text-slate-800">{item.name || item.student_name || "-"}</td>
                                                <td className="px-5 py-4 text-center">
                                                    <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] text-slate-600 font-bold">{item.adm_no || item.student_id || "-"}</span>
                                                </td>
                                                <td className="px-5 py-4 text-slate-500 font-bold">{item.standard || "-"}</td>
                                                <td className="px-5 py-4">
                                                    <span className="bg-amber-50 border border-amber-100 px-2.5 py-0.5 rounded-lg text-[9px] text-amber-600 uppercase font-black">{item.leave_type || item.reason_category || "Leave"}</span>
                                                </td>
                                                <td className="px-5 py-4 text-slate-500 font-bold">{formatDate(item.end_datetime)}</td>
                                                <td className="px-5 py-4 text-right">
                                                    <Link href={`/principal/students/${item.adm_no || item.student_id}`} className="text-[10px] font-black uppercase text-teal-600 hover:text-teal-800 tracking-wider mr-4">Profile</Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="mt-2">
                                <EmptyState title="No students currently outside" subtitle="All registered active students are inside campus bounds." />
                            </div>
                        )}
                    </section>

                    {/* Active Leaves List */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                        <SectionHeader icon={PrincipalIcons.CalendarDays} title="Active Leaves" subtitle="Ongoing leave logs showing departure and expected returns." />
                        
                        {activeLeaves.length ? (
                            <div className="overflow-x-auto border border-slate-100 rounded-xl mt-4">
                                <table className="w-full border-collapse text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50 font-black text-slate-400 uppercase tracking-widest">
                                            <th className="px-5 py-4">Student</th>
                                            <th className="px-5 py-4">Type</th>
                                            <th className="px-5 py-4">Reason / Notes</th>
                                            <th className="px-5 py-4">Period</th>
                                            <th className="px-5 py-4 text-center">Status</th>
                                            <th className="px-5 py-4 text-right">Operations</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                                        {activeLeaves.map((row) => (
                                            <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-5 py-4 font-black text-slate-800">
                                                    <div>
                                                        <p className="leading-none">{row.student?.name || "Student"}</p>
                                                        <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-wider font-bold">ADM {row.student?.adm_no}</p>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className="bg-teal-50 border border-teal-100/50 px-2 py-0.5 rounded text-[10px] text-teal-600 font-black uppercase tracking-wider">{row.leave_type || "Leave"}</span>
                                                </td>
                                                <td className="px-5 py-4 text-slate-500 font-bold max-w-xs truncate">{row.reason_category || row.remarks || "-"}</td>
                                                <td className="px-5 py-4 text-slate-500 font-bold">
                                                    {formatDate(row.start_datetime)} - {formatDate(row.end_datetime)}
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                    <span className="bg-amber-50 border border-amber-100/50 text-[10px] font-black uppercase text-amber-600 px-2.5 py-0.5 rounded-lg">{row.status || "-"}</span>
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    <div className="flex justify-end items-center gap-3">
                                                        <Link href={`/principal/students/${row.student?.adm_no}`} className="text-[10px] font-black uppercase text-teal-600 hover:text-teal-800 tracking-wider">Profile</Link>
                                                        {row.status === "outside" && (
                                                            <button
                                                                suppressHydrationWarning
                                                                onClick={() => handleRecordReturn(row.id)}
                                                                className="inline-flex h-7 items-center justify-center gap-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 text-[9px] font-black text-emerald-700 uppercase tracking-wider transition"
                                                            >
                                                                <Check className="h-3 w-3" />
                                                                Return
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="mt-2">
                                <EmptyState title="No active leaves log" subtitle="No registered students are on an ongoing leave status." />
                            </div>
                        )}
                    </section>

                    {/* Leave History List */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                        <SectionHeader icon={PrincipalIcons.BarChart3} title="Leave Logs Archive" subtitle="History log showing student departures and check-in statuses." />
                        
                        {history.length ? (
                            <div className="overflow-x-auto border border-slate-100 rounded-xl mt-4">
                                <table className="w-full border-collapse text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50 font-black text-slate-400 uppercase tracking-widest">
                                            <th className="px-5 py-4">Student</th>
                                            <th className="px-5 py-4">Type</th>
                                            <th className="px-5 py-4">Reason Category</th>
                                            <th className="px-5 py-4">Remarks</th>
                                            <th className="px-5 py-4">Leave Interval</th>
                                            <th className="px-5 py-4 text-right">Closing Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                                        {history.slice(0, 30).map((row) => {
                                            const isReturned = row.status === "returned" || row.status === "completed"
                                            return (
                                                <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-5 py-4 font-black text-slate-800">
                                                        <div>
                                                            <p className="leading-none">{row.student?.name || "Student"}</p>
                                                            <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-wider font-bold">ADM {row.student?.adm_no}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] text-slate-600 font-black uppercase tracking-wider">{row.leave_type || "Leave"}</span>
                                                    </td>
                                                    <td className="px-5 py-4 text-slate-500 font-bold">{row.reason_category || "-"}</td>
                                                    <td className="px-5 py-4 text-slate-500 font-bold max-w-xs truncate">{row.remarks || "-"}</td>
                                                    <td className="px-5 py-4 text-slate-500 font-bold">
                                                        {formatDate(row.start_datetime)} - {formatDate(row.end_datetime)}
                                                    </td>
                                                    <td className="px-5 py-4 text-right">
                                                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${isReturned ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-amber-50 text-amber-600 border border-amber-100"}`}>
                                                            {row.status || "-"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="mt-2">
                                <EmptyState title="No historical leaves logs" subtitle="Leave logs will compile here as students checkout and return." />
                            </div>
                        )}
                    </section>
                </div>
            )}

            {/* Apply Leave Modal popup */}
            {showModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm grid place-items-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-250 shadow-2xl p-6 w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-teal-50 border border-teal-100 text-teal-600">
                                    <Calendar className="h-4.5 w-4.5" />
                                </div>
                                <h3 className="text-sm font-black text-slate-800 tracking-tight uppercase">Apply Student Leave</h3>
                            </div>
                            <button 
                                suppressHydrationWarning 
                                onClick={() => { setShowModal(false); resetForm() }} 
                                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                            >
                                <X className="h-4.5 w-4.5" />
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleApplyLeave} className="flex-1 overflow-y-auto space-y-4 pr-1 py-4 text-xs font-semibold text-slate-700">
                            {/* Searchable Student Selection */}
                            <div className="space-y-1.5 relative">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                    <User className="h-3 w-3" /> Student Selection
                                </label>
                                
                                {selectedStudent ? (
                                    <div className="flex items-center justify-between p-3 rounded-xl border border-teal-200 bg-teal-50/20">
                                        <div>
                                            <p className="font-black text-slate-800">{selectedStudent.name}</p>
                                            <p className="text-[9px] font-bold text-teal-600 uppercase tracking-widest mt-0.5">ADM {selectedStudent.adm_no} • {selectedStudent.standard || "Class unassigned"}</p>
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={() => setSelectedStudent(null)}
                                            className="text-xs font-black text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <input 
                                            type="text" 
                                            value={studentSearch}
                                            onChange={(e) => { setStudentSearch(e.target.value); setShowStudentDropdown(true) }}
                                            onFocus={() => setShowStudentDropdown(true)}
                                            placeholder="Type student name or admission number..." 
                                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-800 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100/50 transition placeholder:text-slate-400"
                                        />
                                        {showStudentDropdown && studentSearch.trim() && (
                                            <div className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl divide-y divide-slate-50">
                                                {filteredStudentOptions.length === 0 ? (
                                                    <p className="p-3 text-slate-400 text-center font-bold">No students matched</p>
                                                ) : (
                                                    filteredStudentOptions.map(s => (
                                                        <button 
                                                            key={s.adm_no}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedStudent(s)
                                                                setShowStudentDropdown(false)
                                                            }}
                                                            className="w-full text-left p-3 hover:bg-slate-50 flex items-center justify-between font-bold"
                                                        >
                                                            <div>
                                                                <p className="text-slate-800">{s.name}</p>
                                                                <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-wider">ADM {s.adm_no} • {s.standard || "Class unassigned"}</p>
                                                            </div>
                                                            <span className="text-[9px] font-black text-teal-600 bg-teal-50 px-2 py-0.5 rounded">Select</span>
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Leave Type Selector */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Leave Classification</label>
                                <select 
                                    value={leaveType}
                                    onChange={(e) => setLeaveType(e.target.value as any)}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-black text-slate-700 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100/50 appearance-none cursor-pointer"
                                >
                                    <option value="out-campus">Out-Campus (Going Home)</option>
                                    <option value="on-campus">On-Campus Leave</option>
                                    <option value="outdoor">Outdoor / Day Checkout</option>
                                </select>
                            </div>

                            {/* Dates Container */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <Clock className="h-3 w-3" /> Departure Time
                                    </label>
                                    <input 
                                        type="datetime-local" 
                                        value={startDatetime}
                                        onChange={(e) => setStartDatetime(e.target.value)}
                                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-700 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100/50"
                                    />
                                </div>
                                {leaveType !== "outdoor" && (
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                            <Clock className="h-3 w-3" /> Expected Return
                                        </label>
                                        <input 
                                            type="datetime-local" 
                                            value={endDatetime}
                                            onChange={(e) => setEndDatetime(e.target.value)}
                                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-700 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100/50"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Companion Fields (Only for out-campus or outdoor) */}
                            {(leaveType === "out-campus" || leaveType === "outdoor") && (
                                <div className="grid grid-cols-2 gap-3 border border-slate-100 bg-slate-50/50 rounded-xl p-3.5 space-y-0.5">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Going With (Name)</label>
                                        <input 
                                            type="text" 
                                            value={companionName}
                                            onChange={(e) => setCompanionName(e.target.value)}
                                            placeholder="Companion Name"
                                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-800 outline-none focus:border-teal-400"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Relationship</label>
                                        <input 
                                            type="text" 
                                            value={companionRelationship}
                                            onChange={(e) => setCompanionRelationship(e.target.value)}
                                            placeholder="Father, Brother, etc."
                                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-800 outline-none focus:border-teal-400"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Reason Category */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Reason Classification</label>
                                <select 
                                    value={reasonCategory}
                                    onChange={(e) => setReasonCategory(e.target.value)}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-black text-slate-700 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100/50 appearance-none cursor-pointer"
                                >
                                    <option value="Personal">Personal Reason</option>
                                    <option value="Medical">Medical Checkup / Illness</option>
                                    <option value="Family">Family Function / Emergency</option>
                                    <option value="Festival">Religious Festival</option>
                                    <option value="Academic">Academic / Study Break</option>
                                    <option value="Other">Other Reasons</option>
                                </select>
                            </div>

                            {/* Detailed Description */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Remarks / Detailed Reason</label>
                                <textarea 
                                    rows={2}
                                    value={remarks}
                                    onChange={(e) => setRemarks(e.target.value)}
                                    placeholder="Enter additional remarks or reasons..." 
                                    className="w-full rounded-xl border border-slate-200 bg-white p-3 font-bold text-slate-800 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100/50 placeholder:text-slate-400 resize-none"
                                />
                            </div>

                            {/* Footer Submit Buttons */}
                            <div className="flex gap-2.5 pt-3 border-t border-slate-100">
                                <button 
                                    type="button" 
                                    onClick={() => { setShowModal(false); resetForm() }}
                                    className="flex-1 h-11 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-black uppercase tracking-wider shadow-sm transition"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={submitting}
                                    className="flex-1 h-11 rounded-xl bg-slate-950 hover:bg-slate-900 text-white text-xs font-black uppercase tracking-wider shadow-md transition disabled:opacity-50"
                                >
                                    {submitting ? "Applying..." : "Submit"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </PrincipalFrame>
    )
}
