"use client"

import { useState, useEffect } from "react"
import { Users, Clock, BookMarked, Layers, Search, AlertCircle, RefreshCw } from "lucide-react"
import api from "@/lib/api"
import { cn } from "@/lib/utils"
import Cookies from "js-cookie"

export default function TimetableViewerPage() {
    const [loading, setLoading] = useState(true)
    const [schedules, setSchedules] = useState<any[]>([])
    
    // Switch between 'mentor' mode and 'class' mode
    const [viewMode, setViewMode] = useState<'mentor' | 'class'>('class')

    // Mentor states
    const [staffList, setStaffList] = useState<any[]>([])
    const [selectedMentorId, setSelectedMentorId] = useState<string>('')
    const [mentorScheduleIds, setMentorScheduleIds] = useState<string[]>([])

    // Class states
    const [availableStandards, setAvailableStandards] = useState<string[]>([])
    const [selectedStandard, setSelectedStandard] = useState<string>('')

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [schedRes, staffRes] = await Promise.all([
                api.get('/attendance/schedules'),
                api.get('/staff')
            ])

            if (schedRes.data.success) {
                const allSchedules = schedRes.data.data
                setSchedules(allSchedules)
                
                // Extract unique standards
                const stdSet = new Set<string>()
                allSchedules.forEach((s: any) => {
                    try {
                        const parsed = typeof s.standards === 'string' ? JSON.parse(s.standards) : s.standards
                        if (Array.isArray(parsed)) parsed.forEach(std => stdSet.add(std))
                    } catch(e) {}
                })
                const sortedStds = Array.from(stdSet)
                setAvailableStandards(sortedStds)
                if (sortedStds.length > 0) setSelectedStandard(sortedStds[0])
            }

            const staffObj = staffRes.data.data || staffRes.data.staff || staffRes.data || []
            const staffArray = Array.isArray(staffObj) ? staffObj : []
            setStaffList(staffArray)
            if (staffArray.length > 0) setSelectedMentorId(staffArray[0].id)
            
        } catch (e) {
            console.error("Failed to load viewer data", e)
        }
        setLoading(false)
    }

    // Fetch mentor specific schedules
    useEffect(() => {
        const fetchMentorSchedules = async () => {
            if (viewMode !== 'mentor' || !selectedMentorId) return
            try {
                // Determine active academic year. Let's just pass nothing to get current.
                const res = await api.get(`/attendance/mentor-schedules?mentor_id=${selectedMentorId}`)
                if (res.data.success) {
                    setMentorScheduleIds(res.data.schedule_ids || [])
                }
            } catch (e) { console.error("Failed to fetch mentor schedule list", e) }
        }
        fetchMentorSchedules()
    }, [selectedMentorId, viewMode])

    const daysMapping = [
        { id: 0, name: "Sunday" },
        { id: 1, name: "Monday" },
        { id: 2, name: "Tuesday" },
        { id: 3, name: "Wednesday" },
        { id: 4, name: "Thursday" },
        { id: 5, name: "Friday" },
        { id: 6, name: "Saturday" },
    ]

    function formatTime(t: string | undefined) {
        if (!t) return ""
        let [h, m] = t.split(':')
        let hour = parseInt(h)
        let ampm = hour >= 12 ? 'PM' : 'AM'
        hour = hour % 12 || 12
        return `${hour < 10 ? '0'+hour : hour}:${m} ${ampm}`
    }

    const getClassColorBg = (type: string) => {
        const t = (type || "").toLowerCase()
        if (t === 'hifz') return 'bg-amber-50/50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800'
        if (t === 'madrassa') return 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-800'
        if (t === 'school') return 'bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800'
        return 'bg-slate-50 border-slate-200 dark:bg-slate-800'
    }

    const getBadgeColor = (type: string) => {
         const t = (type || "").toLowerCase()
        if (t === 'hifz') return 'bg-amber-500'
        if (t === 'madrassa') return 'bg-emerald-500'
        if (t === 'school') return 'bg-blue-500'
        return 'bg-slate-500'
    }

    // Derive displayed schedules
    let displayedSchedules = []
    if (viewMode === 'mentor') {
        displayedSchedules = schedules.filter(s => mentorScheduleIds.includes(s.id))
    } else {
        displayedSchedules = schedules.filter(s => {
            try {
                const stds = typeof s.standards === 'string' ? JSON.parse(s.standards) : s.standards
                return Array.isArray(stds) && stds.includes(selectedStandard)
            } catch { return false }
        })
    }

    return (
        <div className="space-y-6 pb-12 w-full max-w-[1500px] mx-auto min-h-screen">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-t-xl border-b border-slate-100 dark:border-slate-800">
                <div>
                    <h1 className="text-[20px] font-bold text-slate-800 dark:text-white">Timetable Viewer</h1>
                    <p className="text-[13px] text-slate-500 font-medium tracking-wide">
                        Dashboard <span className="mx-1">/</span> Time Table <span className="mx-1">/</span> <span className="text-slate-700 dark:text-slate-300">Viewer</span>
                    </p>
                </div>
            </div>

            {/* Filter Section */}
            <div className="bg-white dark:bg-[#1e2433] rounded-b-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-800 border-t-0 -mt-6">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-5 items-start md:items-center justify-between">
                    
                    {/* View Switcher */}
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                        <button 
                            onClick={() => setViewMode('class')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 text-[13px] font-bold rounded-md transition-all",
                                viewMode === 'class' ? "bg-white dark:bg-slate-700 text-[#4f46e5] shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            )}>
                            <Layers className="h-4 w-4" /> By Class/Batch
                        </button>
                        <button 
                            onClick={() => setViewMode('mentor')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 text-[13px] font-bold rounded-md transition-all",
                                viewMode === 'mentor' ? "bg-white dark:bg-slate-700 text-[#4f46e5] shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            )}>
                            <Users className="h-4 w-4" /> By Mentor
                        </button>
                    </div>

                    {/* Context Selector */}
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="flex-1 md:w-[250px] relative">
                            {viewMode === 'class' ? (
                                <select 
                                    value={selectedStandard} 
                                    onChange={e => setSelectedStandard(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-2.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200 appearance-none focus:ring-2 focus:outline-none focus:ring-[#4f46e5]/30">
                                    {availableStandards.length === 0 && <option value="">No classes found</option>}
                                    {availableStandards.map(std => <option key={std} value={std}>{std}</option>)}
                                </select>
                            ) : (
                                <select 
                                    value={selectedMentorId} 
                                    onChange={e => setSelectedMentorId(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-2.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200 appearance-none focus:ring-2 focus:outline-none focus:ring-[#4f46e5]/30">
                                    {staffList.length === 0 && <option value="">No mentors found</option>}
                                    {staffList.map(staff => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
                                </select>
                            )}
                        </div>
                        <button onClick={fetchData} className="px-3 h-[42px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 transition text-slate-500">
                            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                        </button>
                    </div>

                </div>

                {/* Grid */}
                <div className="overflow-x-auto p-5">
                    <div className="min-w-[1250px] flex gap-4">
                        {daysMapping.map((day) => {
                            const todaySchedules = displayedSchedules
                                .filter(s => s.day_of_week === day.id)
                                .sort((a, b) => a.start_time.localeCompare(b.start_time))

                            return (
                                <div key={day.id} className="flex-1 flex flex-col items-stretch">
                                    <div className="flex items-center justify-between mb-4 px-1">
                                        <h3 className="text-[14px] font-black text-slate-700 dark:text-slate-200">
                                            {day.name}
                                        </h3>
                                        <span className="text-[11px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                            {todaySchedules.length}
                                        </span>
                                    </div>

                                    <div className="space-y-3 flex-1 bg-slate-50/50 dark:bg-slate-900/30 p-2 rounded-xl border border-slate-100/50 dark:border-slate-800/50">
                                        {todaySchedules.length === 0 ? (
                                            <div className="h-24 rounded-lg flex flex-col items-center justify-center opacity-50">
                                                <BookMarked className="h-6 w-6 text-slate-300 mb-1" />
                                                <span className="text-[11px] font-medium text-slate-400">Empty</span>
                                            </div>
                                        ) : (
                                            todaySchedules.map(sched => {
                                                const stds = typeof sched.standards === 'string' ? JSON.parse(sched.standards || '[]') : (sched.standards || [])
                                                
                                                return (
                                                    <div key={sched.id} className={cn(
                                                        "rounded-lg p-3 relative border transition-all flex flex-col",
                                                        getClassColorBg(sched.class_type)
                                                    )}>
                                                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                                                            <Clock className="h-3 w-3" />
                                                            <span>{formatTime(sched.start_time)} - {formatTime(sched.end_time)}</span>
                                                        </div>
                                                        <p className="text-[13px] font-bold text-slate-800 dark:text-slate-100 mb-2 leading-snug">
                                                            {sched.name ? sched.name : <span className="capitalize">{sched.class_type} Class</span>}
                                                        </p>

                                                        <div className="flex flex-wrap gap-1 mt-auto shrink-0 border-t border-slate-200/50 dark:border-slate-700/50 pt-2">
                                                            <span className={cn("text-[9px] font-black text-white px-1.5 py-0.5 rounded-sm uppercase tracking-wider", getBadgeColor(sched.class_type))}>
                                                                {sched.class_type}
                                                            </span>
                                                            {viewMode === 'mentor' && stds.map((std: string, i: number) => (
                                                                <span key={i} className="bg-white/90 dark:bg-black/40 rounded-sm px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:text-slate-300 shadow-sm border border-slate-100 dark:border-slate-700">
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
            </div>
        </div>
    )
}
