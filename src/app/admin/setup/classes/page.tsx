"use client"

import { useState, useEffect } from "react"
import { Plus, Edit2, Trash2, GraduationCap, Users, Clock } from "lucide-react"
import api from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
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
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link"

const STANDARD_OPTIONS = [
    "Hifz Only", "5th Standard", "6th Standard", "7th Standard", 
    "8th Standard", "9th Standard", "10th Standard", "+1 (Plus One)", 
    "+2 (Plus Two)", "Other"
]

type AcademicYear = { id: string; name: string; is_current: boolean }
type ClassModel = { id: string; academic_year_id: string; name: string; type: string; standard: string }

export default function ClassesPage() {
    const [years, setYears] = useState<AcademicYear[]>([])
    const [selectedYearId, setSelectedYearId] = useState<string>("")
    const [classes, setClasses] = useState<ClassModel[]>([])
    const [loading, setLoading] = useState(true)
    const { toast } = useToast()

    const [open, setOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formData, setFormData] = useState({ academic_year_id: "", name: "", type: "", standard: "" })

    useEffect(() => {
        fetchYears()
    }, [])

    const fetchYears = async () => {
        try {
            const res = await api.get('/classes/academic-years')
            if (res.data.success) {
                setYears(res.data.data)
                // Default to current year
                const current = res.data.data.find((y: any) => y.is_current)
                if (current) fetchClasses(current.id)
                else if (res.data.data.length > 0) fetchClasses(res.data.data[0].id)
                else setLoading(false)
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to fetch years", variant: "destructive" })
            setLoading(false)
        }
    }

    const fetchClasses = async (yearId: string) => {
        setLoading(true)
        setSelectedYearId(yearId)
        try {
            const res = await api.get(`/classes?academic_year_id=${yearId}`)
            if (res.data.success) setClasses(res.data.data)
        } catch (error) {
            toast({ title: "Error", description: "Failed to fetch classes", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        try {
            if (!formData.name || !formData.type || !formData.standard || !formData.academic_year_id) {
                toast({ title: "Validation Error", description: "Fill all fields", variant: "destructive" })
                return
            }
            const payload = { ...formData, id: editingId }
            const res = await api.post('/classes', payload)
            if (res.data.success) {
                toast({ title: "Success", description: "Class saved successfully" })
                setOpen(false)
                fetchClasses(formData.academic_year_id)
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to save class", variant: "destructive" })
        }
    }

    const handleDelete = async (id: string, yearId: string) => {
        if (!confirm("Delete this class? All schedules and events will be removed!")) return
        try {
            const res = await api.delete(`/classes/${id}`)
            if (res.data.success) {
                toast({ title: "Deleted", description: "Class deleted successfully" })
                fetchClasses(yearId)
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to delete component", variant: "destructive" })
        }
    }

    const openEdit = (c: ClassModel) => {
        setEditingId(c.id)
        setFormData({ academic_year_id: c.academic_year_id, name: c.name, type: c.type, standard: c.standard })
        setOpen(true)
    }
    const openCreate = () => {
        setEditingId(null)
        setFormData({ academic_year_id: selectedYearId, name: "", type: "School", standard: "" })
        setOpen(true)
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Class Configurations</h1>
                    <p className="text-sm text-slate-500">Manage structure, divisions, and schedules.</p>
                </div>
                
                <div className="flex items-center gap-2">
                    {years.length > 0 && (
                        <Select value={selectedYearId} onValueChange={fetchClasses}>
                            <SelectTrigger className="w-[180px] bg-white">
                                <SelectValue placeholder="Select Year" />
                            </SelectTrigger>
                            <SelectContent>
                                {years.map(y => (
                                    <SelectItem key={y.id} value={y.id}>{y.name} {y.is_current ? '(Active)' : ''}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={openCreate} className="bg-[#4f46e5] hover:bg-[#4338ca]">
                                <Plus className="h-4 w-4 mr-2" /> Add Class
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{editingId ? "Edit" : "Create"} Class</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label>Academic Year</Label>
                                    <Select value={formData.academic_year_id} onValueChange={(v) => setFormData({...formData, academic_year_id: v})}>
                                        <SelectTrigger><SelectValue placeholder="Select Year" /></SelectTrigger>
                                        <SelectContent>
                                            {years.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Department Type</Label>
                                    <Select value={formData.type} onValueChange={(v) => setFormData({...formData, type: v})}>
                                        <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="School">School</SelectItem>
                                            <SelectItem value="Madrassa">Madrassa</SelectItem>
                                            <SelectItem value="Hifz">Hifz</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <Label>Standards</Label>
                                        <div className="max-h-36 overflow-y-auto space-y-2 border p-3 rounded-md bg-slate-50/50">
                                            {STANDARD_OPTIONS.map(opt => (
                                                <div key={opt} className="flex flex-row items-center space-x-2">
                                                    <Checkbox 
                                                        id={`std-${opt}`} 
                                                        checked={formData.standard?.includes(opt)}
                                                        onCheckedChange={(checked) => {
                                                            let current = formData.standard ? formData.standard.split(',').map(s=>s.trim()).filter(Boolean) : [];
                                                            if (checked) current.push(opt);
                                                            else current = current.filter(s => s !== opt);
                                                            setFormData({...formData, standard: current.join(', ')});
                                                        }} 
                                                    />
                                                    <label className="text-sm cursor-pointer text-slate-700" htmlFor={`std-${opt}`}>{opt}</label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Division/Section</Label>
                                        <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g. A" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                                <Button onClick={handleSave} className="bg-[#4f46e5]">Save Changes</Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {loading ? (
                <div className="h-40 flex items-center justify-center text-slate-400">Loading...</div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {classes.map((c) => (
                        <div key={c.id} className="bg-white border hover:border-slate-300 rounded-xl p-5 transition-all flex flex-col h-full">
                            <div className="flex gap-4 items-start mb-4">
                                <div className={`p-3 rounded-lg flex-shrink-0 ${
                                    c.type === 'School' ? 'bg-blue-50 text-blue-600' :
                                    c.type === 'Hifz' ? 'bg-emerald-50 text-emerald-600' :
                                    'bg-purple-50 text-purple-600'
                                }`}>
                                    <GraduationCap className="h-6 w-6" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{c.type}</div>
                                            <h3 className="text-lg font-bold text-slate-800 leading-tight">Std: {c.standard} <span className="text-slate-400 font-normal">|</span> {c.name}</h3>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-4 mt-auto">
                                <Button asChild variant="outline" size="sm" className="w-full text-xs h-8">
                                    <Link href={`/admin/setup/classes/${c.id}/students`}>
                                        <Users className="h-3 w-3 mr-1.5" /> Students
                                    </Link>
                                </Button>
                                <Button asChild variant="outline" size="sm" className="w-full text-xs h-8">
                                    <Link href={`/admin/setup/classes/${c.id}/schedule`}>
                                        <Clock className="h-3 w-3 mr-1.5" /> Schedule
                                    </Link>
                                </Button>
                            </div>

                            <div className="flex gap-2 pt-3 border-t border-slate-100">
                                <Button size="sm" variant="ghost" className="flex-1 h-8 text-xs text-slate-500" onClick={() => openEdit(c)}>
                                    <Edit2 className="h-3 w-3 mr-1.5" /> Edit
                                </Button>
                                <Button size="sm" variant="ghost" className="flex-1 h-8 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(c.id, c.academic_year_id)}>
                                    <Trash2 className="h-3 w-3 mr-1.5" /> Delete
                                </Button>
                            </div>
                        </div>
                    ))}
                    
                    {classes.length === 0 && (
                        <div className="col-span-full py-10 text-center border-2 border-dashed rounded-xl border-slate-200">
                            <p className="text-slate-500">No classes found for this year.</p>
                            <Button variant="link" onClick={openCreate} className="text-[#4f46e5]">Create your first class</Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
