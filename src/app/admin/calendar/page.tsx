"use client"

import { useState, useEffect } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, isSameDay } from "date-fns"
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2, CheckCircle2, XCircle, RotateCw } from "lucide-react"
import api from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"

export default function AcademicCalendarPage() {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [events, setEvents] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [generating, setGenerating] = useState(false)
    const { toast } = useToast()

    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)

    useEffect(() => {
        fetchMonthEvents()
    }, [currentDate])

    const fetchMonthEvents = async () => {
        setLoading(true)
        try {
            const startStr = format(startOfMonth(currentDate), "yyyy-MM-dd")
            const endStr = format(endOfMonth(currentDate), "yyyy-MM-dd")
            const res = await api.get(`/classes/events?start_date=${startStr}&end_date=${endStr}`)
            if (res.data.success) {
                setEvents(res.data.data)
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Error", description: "Failed to fetch calendar events", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1))
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1))

    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const startDate = monthStart // You could use startOfWeek here to pad the grid
    const endDate = monthEnd
    
    // Quick padding for UI to start on Sunday
    const startDayOfWeek = startDate.getDay()
    const prefixDays = Array.from({ length: startDayOfWeek }).map((_, i) => null)

    const days = eachDayOfInterval({ start: startDate, end: endDate })

    const handleDayClick = (day: Date) => {
        setSelectedDate(day)
        setDialogOpen(true)
    }

    const handleGenerate = async () => {
        if (!selectedDate) return
        setGenerating(true)
        try {
            const dateStr = format(selectedDate, "yyyy-MM-dd")
            const res = await api.post('/classes/events/generate', { date: dateStr })
            if (res.data.success) {
                toast({ title: "Generated", description: `Successfully scheduled ${res.data.inserted} classes for this day.` })
                fetchMonthEvents()
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Error", description: "Failed to generate events. Make sure an Academic Year is active.", variant: "destructive" })
        } finally {
            setGenerating(false)
        }
    }

    const getEventsForDay = (day: Date) => {
        const dateStr = format(day, "yyyy-MM-dd")
        return events.filter(e => e.date === dateStr)
    }

    const selectedDayEvents = selectedDate ? getEventsForDay(selectedDate) : []
    const isGenerated = selectedDayEvents.length > 0

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Academic Calendar</h1>
                    <p className="text-sm text-slate-500">Manage daily class schedules and generate events.</p>
                </div>

                <div className="flex items-center gap-4 bg-white border px-4 py-2 rounded-xl shadow-sm">
                    <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8 hover:bg-[#4f46e5]/10 hover:text-[#4f46e5]">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="w-40 text-center font-bold text-slate-700">
                        {format(currentDate, "MMMM yyyy")}
                    </div>
                    <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8 hover:bg-[#4f46e5]/10 hover:text-[#4f46e5]">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
                <div className="grid grid-cols-7 border-b bg-slate-50/80">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                        <div key={d} className="py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                            {d}
                        </div>
                    ))}
                </div>

                {loading ? (
                    <div className="h-96 flex flex-col items-center justify-center text-slate-400 gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-[#4f46e5]" />
                        <p>Loading Events...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-7 auto-rows-fr">
                        {prefixDays.map((_, i) => (
                            <div key={`empty-${i}`} className="min-h-[85px] bg-slate-50/50 border-b border-r border-slate-100/50" />
                        ))}

                        {days.map((day, i) => {
                            const dayEvents = getEventsForDay(day)
                            const isTodayDate = isToday(day)
                            const hasEvents = dayEvents.length > 0
                            
                            // Determine visual state based on events
                            const completedCnt = dayEvents.filter(e => e.status === 'completed').length
                            const bgClass = hasEvents ? "bg-indigo-50/30" : "bg-white"
                            
                            return (
                                <div 
                                    key={day.toISOString()} 
                                    onClick={() => handleDayClick(day)}
                                    className={`min-h-[85px] border-b border-r border-slate-100 p-2 cursor-pointer transition-all hover:bg-slate-50 relative group ${bgClass}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className={`
                                            h-7 w-7 rounded-full flex items-center justify-center text-sm font-bold
                                            ${isTodayDate ? 'bg-[#4f46e5] text-white shadow-md' : 'text-slate-700 group-hover:bg-slate-200'}
                                        `}>
                                            {format(day, "d")}
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-1">
                                        {hasEvents && (
                                            <div className="px-2 py-1.5 rounded bg-indigo-100/60 border border-indigo-200 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 shadow-sm">
                                                <CalendarIcon className="h-3 w-3" />
                                                {dayEvents.length} Classes
                                            </div>
                                        )}
                                        {completedCnt > 0 && (
                                            <div className="px-2 py-1 rounded bg-emerald-50 text-emerald-600 text-[10px] font-medium border border-emerald-100">
                                                {completedCnt} Completed
                                            </div>
                                        )}
                                    </div>
                                    
                                    {!hasEvents && day.getDay() !== 0 && (
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-xs bg-[#4f46e5]/10 text-[#4f46e5] font-semibold px-2 py-1 rounded-md">
                                                Click to Setup
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <CalendarIcon className="h-5 w-5 text-[#4f46e5]" />
                            Schedule for {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : ""}
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="py-4">
                        {!isGenerated ? (
                            <div className="text-center py-10 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl">
                                <div className="mx-auto h-16 w-16 bg-white rounded-full flex items-center justify-center shadow-sm border mb-4">
                                    <CalendarIcon className="h-8 w-8 text-slate-400" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-700 mb-2">No Classes Scheduled</h3>
                                <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
                                    There are no class events generated for this day. You can generate them based on the active Academic Year's weekly schedule.
                                </p>
                                <Button onClick={handleGenerate} disabled={generating} className="bg-[#4f46e5] hover:bg-[#4338ca] shadow-md h-11 px-6">
                                    {generating ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <RotateCw className="h-5 w-5 mr-2" />}
                                    Generate Daily Schedule
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-semibold text-slate-700">{selectedDayEvents.length} Classes Generated</h4>
                                    <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
                                        <RotateCw className="h-3 w-3 mr-2" /> Re-sync Weekly
                                    </Button>
                                </div>
                                
                                <div className="max-h-[400px] overflow-y-auto pr-2 space-y-3">
                                    {selectedDayEvents.map(ev => (
                                        <div key={ev.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl bg-white shadow-sm hover:border-[#4f46e5]/30 transition-colors">
                                            <div className="flex items-start gap-4">
                                                <div className="flex flex-col items-center justify-center bg-slate-50 border rounded-lg p-2 min-w-[90px]">
                                                    <div className="text-sm font-bold text-slate-700">{ev.start_time.substring(0, 5)}</div>
                                                    <div className="text-[10px] text-slate-400 font-semibold uppercase">to</div>
                                                    <div className="text-sm font-bold text-slate-700">{ev.end_time.substring(0, 5)}</div>
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800 text-lg mb-1">{ev.class_name}</div>
                                                    <div className="flex gap-2">
                                                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                            {ev.type}
                                                        </Badge>
                                                        {ev.status === 'scheduled' && <Badge variant="secondary" className="bg-slate-100">Scheduled</Badge>}
                                                        {ev.status === 'completed' && <Badge variant="default" className="bg-emerald-500">Completed</Badge>}
                                                        {ev.status === 'cancelled' && <Badge variant="destructive">Cancelled</Badge>}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="mt-4 sm:mt-0 flex flex-wrap gap-2">
                                                {ev.status === 'scheduled' && (
                                                    <Button size="sm" variant="outline" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200" onClick={async () => {
                                                        await api.patch(`/classes/events/${ev.id}/status`, { status: "completed" })
                                                        fetchMonthEvents()
                                                    }}>
                                                        <CheckCircle2 className="h-4 w-4 mr-1.5" /> Mark Completed
                                                    </Button>
                                                )}
                                                {ev.status === 'scheduled' && (
                                                    <Button size="sm" variant="outline" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200" onClick={async () => {
                                                        await api.patch(`/classes/events/${ev.id}/status`, { status: "cancelled" })
                                                        fetchMonthEvents()
                                                    }}>
                                                        <XCircle className="h-4 w-4 mr-1.5" /> Cancel Class
                                                    </Button>
                                                )}
                                                {(ev.status === 'completed' || ev.status === 'cancelled') && (
                                                    <Button size="sm" variant="ghost" onClick={async () => {
                                                        await api.patch(`/classes/events/${ev.id}/status`, { status: "scheduled" })
                                                        fetchMonthEvents()
                                                    }}>
                                                        Reset Status
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
