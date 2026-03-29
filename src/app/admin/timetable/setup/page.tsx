"use client"

import { useState, useEffect } from "react"
import { X, RefreshCw, Printer, Clock, User, Download, Search, Edit2, Trash2, XCircle, AlertCircle } from "lucide-react"
import api from "@/lib/api"
import Cookies from "js-cookie"
import { cn } from "@/lib/utils"

export default function TimeTableSetupPage() {
    const [loading, setLoading] = useState(true)
    const [schedules, setSchedules] = useState<any[]>([])
    const [breaks, setBreaks] = useState<any[]>([])

    // Auth context
    const [userRole, setUserRole] = useState("")
    const [userId, setUserId] = useState("")

    const [activeTab, setActiveTab] = useState('school')
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [editBreakModal, setEditBreakModal] = useState<any>(null)
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

    // Form states
    const [newSchedule, setNewSchedule] = useState({
        class_type: 'school',
        name: '',
        standards: [] as string[],
        day_of_week: 0,
        start_time: '09:00',
        end_time: '09:45'
    })

    const availableStandards = [
        "Hifz Only", "1st Standard", "2nd Standard", "3rd Standard", "4th Standard",
        "5th Standard", "6th Standard", "7th Standard", "8th Standard",
        "9th Standard", "10th Standard", "+1 (Plus One)", "+2 (Plus Two)"
    ]

    useEffect(() => {
        const token = Cookies.get('auth_token')
        if (token) {
            try {
                const p = JSON.parse(atob(token.split('.')[1]))
                setUserRole(p.role)
                setUserId(p.id)
            } catch {}
        }
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [schedRes, breaksRes] = await Promise.all([
                api.get('/attendance/schedules'),
                api.get('/attendance/breaks')
            ])
            if (schedRes.data.success) setSchedules(schedRes.data.data)
            if (breaksRes.data.success) setBreaks(breaksRes.data.data)
        } catch (e) {
            console.error("Failed to load timetable data", e)
        }
        setLoading(false)
    }

    const handleCreateSchedule = async (e: React.FormEvent) => {
        e.preventDefault()
        if (newSchedule.standards.length === 0) {
            alert("Please select at least one standard.")
            return
        }
        try {
            const res = await api.post('/attendance/schedules', {
                ...newSchedule,
                duration_mins: 45
            })
            if (res.data.success) {
                setIsAddModalOpen(false)
                setNewSchedule({ class_type: activeTab, name: '', standards: [], day_of_week: 1, start_time: '09:00', end_time: '09:45' })
                fetchData()
            }
        } catch (e: any) {
            alert(e.response?.data?.error || "Failed to create schedule")
        }
    }

    const handleDeleteSchedule = async (id: string) => {
        try {
            await api.delete(`/attendance/schedules/${id}`)
            setDeleteConfirm(null)
            fetchData()
        } catch (e: any) {
            alert(e.response?.data?.error || "Failed to delete schedule")
        }
    }

    const handleUpdateBreak = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editBreakModal) return
        try {
            const res = await api.post(`/attendance/breaks/${editBreakModal.id}`, {
                start_time: editBreakModal.start_time,
                end_time: editBreakModal.end_time
            })
            if (res.data.success) {
                setEditBreakModal(null)
                fetchData()
            }
        } catch (e: any) {
            alert(e.response?.data?.error || "Failed to update break")
        }
    }

    const daysMapping = [
        { id: 0, name: "Sunday" },
        { id: 1, name: "Monday" },
        { id: 2, name: "Tuesday" },
        { id: 3, name: "Wednesday" },
        { id: 4, name: "Thursday" },
        { id: 5, name: "Friday" },
        { id: 6, name: "Saturday" },
    ]

    const getClassColorBg = (type: string) => {
        const t = (type || "").toLowerCase()
        if (t === 'hifz') return 'bg-[#fff2e6] border-[#ffd699] dark:bg-[#462d18]'
        if (t === 'madrassa') return 'bg-[#e6ffe6] border-[#99ff99] dark:bg-[#1C6B3A]/30'
        if (t === 'school') return 'bg-[#e6f2ff] border-[#99ccff] dark:bg-[#1a2d4a]'
        return 'bg-slate-50 border-slate-200 dark:bg-slate-800'
    }

    const getBreakColorObj = (type: string) => {
        if (type === 'morning') return { bg: 'bg-[#4f46e5]', text: 'Morning Break' }
        if (type === 'lunch') return { bg: 'bg-[#f59e0b]', text: 'Lunch' }
        if (type === 'evening') return { bg: 'bg-[#06b6d4]', text: 'Evening Break' }
        return { bg: 'bg-slate-600', text: 'Break' }
    }

    const isAuthority = ['admin', 'principal', 'vice_principal'].includes(userRole)

    function formatTime(t: string | undefined) {
        if (!t) return ""
        let [h, m] = t.split(':')
        let hour = parseInt(h)
        let ampm = hour >= 12 ? 'PM' : 'AM'
        hour = hour % 12 || 12
        return `${hour < 10 ? '0'+hour : hour}:${m} ${ampm}`
    }

    return (
        <div className="space-y-6 pb-12 w-full max-w-[1500px] mx-auto min-h-screen">

            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-t-xl border-b border-slate-100 dark:border-slate-800">
                <div>
                    <h1 className="text-[20px] font-bold text-slate-800 dark:text-white">Time Table</h1>
                    <p className="text-[13px] text-slate-500 font-medium tracking-wide">Dashboard <span className="mx-1">/</span> Academic <span className="mx-1">/</span> <span className="text-slate-700 dark:text-slate-300">Time Table</span></p>
                </div>

                <div className="flex items-center flex-wrap gap-2">

                    <div className="flex bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded overflow-hidden shadow-sm h-[38px]">
                        <button onClick={() => fetchData()} className="px-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition border-r border-slate-200 dark:border-slate-700 text-slate-500">
                            <RefreshCw className="h-[15px] w-[15px]" />
                        </button>
                        <button className="px-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center gap-2 border-r border-slate-200 dark:border-slate-700 text-slate-600 text-[13px] font-medium">
                            <Printer className="h-4 w-4" />
                        </button>
                        <button className="px-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center gap-2 text-slate-600 text-[13px] font-medium">
                            <Download className="h-4 w-4" /> Export
                        </button>
                    </div>

                    {isAuthority && (
                        <button onClick={() => { setNewSchedule({...newSchedule, name: '', class_type: activeTab}); setIsAddModalOpen(true); }} className="flex items-center gap-1.5 bg-[#4f46e5] hover:bg-[#4338ca] text-white px-4 py-2 rounded shadow text-[13px] font-semibold h-[38px] transition">
                            <span className="text-lg leading-none">+</span> Add Time Table
                        </button>
                    )}
                </div>
            </div>

            {/* The Main Grid */}
            <div className="bg-white dark:bg-[#1e2433] rounded-b-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-800 border-t-0 -mt-6">

                {/* Tabs */}
                <div className="flex px-4 border-b border-slate-100 dark:border-slate-800">
                    {['School', 'Hifz', 'Madrassa'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab.toLowerCase())}
                            className={cn(
                                "px-6 py-4 text-[14px] font-bold border-b-[3px] transition-colors",
                                activeTab.toLowerCase() === tab.toLowerCase()
                                    ? "border-[#4f46e5] text-[#4f46e5]"
                                    : "border-transparent text-slate-500 hover:text-slate-700"
                            )}>
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="flex justify-between items-center px-4 py-4">
                    <h2 className="text-[16px] font-bold text-slate-800 dark:text-white capitalize">{activeTab} Time Table</h2>
                    <button className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded text-[13px] text-slate-600 font-medium hover:bg-slate-50">
                        <Search className="h-3.5 w-3.5" /> Filter
                    </button>
                </div>

                <div className="overflow-x-auto px-4 pb-4">
                    <div className="min-w-[1250px] flex gap-4">
                        {daysMapping.map((day) => {
                            const daySchedules = schedules.filter(s => s.day_of_week === day.id && s.class_type.toLowerCase() === activeTab.toLowerCase())

                            return (
                                <div key={day.id} className="flex-1">
                                    <h3 className="text-[14px] font-bold text-slate-700 dark:text-slate-300 mb-4 pb-2 text-left">
                                        {day.name}
                                    </h3>

                                    <div className="space-y-3">
                                        {daySchedules.length === 0 ? (
                                            <div className="h-20 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center">
                                                <span className="text-[12px] text-slate-400">No classes</span>
                                            </div>
                                        ) : (
                                            daySchedules.map(sched => {
                                                const stds = typeof sched.standards === 'string' ? JSON.parse(sched.standards || '[]') : (sched.standards || [])

                                                return (
                                                    <div key={sched.id} className={cn(
                                                        "rounded-md p-3.5 relative group overflow-hidden border transition-all flex flex-col justify-between",
                                                        getClassColorBg(sched.class_type)
                                                    )}>
                                                        {/* Delete button on hover (authority only) */}
                                                        {isAuthority && (
                                                            <button
                                                                onClick={() => setDeleteConfirm(sched.id)}
                                                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-rose-500/80 hover:text-rose-600 bg-white/60 hover:bg-white rounded p-1 transition-all">
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                        <div>
                                                            <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                                                                <Clock className="h-3.5 w-3.5" />
                                                                <span>{formatTime(sched.start_time)} - {formatTime(sched.end_time)}</span>
                                                            </div>
                                                            <p className="text-[14px] font-semibold text-slate-800 dark:text-white mb-1">
                                                                {sched.name ? sched.name : <span className="capitalize">Class Type : {sched.class_type}</span>}
                                                            </p>
                                                            {sched.effective_from && (
                                                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">
                                                                    Active from: {new Date(sched.effective_from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            {stds.map((std: string, i: number) => (
                                                                <span key={i} className="bg-white/90 dark:bg-black/40 rounded px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 shadow-sm border border-slate-100 dark:border-slate-700">
                                                                    {std}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            })
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Editable Breaks Bottom Section */}
                <div className="mt-8 pt-6 border-t-[2px] border-slate-100 dark:border-slate-800 px-4 flex flex-wrap gap-5 pb-4">
                    {breaks.map(breakItem => {
                        const styleDesc = getBreakColorObj(breakItem.type)
                        return (
                            <div key={breakItem.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg p-4 w-full sm:w-[280px] shadow-sm flex flex-col items-start gap-3 relative overflow-hidden group">
                                <div className={cn(styleDesc.bg, "text-white text-[12px] font-bold px-3 py-1 rounded-md")}>
                                    {breakItem.name}
                                </div>
                                <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                    <Clock className="h-4 w-4"/> {formatTime(breakItem.start_time)} to {formatTime(breakItem.end_time)}
                                </p>

                                {isAuthority && (
                                    <button onClick={() => setEditBreakModal(breakItem)} className="absolute bottom-4 right-4 text-slate-300 hover:text-[#4f46e5] transition-colors rounded">
                                        <Edit2 className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-sm shadow-xl relative animate-in zoom-in-95 duration-200 text-center">
                        <div className="w-14 h-14 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Trash2 className="h-6 w-6 text-rose-500" />
                        </div>
                        <h2 className="text-[16px] font-bold text-slate-900 dark:text-white mb-2">Deactivate Schedule?</h2>
                        <p className="text-[13px] text-slate-500 mb-2">This class will be deactivated from today onwards.</p>
                        <p className="text-[12px] text-emerald-600 dark:text-emerald-400 font-medium mb-6">Past attendance data will be preserved.</p>
                        <div className="flex gap-2 justify-center">
                            <button onClick={() => setDeleteConfirm(null)} className="px-5 py-2 rounded text-slate-600 font-bold text-[13px] bg-slate-100 hover:bg-slate-200 transition">Cancel</button>
                            <button onClick={() => handleDeleteSchedule(deleteConfirm)} className="px-5 py-2 rounded bg-rose-600 text-white font-bold text-[13px] hover:bg-rose-700 transition">Deactivate</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Time Table Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-lg shadow-xl relative animate-in slide-in-from-bottom-4 duration-300">
                        <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 transition">
                            <X className="h-5 w-5" />
                        </button>
                        <h2 className="text-[18px] font-bold text-slate-900 dark:text-white mb-6 border-b pb-3 border-slate-100 dark:border-slate-800">Assign Time Table Block</h2>

                        <form onSubmit={handleCreateSchedule} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[12px] font-bold text-slate-600 dark:text-slate-400 mb-1">Class Type <span className="text-rose-500">*</span></label>
                                    <select value={newSchedule.class_type} onChange={e => setNewSchedule({...newSchedule, class_type: e.target.value})}
                                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-2 text-[13px] focus:ring-1 focus:ring-[#4f46e5] outline-none">
                                        <option value="school">School</option>
                                        <option value="hifz">Hifz</option>
                                        <option value="madrassa">Madrassa</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[12px] font-bold text-slate-600 dark:text-slate-400 mb-1">Select Day <span className="text-rose-500">*</span></label>
                                    <select value={newSchedule.day_of_week} onChange={e => setNewSchedule({...newSchedule, day_of_week: Number(e.target.value)})}
                                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-2 text-[13px] focus:ring-1 focus:ring-[#4f46e5] outline-none">
                                        {daysMapping.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[12px] font-bold text-slate-600 dark:text-slate-400 mb-1">Class Name (Optional)</label>
                                <input type="text" value={newSchedule.name} onChange={e => setNewSchedule({...newSchedule, name: e.target.value})}
                                    placeholder="e.g. Morning Hifz"
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-2 text-[13px] focus:ring-1 focus:ring-[#4f46e5] outline-none" />
                            </div>

                            <div>
                                <label className="block text-[12px] font-bold text-slate-600 dark:text-slate-400 mb-2">Standards <span className="text-rose-500">*</span></label>
                                <div className="flex flex-wrap gap-2 max-h-[140px] overflow-y-auto p-1">
                                    {availableStandards.map(std => {
                                        const isSelected = newSchedule.standards.includes(std)
                                        return (
                                            <button
                                                type="button"
                                                key={std}
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setNewSchedule({...newSchedule, standards: newSchedule.standards.filter(s => s !== std)})
                                                    } else {
                                                        setNewSchedule({...newSchedule, standards: [...newSchedule.standards, std]})
                                                    }
                                                }}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[12px] font-bold transition-all border shadow-sm",
                                                    isSelected
                                                        ? "bg-[#4f46e5] text-white border-[#4f46e5]"
                                                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#4f46e5]/50"
                                                )}>
                                                {std}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[12px] font-bold text-slate-600 dark:text-slate-400 mb-1">Start Time <span className="text-rose-500">*</span></label>
                                    <input type="time" value={newSchedule.start_time} onChange={e => setNewSchedule({...newSchedule, start_time: e.target.value})} required
                                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-2 text-[13px] focus:ring-1 focus:ring-[#4f46e5] outline-none"/>
                                </div>
                                <div>
                                    <label className="block text-[12px] font-bold text-slate-600 dark:text-slate-400 mb-1">End Time <span className="text-rose-500">*</span></label>
                                    <input type="time" value={newSchedule.end_time} onChange={e => setNewSchedule({...newSchedule, end_time: e.target.value})} required
                                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-2 text-[13px] focus:ring-1 focus:ring-[#4f46e5] outline-none"/>
                                </div>
                            </div>

                            <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 rounded text-slate-600 font-bold text-[13px] bg-slate-100 hover:bg-slate-200 transition">Cancel</button>
                                <button type="submit" className="px-5 py-2 rounded bg-[#4f46e5] text-white font-bold text-[13px] shadow-sm hover:bg-[#4338ca] transition">Save Block</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Break Modal */}
            {editBreakModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-sm shadow-xl relative animate-in zoom-in-95 duration-200">
                        <button onClick={() => setEditBreakModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 transition">
                            <X className="h-5 w-5" />
                        </button>
                        <h2 className="text-[16px] font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">Edit {editBreakModal.name} Time</h2>

                        <form onSubmit={handleUpdateBreak} className="space-y-4">
                            <div>
                                <label className="block text-[12px] font-bold text-slate-600 dark:text-slate-400 mb-1">Start Time</label>
                                <input type="time" value={editBreakModal.start_time} onChange={e => setEditBreakModal({...editBreakModal, start_time: e.target.value})} required
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-2.5 text-[14px] focus:ring-1 focus:ring-[#4f46e5] outline-none"/>
                            </div>
                            <div>
                                <label className="block text-[12px] font-bold text-slate-600 dark:text-slate-400 mb-1">End Time</label>
                                <input type="time" value={editBreakModal.end_time} onChange={e => setEditBreakModal({...editBreakModal, end_time: e.target.value})} required
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-2.5 text-[14px] focus:ring-1 focus:ring-[#4f46e5] outline-none"/>
                            </div>

                            <div className="flex gap-2 justify-end mt-6">
                                <button type="button" onClick={() => setEditBreakModal(null)} className="px-4 py-2 rounded text-slate-600 font-medium text-[13px] hover:bg-slate-100">Cancel</button>
                                <button type="submit" className="px-5 py-2 rounded bg-slate-800 dark:bg-slate-700 text-white font-bold text-[13px] shadow-sm hover:bg-slate-700 transition">Update Break</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
