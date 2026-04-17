"use client"

import { useState, useEffect } from "react"
import { Plus, Edit2, Trash2, Calendar, Lock, Unlock, CheckCircle2 } from "lucide-react"
import api from "@/lib/api"
import { cachedGet, invalidateCache } from "@/lib/api-cache"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

type AcademicYear = {
    id: string
    name: string
    start_date: string
    end_date: string
    is_current: boolean
    is_locked: boolean
    promotion_window_open: boolean
}

export default function AcademicYearsPage() {
    const [years, setYears] = useState<AcademicYear[]>([])
    const [loading, setLoading] = useState(true)
    const { toast } = useToast()

    // Dialog State
    const [open, setOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formData, setFormData] = useState({
        name: "",
        start_date: "",
        end_date: "",
        is_current: false,
        is_locked: false,
        promotion_window_open: false,
    })

    const fetchYears = async () => {
        try {
            setLoading(true)
            const res = await cachedGet('/classes/academic-years', undefined, 5 * 60_000)
            if (res.data.success) {
                setYears(res.data.data)
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Error", description: "Failed to fetch academic years", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchYears()
    }, [])

    const handleSave = async () => {
        try {
            if (!formData.name || !formData.start_date || !formData.end_date) {
                toast({ title: "Validation Error", description: "Please fill all required fields", variant: "destructive" })
                return
            }
            const payload = { ...formData, id: editingId }
            const res = await api.post('/classes/academic-years', payload)
            
            if (res.data.success) {
                invalidateCache('/classes/academic-years')
                toast({ title: "Success", description: "Academic year saved successfully" })
                setOpen(false)
                fetchYears()
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Error", description: "Failed to save academic year", variant: "destructive" })
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure? This will delete all classes and enrollments for this year.")) return
        
        try {
            const res = await api.delete(`/classes/academic-years/${id}`)
            if (res.data.success) {
                invalidateCache('/classes/academic-years')
                toast({ title: "Deleted", description: "Academic year deleted successfully" })
                fetchYears()
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Error", description: "Failed to delete component", variant: "destructive" })
        }
    }

    const openEdit = (y: AcademicYear) => {
        setEditingId(y.id)
        setFormData({
            name: y.name,
            start_date: y.start_date.split('T')[0],
            end_date: y.end_date.split('T')[0],
            is_current: y.is_current,
            is_locked: y.is_locked,
            promotion_window_open: y.promotion_window_open
        })
        setOpen(true)
    }

    const openCreate = () => {
        setEditingId(null)
        setFormData({
            name: "",
            start_date: "",
            end_date: "",
            is_current: false,
            is_locked: false,
            promotion_window_open: false,
        })
        setOpen(true)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Academic Years</h1>
                    <p className="text-sm text-slate-500">Manage the institutional cycles and their statuses.</p>
                </div>
                
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={openCreate} className="bg-[#4f46e5] hover:bg-[#4338ca]">
                            <Plus className="h-4 w-4 mr-2" /> Add Year
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingId ? "Edit" : "Create"} Academic Year</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label>Year Name (e.g. 2024-2025)</Label>
                                <Input 
                                    value={formData.name} 
                                    onChange={(e) => setFormData({...formData, name: e.target.value})} 
                                    placeholder="2024-2025"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label>Start Date</Label>
                                    <Input 
                                        type="date" 
                                        value={formData.start_date} 
                                        onChange={(e) => setFormData({...formData, start_date: e.target.value})} 
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>End Date</Label>
                                    <Input 
                                        type="date" 
                                        value={formData.end_date} 
                                        onChange={(e) => setFormData({...formData, end_date: e.target.value})} 
                                    />
                                </div>
                            </div>
                            
                            <div className="flex items-center justify-between border rounded-lg p-3 bg-slate-50">
                                <div>
                                    <Label className="text-base font-semibold">Current Year</Label>
                                    <div className="text-xs text-muted-foreground">Mark this as the active session across the app.</div>
                                </div>
                                <Switch 
                                    checked={formData.is_current} 
                                    onCheckedChange={(c) => setFormData({...formData, is_current: c})} 
                                />
                            </div>
                            
                            <div className="flex items-center justify-between border rounded-lg p-3 bg-rose-50/50">
                                <div>
                                    <Label className="text-base font-semibold">Locked Data</Label>
                                    <div className="text-xs text-muted-foreground">Prevent any modifications to records mapped to this year.</div>
                                </div>
                                <Switch 
                                    checked={formData.is_locked} 
                                    onCheckedChange={(c) => setFormData({...formData, is_locked: c})} 
                                />
                            </div>

                            <div className="flex items-center justify-between border rounded-lg p-3 bg-emerald-50/50">
                                <div>
                                    <Label className="text-base font-semibold">Promotions Window</Label>
                                    <div className="text-xs text-muted-foreground">Allow students to be promoted automatically to the next year.</div>
                                </div>
                                <Switch 
                                    checked={formData.promotion_window_open} 
                                    onCheckedChange={(c) => setFormData({...formData, promotion_window_open: c})} 
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button onClick={handleSave} className="bg-[#4f46e5]">Save Changes</Button>
                        </div>
                    </DialogContent>
                </Dialog>

            </div>

            {loading ? (
                <div className="h-40 flex items-center justify-center text-slate-400">Loading...</div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {years.map((y) => (
                        <div key={y.id} className={`border rounded-xl p-5 relative overflow-hidden transition-all ${y.is_current ? 'border-[#4f46e5] shadow-sm bg-[#4f46e5]/5' : 'bg-white hover:border-slate-300'}`}>
                            {y.is_current && (
                                <div className="absolute top-0 right-0 bg-[#4f46e5] text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Active
                                </div>
                            )}
                            <div className="flex items-center gap-3 mb-4">
                                <div className={`p-3 rounded-lg ${y.is_current ? 'bg-[#4f46e5]/10 text-[#4f46e5]' : 'bg-slate-100 text-slate-600'}`}>
                                    <Calendar className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">{y.name}</h3>
                                    <p className="text-xs font-medium text-slate-500">
                                        {format(new Date(y.start_date), "MMM d, yyyy")} - {format(new Date(y.end_date), "MMM d, yyyy")}
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex gap-2 mb-4">
                                {y.is_locked ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-100 text-rose-700 text-xs font-semibold">
                                        <Lock className="h-3 w-3" /> Locked
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs font-semibold">
                                        <Unlock className="h-3 w-3" /> Open
                                    </span>
                                )}
                                {y.promotion_window_open && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 text-amber-700 text-xs font-semibold">
                                        Promotions Allowed
                                    </span>
                                )}
                            </div>

                            <div className="flex gap-2 pt-4 border-t border-slate-100">
                                <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(y)}>
                                    <Edit2 className="h-3 w-3 mr-2" /> Edit
                                </Button>
                                {!y.is_current && !y.is_locked && (
                                    <Button size="sm" variant="outline" className="flex-none text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200" onClick={() => handleDelete(y.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                    
                    {years.length === 0 && (
                        <div className="col-span-full py-10 text-center border-2 border-dashed rounded-xl border-slate-200">
                            <p className="text-slate-500">No academic years configured.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
