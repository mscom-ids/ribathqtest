"use client"

import { useEffect, useMemo, useState } from "react"
import { BookOpen, Plus, RefreshCw, Save, UserPlus } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

type AcademicYear = { id: string; name: string; is_current?: boolean }
type HifzSession = {
    id: string
    name: string
    code: string
    start_time?: string | null
    end_time?: string | null
    sort_order?: number
    is_active?: boolean
}
type Rule = {
    id: string
    hifz_session_id: string
    standard: string
    section?: string | null
    mentor_id?: string | null
    is_active: boolean
}
type ClassRow = { standard?: string | null; section?: string | null; type: string }

const defaultStandards = ["5th", "6th", "7th", "8th", "9th", "10th", "Plus One", "Plus Two"]
const none = "__none"

function rowKey(standard: string, section?: string | null) {
    return `${standard}|||${section || ""}`
}

function displayRow(standard: string, section?: string | null) {
    return section ? `${standard} ${section}` : standard
}

export default function HifzSessionRulesPage() {
    const { toast } = useToast()
    const [years, setYears] = useState<AcademicYear[]>([])
    const [yearId, setYearId] = useState("")
    const [sessions, setSessions] = useState<HifzSession[]>([])
    const [rules, setRules] = useState<Rule[]>([])
    const [classes, setClasses] = useState<ClassRow[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [newSession, setNewSession] = useState({ name: "", start_time: "", end_time: "" })
    const [manualRow, setManualRow] = useState({ standard: "", section: "" })
    const [enabled, setEnabled] = useState<Record<string, boolean>>({})
    const [override, setOverride] = useState({ student_id: "", hifz_session_id: "", assignment_type: "include", reason: "" })

    const standardRows = useMemo(() => {
        const source = classes
            .filter((item) => item.type === "School" && item.standard)
            .map((item) => ({ standard: item.standard || "", section: item.section || "" }))
        const rows = source.length > 0
            ? source
            : defaultStandards.map((standard) => ({ standard, section: "" }))
        const map = new Map<string, { standard: string; section: string }>()
        rows.forEach((row) => map.set(rowKey(row.standard, row.section), row))
        rules.forEach((rule) => map.set(rowKey(rule.standard, rule.section), { standard: rule.standard, section: rule.section || "" }))
        if (manualRow.standard.trim()) {
            map.set(rowKey(manualRow.standard.trim(), manualRow.section.trim()), {
                standard: manualRow.standard.trim(),
                section: manualRow.section.trim(),
            })
        }
        return Array.from(map.values()).sort((a, b) => displayRow(a.standard, a.section).localeCompare(displayRow(b.standard, b.section), undefined, { numeric: true }))
    }, [classes, rules, manualRow])

    async function loadYears() {
        const res = await api.get("/classes/academic-years")
        const rows = res.data?.data || []
        setYears(rows)
        const selected = yearId || rows.find((year: AcademicYear) => !year.is_current && year.name.includes("2026"))?.id || rows.find((year: AcademicYear) => year.is_current)?.id || rows[0]?.id || ""
        setYearId(selected)
        return selected
    }

    async function loadSetup(targetYear = yearId) {
        if (!targetYear) return
        setLoading(true)
        try {
            const [setupRes, classesRes] = await Promise.all([
                api.get("/hifz-session-rules", { params: { academic_year_id: targetYear } }),
                api.get("/classes", { params: { academic_year_id: targetYear, type: "School" } }),
            ])
            const nextSessions = setupRes.data?.sessions || []
            const nextRules = setupRes.data?.rules || []
            setSessions(nextSessions)
            setRules(nextRules)
            setClasses(classesRes.data?.data || [])
            const nextEnabled: Record<string, boolean> = {}
            nextRules.forEach((rule: Rule) => {
                if (rule.is_active && !rule.mentor_id) nextEnabled[`${rowKey(rule.standard, rule.section)}|||${rule.hifz_session_id}`] = true
            })
            setEnabled(nextEnabled)
        } catch (err: any) {
            toast({ title: "Failed to load Hifz session setup", description: err?.response?.data?.error || err.message, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadYears().then((selected) => loadSetup(selected)).catch((err) => {
            setLoading(false)
            toast({ title: "Failed to load academic years", description: err.message, variant: "destructive" })
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (yearId) void loadSetup(yearId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [yearId])

    function toggleRule(standard: string, section: string, sessionId: string, checked: boolean) {
        setEnabled((current) => ({ ...current, [`${rowKey(standard, section)}|||${sessionId}`]: checked }))
    }

    async function createSession() {
        if (!newSession.name.trim()) {
            toast({ title: "Session name is required", variant: "destructive" })
            return
        }
        try {
            await api.post("/hifz-session-rules/sessions", {
                academic_year_id: yearId,
                name: newSession.name.trim(),
                start_time: newSession.start_time || null,
                end_time: newSession.end_time || null,
                sort_order: sessions.length + 1,
            })
            setNewSession({ name: "", start_time: "", end_time: "" })
            toast({ title: "Hifz session created" })
            await loadSetup(yearId)
        } catch (err: any) {
            toast({ title: "Session save failed", description: err?.response?.data?.error || err.message, variant: "destructive" })
        }
    }

    async function saveRules() {
        setSaving(true)
        try {
            const payload = standardRows.flatMap((row) => sessions.map((session) => ({
                standard: row.standard,
                section: row.section || null,
                hifz_session_id: session.id,
                enabled: !!enabled[`${rowKey(row.standard, row.section)}|||${session.id}`],
            })))
            await api.post("/hifz-session-rules/rules/bulk", { academic_year_id: yearId, rules: payload })
            toast({ title: "Hifz session rules saved" })
            await loadSetup(yearId)
        } catch (err: any) {
            toast({ title: "Rules save failed", description: err?.response?.data?.error || err.message, variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    async function saveOverride() {
        if (!override.student_id.trim() || !override.hifz_session_id) {
            toast({ title: "Student and session are required", variant: "destructive" })
            return
        }
        try {
            await api.post("/hifz-session-rules/assignments", {
                academic_year_id: yearId,
                student_id: override.student_id.trim(),
                hifz_session_id: override.hifz_session_id,
                assignment_type: override.assignment_type,
                reason: override.reason || null,
            })
            toast({ title: "Student override saved" })
            setOverride({ student_id: "", hifz_session_id: "", assignment_type: "include", reason: "" })
            await loadSetup(yearId)
        } catch (err: any) {
            toast({ title: "Override save failed", description: err?.response?.data?.error || err.message, variant: "destructive" })
        }
    }

    return (
        <main className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                            <BookOpen className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Academic</p>
                            <h1 className="mt-1 text-2xl font-black text-slate-950">Hifz Session Rules</h1>
                            <p className="mt-1 text-sm font-medium text-slate-500">Define which standards or sections may attend each Hifz attendance session.</p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Select value={yearId} onValueChange={setYearId}>
                            <SelectTrigger className="bg-white sm:w-[190px]"><SelectValue placeholder="Academic year" /></SelectTrigger>
                            <SelectContent>{years.map((year) => <SelectItem key={year.id} value={year.id}>{year.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button variant="outline" onClick={() => loadSetup(yearId)}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
                    </div>
                </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-black text-slate-950">Sessions</h2>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                    {sessions.map((session) => (
                        <div key={session.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                            <p className="font-black text-slate-900">{session.name}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{session.start_time || "-"} to {session.end_time || "-"}</p>
                        </div>
                    ))}
                    <div className="rounded-lg border border-dashed border-slate-200 p-4">
                        <div className="grid gap-2">
                            <Label>New Session</Label>
                            <Input value={newSession.name} onChange={(event) => setNewSession({ ...newSession, name: event.target.value })} placeholder="Subh, Morning, Noon, Evening" />
                            <div className="grid grid-cols-2 gap-2">
                                <Input type="time" value={newSession.start_time} onChange={(event) => setNewSession({ ...newSession, start_time: event.target.value })} />
                                <Input type="time" value={newSession.end_time} onChange={(event) => setNewSession({ ...newSession, end_time: event.target.value })} />
                            </div>
                            <Button onClick={createSession}><Plus className="mr-2 h-4 w-4" />Add Session</Button>
                        </div>
                    </div>
                </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <h2 className="text-lg font-black text-slate-950">Standard / Section Rules</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">A student can be eligible for multiple sessions. Empty section means the rule applies to the full standard.</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Input value={manualRow.standard} onChange={(event) => setManualRow({ ...manualRow, standard: event.target.value })} placeholder="Add standard" />
                        <Input value={manualRow.section} onChange={(event) => setManualRow({ ...manualRow, section: event.target.value.toUpperCase() })} placeholder="Section" />
                        <Button onClick={saveRules} disabled={saving || sessions.length === 0}>
                            <Save className="mr-2 h-4 w-4" />{saving ? "Saving" : "Save Rules"}
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-sm font-bold text-slate-400">Loading setup...</div>
                ) : sessions.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-6 text-sm font-bold text-slate-400">Create at least one Hifz session before assigning rules.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] border-separate border-spacing-0">
                            <thead>
                                <tr>
                                    <th className="border-b border-slate-100 px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-400">Standard / Section</th>
                                    {sessions.map((session) => <th key={session.id} className="border-b border-slate-100 px-3 py-3 text-center text-xs font-black uppercase tracking-wide text-slate-400">{session.name}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {standardRows.map((row) => (
                                    <tr key={rowKey(row.standard, row.section)}>
                                        <td className="border-b border-slate-100 px-3 py-3 font-black text-slate-900">{displayRow(row.standard, row.section)}</td>
                                        {sessions.map((session) => {
                                            const key = `${rowKey(row.standard, row.section)}|||${session.id}`
                                            return (
                                                <td key={key} className="border-b border-slate-100 px-3 py-3 text-center">
                                                    <Checkbox checked={!!enabled[key]} onCheckedChange={(checked) => toggleRule(row.standard, row.section, session.id, checked === true)} />
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-slate-600" />
                    <h2 className="text-lg font-black text-slate-950">Student Overrides</h2>
                </div>
                <div className="grid gap-3 lg:grid-cols-[1fr_220px_160px_1fr_auto]">
                    <Input value={override.student_id} onChange={(event) => setOverride({ ...override, student_id: event.target.value })} placeholder="Admission no." />
                    <Select value={override.hifz_session_id || none} onValueChange={(value) => setOverride({ ...override, hifz_session_id: value === none ? "" : value })}>
                        <SelectTrigger><SelectValue placeholder="Session" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={none}>Select session</SelectItem>
                            {sessions.map((session) => <SelectItem key={session.id} value={session.id}>{session.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={override.assignment_type} onValueChange={(value) => setOverride({ ...override, assignment_type: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="include">Include</SelectItem>
                            <SelectItem value="exclude">Exclude</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input value={override.reason} onChange={(event) => setOverride({ ...override, reason: event.target.value })} placeholder="Reason" />
                    <Button onClick={saveOverride}>Save</Button>
                </div>
            </section>
        </main>
    )
}
