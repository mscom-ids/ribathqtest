"use client"

import { useState, useEffect } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns"
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Users, Clock } from "lucide-react"
import api from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import EventModal, { defaultEventState, EventDataType } from "@/components/shared/EventModal"

// Category Colors matching the Image reference Aesthetic
const CATEGORY_COLORS = {
    Celebration: { bg: 'bg-[#EBF2FF]', text: 'text-[#1E40AF]', border: 'border-[#3B82F6]', iconBg: 'bg-[#DBEAFE]', icon: 'text-[#2563EB]' }, 
    Training:    { bg: 'bg-[#FFF8E1]', text: 'text-[#B45309]', border: 'border-[#F59E0B]', iconBg: 'bg-[#FEF3C7]', icon: 'text-[#D97706]' }, // Training (Yellowish)
    Meeting:     { bg: 'bg-[#FFECEF]', text: 'text-[#BE123C]', border: 'border-[#F43F5E]', iconBg: 'bg-[#FFE4E6]', icon: 'text-[#E11D48]' }, // Meeting (Pinkish/Red)
    Holidays:    { bg: 'bg-[#E8F8F0]', text: 'text-[#047857]', border: 'border-[#22C55E]', iconBg: 'bg-[#D1FAE5]', icon: 'text-[#059669]' }, // Holidays (Green)
    Default:     { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-500', iconBg: 'bg-slate-200', icon: 'text-slate-600' },
}

export default function CalendarPage() {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [events, setEvents] = useState<any[]>([])
    const { toast } = useToast()

    const [viewMode, setViewMode] = useState<'Month' | 'Week' | 'Day'>('Month')
    
    // Modal State
    const [showModal, setShowModal] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [selectedEvent, setSelectedEvent] = useState<EventDataType>(defaultEventState)

    useEffect(() => { fetchEvents() }, [currentDate])

    const fetchEvents = async () => {
        try {
            const res = await api.get('/events')
            if (res.data?.success) setEvents(res.data.events || [])
        } catch (error) {
            toast({ title: "Error", description: "Failed to load events", variant: "destructive" })
        }
    }

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1))
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1))
    const goToToday = () => setCurrentDate(new Date())

    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }) // Force Sunday Start
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 })
    
    const days = eachDayOfInterval({ start: startDate, end: endDate })

    // Open Modal for New Event on click
    const handleDayClick = (day: Date) => {
        setSelectedEvent({ ...defaultEventState, start_date: format(day, "yyyy-MM-dd"), end_date: format(day, "yyyy-MM-dd") })
        setEditingId(null)
        setShowModal(true)
    }

    const handleEditEvent = (ev: any, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedEvent(ev)
        setEditingId(ev.id)
        setShowModal(true)
    }

    return (
        <div className="flex flex-col xl:flex-row gap-6 h-[calc(100vh-140px)] min-h-[750px]">
            
            {/* LEFT COLUMN: CALENDAR */}
            <div className="flex-1 bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden p-6 flex flex-col">
                
                {/* TOOLBAR */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <button onClick={goToToday} className="px-5 py-2 rounded-lg bg-[#4f46e5] text-white hover:bg-[#4338ca] shadow-sm font-bold text-[14px] transition-colors tracking-wide">
                            Today
                        </button>
                        <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200">
                            <button onClick={prevMonth} className="px-3 py-2 hover:bg-slate-100 rounded-l-lg transition hover:text-[#4f46e5]"><ChevronLeft className="h-5 w-5" /></button>
                            <button onClick={nextMonth} className="px-3 py-2 hover:bg-slate-100 rounded-r-lg transition hover:text-[#4f46e5]"><ChevronRight className="h-5 w-5" /></button>
                        </div>
                    </div>
                    
                    <h2 className="text-[20px] font-black text-[#1F2937] uppercase tracking-wider">{format(currentDate, "MMMM yyyy")}</h2>
                    
                    <div className="flex items-center bg-slate-50/80 rounded-lg p-1 border border-slate-200 shadow-inner">
                        {['Month', 'Week', 'Day'].map(view => (
                            <button key={view} onClick={() => setViewMode(view as any)} 
                                className={`px-5 py-1.5 text-[13px] font-black rounded-md transition-all duration-200 ${viewMode === view ? 'bg-[#4f46e5] text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>
                                {view}
                            </button>
                        ))}
                    </div>
                </div>

                {/* GRID */}
                <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
                    {/* Header */}
                    <div className="grid grid-cols-7 border-b border-slate-200 bg-[#F8F9FA]">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                            <div key={d} className={`py-3.5 text-center text-[13px] font-black text-[#1F2937] ${i !== 6 ? 'border-r border-slate-200' : ''}`}>
                                {d}
                            </div>
                        ))}
                    </div>
                    
                    {/* Days Component */}
                    <div className="grid grid-cols-7 flex-1 auto-rows-[minmax(100px,_1fr)]">
                        {days.map((day, i) => {
                            const isCurrentMonth = isSameMonth(day, currentDate)
                            const isTodayDate = isToday(day)
                            
                            // Find events occurring on this day
                            const dayEvents = events.filter(e => {
                                const s = new Date(e.start_date).getTime()
                                const end = new Date(e.end_date).getTime()
                                const curr = day.getTime()
                                return curr >= s && curr <= end
                            })

                            return (
                                <div 
                                    key={day.toISOString()} 
                                    onClick={() => handleDayClick(day)}
                                    className={`p-2 border-b border-r border-slate-200 cursor-pointer hover:bg-slate-50/80 transition-colors group flex flex-col ${!isCurrentMonth ? 'bg-slate-50/50 text-opacity-50' : 'bg-white'}`}
                                    style={{ borderRightWidth: (i + 1) % 7 === 0 ? '0px' : '1px' }}
                                >
                                    <div className="flex justify-end mb-1">
                                        <span className={`h-[26px] w-[26px] flex items-center justify-center text-[13px] font-extrabold rounded-full ${isTodayDate ? 'bg-[#4f46e5] text-white shadow-md' : isCurrentMonth ? 'text-slate-700' : 'text-slate-400'}`}>
                                            {format(day, "d")}
                                        </span>
                                    </div>
                                    
                                    <div className="flex-1 space-y-1.5 mt-1 overflow-y-auto hide-scrollbar">
                                        {dayEvents.map(ev => {
                                            const colorClass = (CATEGORY_COLORS as any)[ev.category] || CATEGORY_COLORS.Default
                                            return (
                                                <div 
                                                    key={ev.id} 
                                                    onClick={(e) => handleEditEvent(ev, e)}
                                                    className={`px-2 py-1 rounded-[4px] text-[11px] font-bold truncate ${colorClass.bg} ${colorClass.text} hover:opacity-80 transition-opacity`}
                                                    title={ev.title}
                                                >
                                                    {ev.title}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>


            {/* RIGHT COLUMN: EVENTS LIST */}
            <div className="w-full xl:w-[380px] shrink-0 flex flex-col bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden p-6 relative">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-[18px] font-black text-[#1F2937]">Events</h3>
                    <select className="bg-slate-50 border border-slate-200 text-[13px] font-bold text-slate-700 px-3 py-2 rounded-lg outline-none cursor-pointer focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] shadow-sm">
                        <option>All Category</option>
                        <option>Celebration</option>
                        <option>Meeting</option>
                        <option>Training</option>
                        <option>Holidays</option>
                    </select>
                </div>

                {/* Vertical Event Cards Timeline */}
                <div className="flex-1 overflow-y-auto space-y-5 pr-1 pb-4">
                    {events.length === 0 ? (
                        <div className="text-center py-10 text-slate-500 font-medium text-[14px]">No upcoming events</div>
                    ) : (
                        events.map((ev) => {
                            const colorClass = (CATEGORY_COLORS as any)[ev.category] || CATEGORY_COLORS.Default
                            
                            return (
                                <div key={ev.id} onClick={(e) => handleEditEvent(ev, e)} className={`bg-white rounded-xl shadow-sm border-l-[3px] border-y border-r border-[#E5E7EB] ${colorClass.border} p-5 cursor-pointer hover:shadow-md transition-shadow relative overflow-hidden group`}>
                                    
                                    <div className="flex gap-4">
                                        <div className={`h-11 w-11 flex items-center justify-center shrink-0 rounded-full ${colorClass.iconBg}`}>
                                            <Users className={`h-5 w-5 ${colorClass.icon}`} />
                                        </div>
                                        <div className="flex-1 pb-1">
                                            <h4 className="text-[16px] font-extrabold text-[#1F2937] leading-tight group-hover:text-[#4f46e5] transition-colors">{ev.title}</h4>
                                            
                                            <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500 mt-2 mb-4">
                                                <CalendarIcon className="h-3.5 w-3.5" />
                                                {format(new Date(ev.start_date), "dd MMM yyyy")} {ev.start_date !== ev.end_date && `- ${format(new Date(ev.end_date), "dd MMMM yyyy")}`}
                                            </div>
                                            
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500">
                                                    <Clock className="h-3.5 w-3.5 shrink-0" />
                                                    {ev.start_time.substring(0, 5)} - {ev.end_time.substring(0, 5)}
                                                </div>
                                                
                                                {/* Stacked avatars style match */}
                                                <div className="flex -space-x-1.5">
                                                    <img src="https://i.pravatar.cc/100?img=11" className="w-6 h-6 rounded-full border border-white shadow-sm" alt="User 1" />
                                                    <img src="https://i.pravatar.cc/100?img=12" className="w-6 h-6 rounded-full border border-white shadow-sm" alt="User 2" />
                                                    <img src="https://i.pravatar.cc/100?img=13" className="w-6 h-6 rounded-full border border-white shadow-sm" alt="User 3" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            <EventModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onSaveSuccess={fetchEvents}
                editingEventId={editingId}
                initialData={selectedEvent}
            />
        </div>
    )
}
