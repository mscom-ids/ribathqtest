"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowRight, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Wand2 } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"

type AcademicYear = {
    id: string
    name: string
    start_date: string
    end_date: string
    is_current?: boolean
}

type PromotionRule = {
    from_standard: string
    from_section: string | null
    to_standard: string
    to_section: string | null
}

type PromotionStudent = {
    student_id: string
    name: string
    from_standard?: string | null
    from_section?: string | null
    to_standard?: string | null
    to_section?: string | null
    from_mentor_name?: string | null
}

type Preview = {
    target_existing: { school: number; madrasa: number; snapshots: number }
    totals: {
        students_touched: number
        school_students: number
        madrasa_students: number
        hifz_students: number
        excluded_school_students?: number
        excluded_madrasa_students?: number
        excluded_hifz_students?: number
    }
    rules: {
        school: PromotionRule[]
        madrasa: PromotionRule[]
    }
    samples: {
        school: any[]
        madrasa: any[]
        hifz: any[]
    }
    all_school_students?: PromotionStudent[]
    all_madrasa_students?: PromotionStudent[]
    all_hifz_students?: PromotionStudent[]
    school_students?: PromotionStudent[]
    madrasa_students?: PromotionStudent[]
    hifz_students?: PromotionStudent[]
}

const none = "__none"

export default function PromotionsPage() {
    const { toast } = useToast()
    const [years, setYears] = useState<AcademicYear[]>([])
    const [staff, setStaff] = useState<any[]>([])
    const [hifzGroups, setHifzGroups] = useState<any[]>([])
    const [sourceYearId, setSourceYearId] = useState("")
    const [targetYearId, setTargetYearId] = useState("")
    const [schoolRules, setSchoolRules] = useState<PromotionRule[]>([])
    const [madrasaRules, setMadrasaRules] = useState<PromotionRule[]>([])
    const [carryMentor, setCarryMentor] = useState(true)
    const [carryGroup, setCarryGroup] = useState(true)
    const [newMentorId, setNewMentorId] = useState(none)
    const [newGroupId, setNewGroupId] = useState(none)
    const [preview, setPreview] = useState<Preview | null>(null)
    const [excludedSchoolIds, setExcludedSchoolIds] = useState<Set<string>>(new Set())
    const [excludedMadrasaIds, setExcludedMadrasaIds] = useState<Set<string>>(new Set())
    const [report, setReport] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [previewing, setPreviewing] = useState(false)
    const [committing, setCommitting] = useState(false)

    const sourceYear = useMemo(() => years.find((year) => year.id === sourceYearId), [years, sourceYearId])
    const targetYear = useMemo(() => years.find((year) => year.id === targetYearId), [years, targetYearId])
    const schoolPreviewRows = preview?.all_school_students || preview?.school_students || []
    const madrasaPreviewRows = preview?.all_madrasa_students || preview?.madrasa_students || []
    const includedSchoolCount = schoolPreviewRows.length - excludedSchoolIds.size
    const includedMadrasaCount = madrasaPreviewRows.length - excludedMadrasaIds.size

    async function loadData() {
        setLoading(true)
        try {
            const [yearsRes, staffRes] = await Promise.all([
                api.get("/academic-history/years"),
                api.get("/staff"),
            ])
            const nextYears = yearsRes.data?.data || []
            setYears(nextYears)
            setStaff(staffRes.data?.data || [])

            const current = nextYears.find((year: AcademicYear) => year.is_current) || nextYears[0]
            const next = nextYears.find((year: AcademicYear) => year.id !== current?.id) || nextYears[1]
            setSourceYearId(current?.id || "")
            setTargetYearId(next?.id || "")

            if (next?.id) {
                const groupRes = await api.get("/classes", { params: { academic_year_id: next.id, type: "Hifz" } })
                setHifzGroups(groupRes.data?.data || [])
            }
        } catch (err: any) {
            toast({ title: "Failed to load wizard data", description: err?.response?.data?.error || err.message, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (!targetYearId) return
        api.get("/classes", { params: { academic_year_id: targetYearId, type: "Hifz" } })
            .then((res) => setHifzGroups(res.data?.data || []))
            .catch(() => setHifzGroups([]))
    }, [targetYearId])

    function payload() {
        return {
            source_academic_year_id: sourceYearId,
            target_academic_year_id: targetYearId,
            school_rules: schoolRules,
            madrasa_rules: madrasaRules,
            excluded_school_student_ids: Array.from(excludedSchoolIds),
            excluded_madrasa_student_ids: Array.from(excludedMadrasaIds),
            hifz: {
                carry_mentor: carryMentor,
                carry_group: carryGroup,
                mentor_id: newMentorId === none ? null : newMentorId,
                hifz_group_class_id: newGroupId === none ? null : newGroupId,
            },
        }
    }

    async function generatePreview(useReturnedRules = false) {
        if (!sourceYearId || !targetYearId) {
            toast({ title: "Select source and target years", variant: "destructive" })
            return
        }
        setPreviewing(true)
        setReport(null)
        try {
            const res = await api.post("/academic-history/year-start/preview", payload())
            const nextPreview = res.data.preview
            setPreview(nextPreview)
            setExcludedSchoolIds(new Set())
            setExcludedMadrasaIds(new Set())
            if (!useReturnedRules || schoolRules.length === 0) setSchoolRules(nextPreview.rules.school || [])
            if (!useReturnedRules || madrasaRules.length === 0) setMadrasaRules(nextPreview.rules.madrasa || [])
            toast({ title: "Preview generated", description: `${nextPreview.totals.students_touched} students in scope` })
        } catch (err: any) {
            toast({ title: "Preview failed", description: err?.response?.data?.error || err.message, variant: "destructive" })
        } finally {
            setPreviewing(false)
        }
    }

    async function commit() {
        if (!preview) {
            toast({ title: "Generate preview first", variant: "destructive" })
            return
        }
        const ok = confirm(`Start the new academic year now?\n\nIncluded school promotions: ${includedSchoolCount}\nExcluded school students: ${excludedSchoolIds.size}\nIncluded madrasa promotions: ${includedMadrasaCount}\nExcluded madrasa students: ${excludedMadrasaIds.size}\n\nExcluded students will not be promoted in this run and can be promoted later. This will not modify historical attendance, Hifz logs, leaves, or monthly reports.`)
        if (!ok) return
        setCommitting(true)
        try {
            const res = await api.post("/academic-history/year-start/commit", payload())
            setReport(res.data)
            toast({ title: "Year started", description: "Migration report generated successfully." })
        } catch (err: any) {
            toast({ title: "Commit failed", description: err?.response?.data?.error || err.message, variant: "destructive" })
        } finally {
            setCommitting(false)
        }
    }

    function updateRule(track: "school" | "madrasa", index: number, key: keyof PromotionRule, value: string) {
        const setter = track === "school" ? setSchoolRules : setMadrasaRules
        const source = track === "school" ? schoolRules : madrasaRules
        setter(source.map((rule, i) => i === index ? { ...rule, [key]: value || null } : rule))
    }

    function toggleExcluded(track: "school" | "madrasa", studentId: string) {
        const setter = track === "school" ? setExcludedSchoolIds : setExcludedMadrasaIds
        setter((current) => {
            const next = new Set(current)
            if (next.has(studentId)) next.delete(studentId)
            else next.add(studentId)
            return next
        })
    }

    return (
        <main className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <Wand2 className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Academic Year</p>
                            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Year Start Wizard</h1>
                            <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500">
                                Bulk promote School and Madrasa enrollments, carry forward Hifz assignments, and create target-year snapshots.
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" onClick={loadData} disabled={loading}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                    </Button>
                </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <StepHeader number={1} title="Select Years" />
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <Label>Source Year</Label>
                            <Select value={sourceYearId} onValueChange={setSourceYearId}>
                                <SelectTrigger><SelectValue placeholder="Source year" /></SelectTrigger>
                                <SelectContent>{years.map((year) => <SelectItem key={year.id} value={year.id}>{year.name}</SelectItem>)}</SelectContent>
                            </Select>
                            {sourceYear && <p className="text-xs font-semibold text-slate-400">{sourceYear.start_date?.slice(0, 10)} to {sourceYear.end_date?.slice(0, 10)}</p>}
                        </div>
                        <div className="grid gap-2">
                            <Label>Target Year</Label>
                            <Select value={targetYearId} onValueChange={setTargetYearId}>
                                <SelectTrigger><SelectValue placeholder="Target year" /></SelectTrigger>
                                <SelectContent>{years.map((year) => <SelectItem key={year.id} value={year.id}>{year.name}</SelectItem>)}</SelectContent>
                            </Select>
                            {targetYear && <p className="text-xs font-semibold text-slate-400">{targetYear.start_date?.slice(0, 10)} to {targetYear.end_date?.slice(0, 10)}</p>}
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                    <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-1 h-5 w-5 text-emerald-700" />
                        <div>
                            <h2 className="font-black text-emerald-950">Protected Historical Tables</h2>
                            <p className="mt-1 text-sm font-semibold leading-6 text-emerald-800">
                                This wizard does not modify attendance marks, schedules, Hifz logs, leaves, or monthly reports.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
                <RuleEditor title="School Promotion" number={2} rules={schoolRules} track="school" onChange={updateRule} />
                <RuleEditor title="Madrasa Promotion" number={2} rules={madrasaRules} track="madrasa" onChange={updateRule} />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <StepHeader number={3} title="Carry Forward Hifz Assignments" />
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                        <div>
                            <p className="font-black text-slate-900">Keep Same Hifz Mentor</p>
                            <p className="text-sm font-medium text-slate-500">Uses current profile mentor for each student.</p>
                        </div>
                        <Switch checked={carryMentor} onCheckedChange={setCarryMentor} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                        <div>
                            <p className="font-black text-slate-900">Keep Same Hifz Group</p>
                            <p className="text-sm font-medium text-slate-500">Uses current Hifz group where assigned.</p>
                        </div>
                        <Switch checked={carryGroup} onCheckedChange={setCarryGroup} />
                    </div>
                    {!carryMentor && (
                        <div className="grid gap-2">
                            <Label>Assign New Mentor</Label>
                            <Select value={newMentorId} onValueChange={setNewMentorId}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={none}>No mentor</SelectItem>
                                    {staff.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {!carryGroup && (
                        <div className="grid gap-2">
                            <Label>Assign New Hifz Group</Label>
                            <Select value={newGroupId} onValueChange={setNewGroupId}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={none}>No group</SelectItem>
                                    {hifzGroups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <StepHeader number={4} title="Preview And Create Enrollments" />
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <Button onClick={() => generatePreview(true)} disabled={previewing || loading}>
                        {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                        Generate Preview
                    </Button>
                    <Button variant="outline" onClick={commit} disabled={committing || !preview}>
                        {committing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        Start Year
                    </Button>
                </div>

                {preview && (
                    <div className="mt-5 grid gap-3 md:grid-cols-4">
                        <Metric label="Students in scope" value={preview.totals.students_touched} />
                        <Metric label="School included" value={includedSchoolCount} />
                        <Metric label="Madrasa included" value={includedMadrasaCount} />
                        <Metric label="Hifz carried" value={preview.totals.hifz_students} />
                    </div>
                )}

                {preview && (
                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                        <StudentSelection
                            title="School Student Selection"
                            rows={schoolPreviewRows}
                            excludedIds={excludedSchoolIds}
                            onToggle={(studentId) => toggleExcluded("school", studentId)}
                            onSetExcluded={setExcludedSchoolIds}
                        />
                        <StudentSelection
                            title="Madrasa Student Selection"
                            rows={madrasaPreviewRows}
                            excludedIds={excludedMadrasaIds}
                            onToggle={(studentId) => toggleExcluded("madrasa", studentId)}
                            onSetExcluded={setExcludedMadrasaIds}
                        />
                    </div>
                )}

                {preview && (
                    <div className="mt-5 grid gap-4 xl:grid-cols-3">
                        <SampleList title="School Preview" rows={preview.samples.school} />
                        <SampleList title="Madrasa Preview" rows={preview.samples.madrasa} />
                        <SampleList title="Hifz Preview" rows={preview.samples.hifz} hifz />
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <StepHeader number={5} title="Migration Report" />
                {report ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <Metric label="Snapshots created" value={report.totals.snapshots_created} />
                        <Metric label="School enrollments created" value={report.totals.school_enrollments_created} />
                        <Metric label="Madrasa enrollments created" value={report.totals.madrasa_enrollments_created} />
                    </div>
                ) : (
                    <p className="mt-3 text-sm font-semibold text-slate-500">Run the wizard to generate a report.</p>
                )}
            </section>
        </main>
    )
}

function StepHeader({ number, title }: { number: number; title: string }) {
    return (
        <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-black text-white">{number}</div>
            <h2 className="text-lg font-black text-slate-950">{title}</h2>
        </div>
    )
}

function Metric({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-2xl font-black text-slate-950">{value}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
        </div>
    )
}

function StudentSelection({
    title,
    rows,
    excludedIds,
    onToggle,
    onSetExcluded,
}: {
    title: string
    rows: PromotionStudent[]
    excludedIds: Set<string>
    onToggle: (studentId: string) => void
    onSetExcluded: (ids: Set<string>) => void
}) {
    const [filter, setFilter] = useState("all")
    const standards = useMemo(() => {
        return Array.from(new Set(rows.map((row) => row.from_standard || "Unassigned"))).sort()
    }, [rows])
    const filteredRows = useMemo(() => {
        if (filter === "all") return rows
        return rows.filter((row) => (row.from_standard || "Unassigned") === filter)
    }, [filter, rows])
    const included = rows.length - excludedIds.size

    function excludeFiltered() {
        onSetExcluded(new Set([...excludedIds, ...filteredRows.map((row) => row.student_id)]))
    }

    function includeFiltered() {
        const next = new Set(excludedIds)
        filteredRows.forEach((row) => next.delete(row.student_id))
        onSetExcluded(next)
    }

    return (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h3 className="font-black text-slate-950">{title}</h3>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                        {included} included / {excludedIds.size} excluded
                    </p>
                </div>
                <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger className="bg-white sm:w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All standards</SelectItem>
                        {standards.map((standard) => <SelectItem key={standard} value={standard}>{standard}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={includeFiltered}>Include shown</Button>
                <Button type="button" variant="outline" size="sm" onClick={excludeFiltered}>Exclude shown</Button>
            </div>
            <div className="mt-3 max-h-[360px] overflow-y-auto rounded-lg border border-slate-200 bg-white">
                {filteredRows.length === 0 ? (
                    <p className="p-4 text-sm font-bold text-slate-400">No students in this track.</p>
                ) : filteredRows.map((row) => {
                    const excluded = excludedIds.has(row.student_id)
                    return (
                        <label key={`${title}-${row.student_id}`} className={`flex cursor-pointer items-start gap-3 border-b border-slate-100 p-3 last:border-b-0 ${excluded ? "bg-amber-50" : "bg-white"}`}>
                            <input
                                type="checkbox"
                                checked={!excluded}
                                onChange={() => onToggle(row.student_id)}
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-black text-slate-900">{row.name}</p>
                                <p className="text-xs font-semibold text-slate-500">
                                    {row.student_id} • {row.from_standard || "Unassigned"}{row.from_section ? `-${row.from_section}` : ""} → {row.to_standard || "-"}{row.to_section ? `-${row.to_section}` : ""}
                                </p>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${excluded ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                {excluded ? "Later" : "Promote"}
                            </span>
                        </label>
                    )
                })}
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">
                Unchecked students are skipped in this run. They remain available for a later promotion.
            </p>
        </section>
    )
}

function RuleEditor({ title, number, rules, track, onChange }: {
    title: string
    number: number
    rules: PromotionRule[]
    track: "school" | "madrasa"
    onChange: (track: "school" | "madrasa", index: number, key: keyof PromotionRule, value: string) => void
}) {
    return (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <StepHeader number={number} title={title} />
            <p className="mt-2 text-sm font-semibold text-slate-500">Generate preview once to auto-fill promotion rows. Edit destination standards or sections before starting the year.</p>
            <div className="mt-4 space-y-2">
                {rules.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm font-bold text-slate-400">No rules yet. Generate preview to build defaults.</div>
                ) : rules.map((rule, index) => (
                    <div key={`${rule.from_standard}-${rule.from_section}-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-xs">From</Label>
                                <Input value={rule.from_standard} onChange={(event) => onChange(track, index, "from_standard", event.target.value)} />
                            </div>
                            <div>
                                <Label className="text-xs">Section</Label>
                                <Input value={rule.from_section || ""} onChange={(event) => onChange(track, index, "from_section", event.target.value.toUpperCase())} />
                            </div>
                        </div>
                        <ArrowRight className="hidden h-5 w-5 text-slate-400 sm:block" />
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-xs">To</Label>
                                <Input value={rule.to_standard} onChange={(event) => onChange(track, index, "to_standard", event.target.value)} />
                            </div>
                            <div>
                                <Label className="text-xs">Section</Label>
                                <Input value={rule.to_section || ""} onChange={(event) => onChange(track, index, "to_section", event.target.value.toUpperCase())} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}

function SampleList({ title, rows, hifz = false }: { title: string; rows: any[]; hifz?: boolean }) {
    return (
        <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-100 px-3 py-2">
                <p className="font-black text-slate-900">{title}</p>
            </div>
            <div className="max-h-[320px] overflow-y-auto p-2">
                {rows.length === 0 ? (
                    <p className="p-3 text-sm font-bold text-slate-400">No rows.</p>
                ) : rows.map((row) => (
                    <div key={`${title}-${row.student_id}`} className="rounded-md px-2 py-2 text-sm">
                        <p className="font-black text-slate-800">{row.name}</p>
                        <p className="text-xs font-semibold text-slate-500">
                            {hifz
                                ? `${row.from_mentor_name || "No mentor"}`
                                : `${row.from_standard}${row.from_section ? `-${row.from_section}` : ""} -> ${row.to_standard}${row.to_section ? `-${row.to_section}` : ""}`}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    )
}
