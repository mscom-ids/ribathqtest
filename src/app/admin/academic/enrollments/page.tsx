"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckSquare2, Loader2, Plus, RefreshCw, Square } from "lucide-react"
import api from "@/lib/api"
import { cachedGet, invalidateCache } from "@/lib/api-cache"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"


const STANDARDS = ["Non-class", "5th", "6th", "7th", "8th", "9th", "10th", "Plus One", "Plus Two"] as const

type AcademicYear = { id: string; name: string; is_current?: boolean }
type Placement = { adm_no: string; name: string; photo_url?: string | null; standard: string; division?: string | null }
type Division = { id: string; standard: string; name: string }

function errorMessage(error: unknown) {
    const candidate = error as { response?: { data?: { error?: string } }; message?: string } | undefined
    return candidate?.response?.data?.error || candidate?.message || "Something went wrong"
}
function invalidatePlacementCache() {
    invalidateCache("/academic-placements")
    invalidateCache("/academic-placements/divisions")
    invalidateCache("/academic-placements/attendance-groups")
    invalidateCache("/attendance/schedules")
}

export default function StudentPlacementPage() {
    const { toast } = useToast()
    const [years, setYears] = useState<AcademicYear[]>([])
    const [yearId, setYearId] = useState("")
    const [students, setStudents] = useState<Placement[]>([])
    const [divisions, setDivisions] = useState<Division[]>([])
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [search, setSearch] = useState("")
    const [standard, setStandard] = useState<string>("Non-class")
    const [division, setDivision] = useState("__none")
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [divisionDialogOpen, setDivisionDialogOpen] = useState(false)
    const [newDivision, setNewDivision] = useState("")
    const [creatingDivision, setCreatingDivision] = useState(false)

    const filteredStudents = useMemo(() => {
        const query = search.trim().toLowerCase()
        return query
            ? students.filter(student => student.name.toLowerCase().includes(query) || student.adm_no.toLowerCase().includes(query))
            : students
    }, [search, students])
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
    const allVisibleSelected = filteredStudents.length > 0 && filteredStudents.every(student => selectedSet.has(student.adm_no))
    const divisionOptions = useMemo(() => divisions.filter(item => item.standard === standard), [divisions, standard])
    const byStandard = useMemo(() => Object.fromEntries(STANDARDS.map(item => [item, students.filter(student => student.standard === item).length])), [students])

    async function load(targetYearId?: string) {
        const activeYearId = targetYearId || yearId
        if (!activeYearId) return
        setLoading(true)
        try {
            const [placementsResponse, divisionsResponse] = await Promise.all([
                cachedGet("/academic-placements", { academic_year_id: activeYearId }, 2 * 60_000),
                cachedGet("/academic-placements/divisions", { academic_year_id: activeYearId }, 5 * 60_000),
            ])
            setStudents(placementsResponse.data?.data || [])
            setDivisions(divisionsResponse.data?.data || [])
        } catch (error) {
            toast({ title: "Could not load placements", description: errorMessage(error), variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        let cancelled = false
        async function initialise() {
            try {
                const response = await cachedGet("/academic-placements/academic-years", undefined, 5 * 60_000)
                const nextYears = response.data?.data || []
                if (cancelled) return
                setYears(nextYears)
                const nextYearId = nextYears.find((year: AcademicYear) => year.is_current)?.id || nextYears[0]?.id || ""
                setYearId(nextYearId)
                if (nextYearId) await load(nextYearId)
                else setLoading(false)
            } catch (error) {
                if (!cancelled) {
                    setLoading(false)
                    toast({ title: "Could not load academic years", description: errorMessage(error), variant: "destructive" })
                }
            }
        }
        void initialise()
        return () => { cancelled = true }
    // The initial request is intentionally performed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function changeYear(nextYearId: string) {
        setYearId(nextYearId)
        setSelectedIds([])
        void load(nextYearId)
    }

    function toggleStudent(id: string) {
        setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
    }

    function toggleVisible() {
        setSelectedIds(current => {
            const next = new Set(current)
            if (allVisibleSelected) filteredStudents.forEach(student => next.delete(student.adm_no))
            else filteredStudents.forEach(student => next.add(student.adm_no))
            return [...next]
        })
    }

    function chooseStandard(nextStandard: string) {
        setStandard(nextStandard)
        setDivision("__none")
    }

    async function savePlacement() {
        if (!yearId || selectedIds.length === 0) return
        setSaving(true)
        try {
            const response = await api.post("/academic-placements/bulk", {
                academic_year_id: yearId,
                student_ids: selectedIds,
                standard,
                division: division === "__none" ? null : division,
            })
            toast({ title: "Placements updated", description: `${response.data?.updated || selectedIds.length} student placement${selectedIds.length === 1 ? "" : "s"} saved.` })
            invalidatePlacementCache()
            setSelectedIds([])
            await load(yearId)
        } catch (error) {
            toast({ title: "Could not save placements", description: errorMessage(error), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    async function createDivision() {
        if (!yearId || !newDivision.trim()) return
        setCreatingDivision(true)
        try {
            await api.post("/academic-placements/divisions", { academic_year_id: yearId, standard, name: newDivision.trim() })
            invalidatePlacementCache()
            setDivision(newDivision.trim())
            setNewDivision("")
            setDivisionDialogOpen(false)
            await load(yearId)
        } catch (error) {
            toast({ title: "Could not create division", description: errorMessage(error), variant: "destructive" })
        } finally {
            setCreatingDivision(false)
        }
    }

    return (
        <main className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Academic</p>
                        <h1 className="mt-1 text-2xl font-black text-slate-950">Student Standards and Divisions</h1>
                        <p className="mt-1 text-sm font-medium text-slate-500">Set each student&apos;s standard and division for this academic year. Non-class can also use divisions when needed.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Select value={yearId} onValueChange={changeYear}>
                            <SelectTrigger className="w-[190px]"><SelectValue placeholder="Academic year" /></SelectTrigger>
                            <SelectContent>{years.map(year => <SelectItem key={year.id} value={year.id}>{year.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button variant="outline" onClick={() => { invalidatePlacementCache(); void load(yearId) }} disabled={loading || !yearId}>
                            <RefreshCw className={"mr-2 h-4 w-4 " + (loading ? "animate-spin" : "")} />Refresh
                        </Button>
                    </div>
                </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {STANDARDS.map(item => <button key={item} onClick={() => { setStandard(item); setSelectedIds([]) }} className={"rounded-lg border p-3 text-left transition-colors " + (standard === item ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200")}>
                    <p className="text-xs font-bold text-slate-500">{item}</p><p className="mt-1 text-2xl font-black text-slate-950">{byStandard[item]}</p><p className="text-xs text-slate-400">students</p>
                </button>)}
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-5">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto] lg:items-end">
                        <div><p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Selected students</p><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name or admission number" /></div>
                        <div><p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Standard</p><Select value={standard} onValueChange={chooseStandard}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STANDARDS.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
                        <div><p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Division</p><Select value={division} onValueChange={setDivision}><SelectTrigger><SelectValue placeholder="No division" /></SelectTrigger><SelectContent>{divisionOptions.length === 0 ? <SelectItem value="__none">No division</SelectItem> : divisionOptions.map(item => <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>)}</SelectContent></Select></div>
                        <div className="flex gap-2"><Button variant="outline" size="icon" title="Add division" onClick={() => setDivisionDialogOpen(true)}><Plus className="h-4 w-4" /></Button><Button onClick={savePlacement} disabled={saving || selectedIds.length === 0}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save {selectedIds.length || ""}</Button></div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">Changes apply only to the selected academic year. Earlier year placements are preserved.</p>
                </div>
                <div className="flex items-center justify-between px-5 py-3 text-sm"><button className="flex items-center gap-2 font-semibold text-blue-700" onClick={toggleVisible}>{allVisibleSelected ? <CheckSquare2 className="h-4 w-4" /> : <Square className="h-4 w-4" />}{allVisibleSelected ? "Clear visible" : "Select visible"}</button><span className="text-slate-500">{selectedIds.length} selected</span></div>
                {loading ? <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div> : <div className="divide-y divide-slate-100">{filteredStudents.map(student => <button key={student.adm_no} onClick={() => toggleStudent(student.adm_no)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-slate-50"><span className="text-blue-600">{selectedSet.has(student.adm_no) ? <CheckSquare2 className="h-5 w-5" /> : <Square className="h-5 w-5 text-slate-300" />}</span><span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-600">{student.name.slice(0, 1)}</span><span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-900">{student.name}</span><span className="text-xs text-slate-500">{student.adm_no}</span></span><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{student.standard}{student.division ? ` - ${student.division}` : ""}</span></button>)}</div>}
            </section>



            <Dialog open={divisionDialogOpen} onOpenChange={setDivisionDialogOpen}><DialogContent><DialogHeader><DialogTitle>Add division for {standard}</DialogTitle></DialogHeader><Input value={newDivision} onChange={event => setNewDivision(event.target.value)} placeholder="Example: A" autoFocus /><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDivisionDialogOpen(false)}>Cancel</Button><Button onClick={createDivision} disabled={creatingDivision || !newDivision.trim()}>{creatingDivision && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add division</Button></div></DialogContent></Dialog>
        </main>
    )
}