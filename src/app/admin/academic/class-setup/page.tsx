"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Archive, Edit2, Plus, RefreshCw, School, Users } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

type AcademicYear = { id: string; name: string; is_current?: boolean }
type ClassModel = {
    id: string
    academic_year_id: string
    name: string
    type: "School" | "Madrassa" | "Hifz"
    standard: string
    section?: string | null
    is_archived?: boolean
}

const standards = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "+1", "+2"]
const departments = [
    { value: "School", label: "School" },
    { value: "Madrassa", label: "Madrasa" },
    { value: "Hifz", label: "Hifz" },
]

export default function ClassSetupPage() {
    const { toast } = useToast()
    const [years, setYears] = useState<AcademicYear[]>([])
    const [yearId, setYearId] = useState("")
    const [department, setDepartment] = useState("all")
    const [classes, setClasses] = useState<ClassModel[]>([])
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState<ClassModel | null>(null)
    const [form, setForm] = useState({ type: "School", standard: "5th", section: "A", name: "" })

    const grouped = useMemo(() => {
        return classes.reduce((acc, item) => {
            const key = item.type
            acc[key] = [...(acc[key] || []), item]
            return acc
        }, {} as Record<string, ClassModel[]>)
    }, [classes])

    async function loadYears() {
        const res = await api.get("/classes/academic-years")
        const rows = res.data?.data || []
        setYears(rows)
        const selected = yearId || rows.find((year: AcademicYear) => year.is_current)?.id || rows[0]?.id || ""
        setYearId(selected)
        return selected
    }

    async function loadClasses(targetYear = yearId) {
        if (!targetYear) return
        setLoading(true)
        try {
            const res = await api.get("/classes", {
                params: {
                    academic_year_id: targetYear,
                    type: department,
                },
            })
            setClasses(res.data?.data || [])
        } catch (err: any) {
            toast({ title: "Failed to load classes", description: err?.response?.data?.error || err.message, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadYears().then((selected) => loadClasses(selected)).catch((err) => {
            setLoading(false)
            toast({ title: "Failed to load academic years", description: err.message, variant: "destructive" })
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (yearId) void loadClasses(yearId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [department, yearId])

    function startCreate(type = "School") {
        setEditing(null)
        setForm({ type, standard: type === "Hifz" ? "Hifz" : "5th", section: type === "Hifz" ? "" : "A", name: type === "Hifz" ? "Cohort A" : "" })
        setOpen(true)
    }

    function startEdit(item: ClassModel) {
        setEditing(item)
        setForm({ type: item.type, standard: item.standard || "5th", section: item.section || "", name: item.name || "" })
        setOpen(true)
    }

    async function saveClass() {
        try {
            const payload = {
                id: editing?.id,
                academic_year_id: yearId,
                type: form.type,
                standard: form.type === "Hifz" ? "Hifz" : form.standard,
                section: form.type === "Hifz" ? null : form.section || null,
                name: form.type === "Hifz" ? form.name : form.name || undefined,
            }
            const res = await api.post("/classes", payload)
            if (res.data?.success) {
                toast({ title: editing ? "Class updated" : "Class created" })
                setOpen(false)
                await loadClasses(yearId)
            }
        } catch (err: any) {
            toast({ title: "Save failed", description: err?.response?.data?.error || err.message, variant: "destructive" })
        }
    }

    async function archiveClass(id: string) {
        if (!confirm("Archive this class? Existing history and attendance stay preserved.")) return
        try {
            await api.delete(`/classes/${id}`)
            toast({ title: "Class archived" })
            await loadClasses(yearId)
        } catch (err: any) {
            toast({ title: "Archive failed", description: err?.response?.data?.error || err.message, variant: "destructive" })
        }
    }

    return (
        <main className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Academic</p>
                        <h1 className="mt-1 text-2xl font-black text-slate-950">Class Setup</h1>
                        <p className="mt-1 text-sm font-medium text-slate-500">Create School classes, Madrasa classes, and optional Hifz cohorts. Hifz attendance sessions are managed separately.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Select value={yearId} onValueChange={setYearId}>
                            <SelectTrigger className="w-[190px] bg-white"><SelectValue placeholder="Academic year" /></SelectTrigger>
                            <SelectContent>{years.map((year) => <SelectItem key={year.id} value={year.id}>{year.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={department} onValueChange={setDepartment}>
                            <SelectTrigger className="w-[150px] bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                {departments.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={() => loadClasses(yearId)}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
                        <Button onClick={() => startCreate("School")}><Plus className="mr-2 h-4 w-4" />Create Class</Button>
                    </div>
                </div>
            </section>

            {loading ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-400">Loading classes...</div>
            ) : (
                <div className="grid gap-5">
                    {["School", "Madrassa", "Hifz"].filter((type) => department === "all" || department === type).map((type) => (
                        <section key={type} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <School className="h-5 w-5 text-slate-700" />
                                    <h2 className="text-lg font-black text-slate-950">{type === "Madrassa" ? "Madrasa" : type}</h2>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => startCreate(type)}>Add</Button>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {(grouped[type] || []).map((item) => (
                                    <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{item.type === "Hifz" ? "Group" : "Class"}</p>
                                                <h3 className="mt-1 text-lg font-black text-slate-900">{item.name}</h3>
                                                <p className="text-sm font-semibold text-slate-500">{item.type === "Hifz" ? "Hifz Group" : `${item.standard}${item.section ? ` - Section ${item.section}` : ""}`}</p>
                                            </div>
                                        </div>
                                        <div className="mt-4 flex gap-2">
                                            <Button asChild variant="outline" size="sm" className="flex-1">
                                                <Link href={`/admin/academic/class-setup/${item.id}/students`}><Users className="mr-2 h-4 w-4" />Students</Link>
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => startEdit(item)}><Edit2 className="h-4 w-4" /></Button>
                                            <Button variant="outline" size="sm" onClick={() => archiveClass(item.id)}><Archive className="h-4 w-4" /></Button>
                                        </div>
                                    </div>
                                ))}
                                {(grouped[type] || []).length === 0 && (
                                    <div className="rounded-lg border border-dashed border-slate-200 p-5 text-sm font-bold text-slate-400">No {type === "Madrassa" ? "Madrasa" : type} classes yet.</div>
                                )}
                            </div>
                        </section>
                    ))}
                </div>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editing ? "Edit Class" : "Create Class"}</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-2">
                        <div className="grid gap-2">
                            <Label>Department</Label>
                            <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value, standard: value === "Hifz" ? "Hifz" : form.standard, section: value === "Hifz" ? "" : form.section })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{departments.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        {form.type === "Hifz" ? (
                            <div className="grid gap-2">
                                <Label>Group Name</Label>
                                <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Cohort A, Revision Group" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="grid gap-2">
                                    <Label>Standard</Label>
                                    <Select value={form.standard} onValueChange={(value) => setForm({ ...form, standard: value })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>{standards.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Section</Label>
                                    <Input value={form.section} onChange={(event) => setForm({ ...form, section: event.target.value.toUpperCase() })} placeholder="A" />
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={saveClass}>Save</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </main>
    )
}
