"use client"

import { useState, useEffect, use } from "react"
import { usePathname } from "next/navigation"
import { Plus, Trash2, ArrowLeft, Clock } from "lucide-react"
import api from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const DAYS_OF_WEEK = [
    { value: 0, label: "Sunday" },
    { value: 1, label: "Monday" },
    { value: 2, label: "Tuesday" },
    { value: 3, label: "Wednesday" },
    { value: 4, label: "Thursday" },
    { value: 5, label: "Friday" },
    { value: 6, label: "Saturday" },
]

export default function ClassSchedulePage({ params }: { params: Promise<{ classId: string }> }) {
    const { classId } = use(params)
    const [schedule, setSchedule] = useState<any[]>([])
    const [staff, setStaff] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const { toast } = useToast()

    const [open, setOpen] = useState(false)
    const [formData, setFormData] = useState({
        day_of_week: "1",
        start_time: "08:00",
        end_time: "09:00",
        teacher_id: "none"
    })

    useEffect(() => {
        fetchData()
    }, [classId])

    const fetchData = async () => {
        try {
            setLoading(true)
            const [scheduleRes, staffRes] = await Promise.all([
                api.get(`/classes/schedule?class_id=${classId}`),
                api.get("/staff")
            ])
            if (scheduleRes.data.success) {
                setSchedule(scheduleRes.data.data)
            }
            if (staffRes.data.success) {
                setStaff(staffRes.data.staff || staffRes.data.data || [])
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Error", description: "Failed to fetch data", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        try {
            const payload = { 
                class_id: classId,
                day_of_week: parseInt(formData.day_of_week),
                start_time: formData.start_time,
                end_time: formData.end_time,
                teacher_id: formData.teacher_id === "none" ? null : formData.teacher_id
            }
            const res = await api.post('/classes/schedule', payload)
            if (res.data.success) {
                toast({ title: "Success", description: "Schedule added successfully" })
                setOpen(false)
                fetchData()
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to save schedule", variant: "destructive" })
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this block?")) return
        try {
            const res = await api.delete(`/classes/schedule/${id}`)
            if (res.data.success) {
                toast({ title: "Deleted", description: "Schedule deleted successfully" })
                fetchData()
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to delete schedule", variant: "destructive" })
        }
    }

    // Group schedule by days
    const grouped = schedule.reduce((acc, curr) => {
        if (!acc[curr.day_of_week]) acc[curr.day_of_week] = []
        acc[curr.day_of_week].push(curr)
        acc[curr.day_of_week].sort((a: any, b: any) => a.start_time.localeCompare(b.start_time))
        return acc
    }, {} as Record<number, any[]>)

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild className="rounded-full">
                    <Link href="/admin/setup/classes">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Weekly Schedule</h1>
                    <p className="text-sm text-slate-500">Manage recurring weekly timeline for this class.</p>
                </div>
            </div>

            <div className="flex justify-end">
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#4f46e5] hover:bg-[#4338ca]">
                            <Plus className="h-4 w-4 mr-2" /> Add Time Block
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Time Block</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label>Day of Week</Label>
                                <Select value={formData.day_of_week} onValueChange={(v) => setFormData({...formData, day_of_week: v})}>
                                    <SelectTrigger><SelectValue placeholder="Select Day" /></SelectTrigger>
                                    <SelectContent>
                                        {DAYS_OF_WEEK.map(d => <SelectItem key={d.value} value={d.value.toString()}>{d.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label>Start Time</Label>
                                    <Input type="time" value={formData.start_time} onChange={(e) => setFormData({...formData, start_time: e.target.value})} />
                                </div>
                                <div className="grid gap-2">
                                    <Label>End Time</Label>
                                    <Input type="time" value={formData.end_time} onChange={(e) => setFormData({...formData, end_time: e.target.value})} />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label>Teacher (Optional)</Label>
                                <Select value={formData.teacher_id} onValueChange={(v) => setFormData({...formData, teacher_id: v})}>
                                    <SelectTrigger><SelectValue placeholder="No Teacher Assigned" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No Teacher Assigned</SelectItem>
                                        {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name} - {s.department}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button onClick={handleSave} className="bg-[#4f46e5]">Save Time Block</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {loading ? (
                <div className="h-40 flex items-center justify-center text-slate-400">Loading...</div>
            ) : (
                <div className="grid gap-6">
                    {DAYS_OF_WEEK.map(day => (
                        <div key={day.value} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="font-bold text-slate-700">{day.label}</h3>
                                <span className="text-xs font-semibold text-slate-400 bg-slate-200/50 px-2 py-1 rounded-full">
                                    {grouped[day.value]?.length || 0} Blocks
                                </span>
                            </div>
                            
                            {grouped[day.value]?.length > 0 ? (
                                <div className="divide-y divide-slate-100">
                                    {(grouped[day.value] || []).map((block: any) => (
                                        <div key={block.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                                                    <Clock className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-slate-800">
                                                        {block.start_time.substring(0, 5)} - {block.end_time.substring(0, 5)}
                                                    </div>
                                                    {block.teacher_id ? (
                                                        <div className="text-xs text-slate-500 mt-0.5">
                                                            Teacher: {staff.find(s => s.id === block.teacher_id)?.name || 'Unknown'}
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-slate-400 mt-0.5">No teacher assigned</div>
                                                    )}
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" className="text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-full" onClick={() => handleDelete(block.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-8 text-center text-sm text-slate-400">
                                    No blocks scheduled for {day.label}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
