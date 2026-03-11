"use client"

import { useState, useEffect } from "react"
import { format, eachDayOfInterval, startOfMonth } from "date-fns"
import { CalendarRange, Zap, Loader2, XCircle, CheckCircle2, Settings2 } from "lucide-react"
import { applyModeRules, getDayMode } from "@/lib/academic-rules"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import api from "@/lib/api"
import { cn } from "@/lib/utils"

// Type Definitions
type CancelledSession = { reason_type: string; reason_text: string }

type CalendarPolicy = {
    date: string
    is_holiday: boolean
    description: string | null
    day_mode?: "Normal" | "Friday" | "Weekday" | "Custom"
    effective_day_of_week: number | null
    allowed_session_types: string[] | null
    allowed_standards: string[] | null
    session_overrides?: Record<string, string[]> | null
    cancellation_reason_type?: string | null
    cancellation_reason_text?: string | null
    cancelled_sessions?: Record<string, CancelledSession> | null
    leave_standards?: string[] | null
}

const ALL_STANDARDS = ["5th", "6th", "7th", "8th", "9th", "10th"]
const REASON_TYPES = ["Monthly", "Institutional", "Campus", "Other"]

function getModeForDayOfWeek(dayOfWeek: number): "Normal" | "Friday" | "Weekday" {
    if (dayOfWeek === 5) return "Friday"
    if (dayOfWeek === 0 || dayOfWeek === 6) return "Weekday"
    return "Normal"
}

function getAllowedTypesForMode(mode: string): string[] {
    if (mode === "Friday") return ["School"]
    if (mode === "Weekday") return ["Hifz", "Madrassa"]
    return ["Hifz", "School"]
}

export default function CalendarPage() {
    const [date, setDate] = useState<Date | undefined>(new Date())
    const [month, setMonth] = useState<Date>(new Date())
    const [policies, setPolicies] = useState<Record<string, CalendarPolicy>>({})
    const [sessions, setSessions] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [generating, setGenerating] = useState(false)

    // Dialog States
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingPolicy, setEditingPolicy] = useState<CalendarPolicy | null>(null)
    const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
    const [modeEditorOpen, setModeEditorOpen] = useState(false)

    // Bulk state
    const [bulkStartDate, setBulkStartDate] = useState("")
    const [bulkEndDate, setBulkEndDate] = useState("")
    const [bulkMode, setBulkMode] = useState("Holiday")
    const [bulkReason, setBulkReason] = useState("Institutional")
    const [bulkReasonText, setBulkReasonText] = useState("")
    const [bulkLeaveStandards, setBulkLeaveStandards] = useState<string[]>([])
    const [bulkSaving, setBulkSaving] = useState(false)

    // Mode editor state
    const [modeEditTarget, setModeEditTarget] = useState<"Normal" | "Friday" | "Weekday">("Normal")
    const [modeEffectiveDate, setModeEffectiveDate] = useState("")
    const [modeSaving, setModeSaving] = useState(false)

    // Load Sessions
    useEffect(() => {
        async function loadSessions() {
            try {
                const res = await api.get('/academics/sessions', { params: { is_active: true } })
                if (res.data.success) setSessions(res.data.sessions || [])
            } catch (e) { console.error(e) }
        }
        loadSessions()
    }, [])

    // Load Policies
    async function loadPolicies() {
        setLoading(true)
        try {
            const res = await api.get('/academics/calendar')
            if (res.data.success) {
                const map: Record<string, CalendarPolicy> = {}
                ;(res.data.policies || []).forEach((p: any) => { map[p.date] = p })
                setPolicies(map)
            }
        } catch (e) { console.error(e) }
        setLoading(false)
    }

    useEffect(() => { loadPolicies() }, [])

    // ============================
    // DAY CLICK HANDLER
    // ============================
    const handleDayClick = (day: Date) => {
        setDate(day)
        const dateStr = format(day, "yyyy-MM-dd")
        const existing = policies[dateStr]

        if (existing) {
            setEditingPolicy({
                ...existing,
                cancelled_sessions: existing.cancelled_sessions || {},
                leave_standards: existing.leave_standards || [],
            })
        } else {
            const defaultMode = getModeForDayOfWeek(day.getDay())
            setEditingPolicy({
                date: dateStr,
                is_holiday: false,
                description: "",
                day_mode: defaultMode,
                effective_day_of_week: null,
                allowed_session_types: getAllowedTypesForMode(defaultMode),
                allowed_standards: [],
                session_overrides: applyModeRules(defaultMode, sessions),
                cancellation_reason_type: null,
                cancellation_reason_text: null,
                cancelled_sessions: {},
                leave_standards: [],
            })
        }
        setDialogOpen(true)
    }

    // ============================
    // SAVE POLICY
    // ============================
    const savePolicy = async () => {
        if (!editingPolicy || !date) return

        let finalAllowedTypes = editingPolicy.allowed_session_types
        let finalOverrides = editingPolicy.session_overrides

        if (!editingPolicy.is_holiday && editingPolicy.day_mode && editingPolicy.day_mode !== "Custom") {
            finalOverrides = applyModeRules(editingPolicy.day_mode, sessions)
            if (editingPolicy.day_mode === "Friday") finalAllowedTypes = ["School"]
            else if (editingPolicy.day_mode === "Weekday") finalAllowedTypes = ["Hifz", "Madrassa"]
            else if (editingPolicy.day_mode === "Normal") finalAllowedTypes = ["Hifz", "School"]
        }

        // Build payload with only defined columns
        const payload: any = {
            date: editingPolicy.date,
            is_holiday: editingPolicy.is_holiday,
            description: editingPolicy.description || null,
            day_mode: editingPolicy.day_mode || "Normal",
            effective_day_of_week: editingPolicy.effective_day_of_week,
            allowed_session_types: finalAllowedTypes?.length ? finalAllowedTypes : null,
            allowed_standards: editingPolicy.allowed_standards?.length ? editingPolicy.allowed_standards : null,
            session_overrides: Object.keys(finalOverrides || {}).length > 0 ? finalOverrides : null,
        }

        // Only include new columns (they exist after migration)
        const cancelledSessions = editingPolicy.cancelled_sessions || {}
        payload.cancelled_sessions = Object.keys(cancelledSessions).length > 0 ? cancelledSessions : {}
        payload.leave_standards = editingPolicy.leave_standards?.length ? editingPolicy.leave_standards : []
        payload.cancellation_reason_type = editingPolicy.is_holiday ? (editingPolicy.cancellation_reason_type || null) : null
        payload.cancellation_reason_text = editingPolicy.is_holiday ? (editingPolicy.cancellation_reason_text || null) : null

        try {
            const res = await api.put('/academics/calendar', payload)
            if (res.data.success) {
                loadPolicies()
                setDialogOpen(false)
            } else {
                alert("Failed to save policy: " + res.data.error)
            }
        } catch (err: any) {
            console.error(err)
            alert("Failed to save policy: " + err.message)
        }
    }

    const deletePolicy = async () => {
        if (!editingPolicy || !date) return
        if (!confirm("Reset custom rules for this date?")) return
        try {
            const res = await api.delete(`/academics/calendar/${editingPolicy.date}`)
            if (res.data.success) {
                const np = { ...policies }; delete np[editingPolicy.date]; setPolicies(np); setDialogOpen(false)
            } else {
                alert("Failed to reset date")
            }
        } catch { alert("Failed to reset date") }
    }

    // ============================
    // GENERATE YEAR SCHEDULE
    // ============================
    const generateYearSchedule = async () => {
        if (!confirm("Generate default schedule for June 2025 → May 2026?\nExisting custom rules will NOT be overwritten.")) return
        setGenerating(true)
        try {
            const allDays = eachDayOfInterval({ start: new Date(2025, 5, 1), end: new Date(2026, 4, 31) })
            const existingDates = new Set(Object.keys(policies))
            const entries: any[] = []

            for (const day of allDays) {
                const dateStr = format(day, "yyyy-MM-dd")
                if (existingDates.has(dateStr)) continue
                const mode = getModeForDayOfWeek(day.getDay())
                const overrides = applyModeRules(mode, sessions)
                entries.push({
                    date: dateStr, is_holiday: false, description: null,
                    day_mode: mode, effective_day_of_week: null,
                    allowed_session_types: getAllowedTypesForMode(mode),
                    allowed_standards: null,
                    session_overrides: Object.keys(overrides).length > 0 ? overrides : null,
                    cancelled_sessions: {}, leave_standards: [],
                    cancellation_reason_type: null, cancellation_reason_text: null,
                })
            }

            try {
                const res = await api.post('/academics/calendar/generate', {
                    entries: entries.filter((_, i) => i < 1000) // Limit safety
                })
                if (res.data.success) {
                    await loadPolicies()
                    alert(`Generated ${entries.length} new day entries!`)
                } else {
                    alert('Failed to generate: ' + res.data.error)
                }
            } catch (err) { alert("Failed") }
        } catch (err) { alert("Failed") }
        finally { setGenerating(false) }
    }

    // ============================
    // BULK CHANGE
    // ============================
    const handleBulkSave = async () => {
        if (!bulkStartDate) { alert("Select a start date"); return }
        setBulkSaving(true)
        try {
            const start = new Date(bulkStartDate + "T00:00:00")
            const end = bulkEndDate ? new Date(bulkEndDate + "T00:00:00") : new Date(2026, 4, 31)
            const allDays = eachDayOfInterval({ start, end })
            const entries: any[] = []

            for (const day of allDays) {
                const dateStr = format(day, "yyyy-MM-dd")

                if (bulkMode === "Holiday") {
                    entries.push({
                        date: dateStr, is_holiday: true,
                        description: bulkReasonText || "Holiday",
                        day_mode: "Normal", effective_day_of_week: null,
                        allowed_session_types: null, allowed_standards: null,
                        session_overrides: null, cancelled_sessions: {},
                        leave_standards: [],
                        cancellation_reason_type: bulkReason, cancellation_reason_text: bulkReasonText || null,
                    })
                } else if (bulkMode === "Leave") {
                    // Standard-specific leave — not a full holiday
                    entries.push({
                        date: dateStr, is_holiday: false,
                        description: bulkReasonText || "Standard Leave",
                        day_mode: getModeForDayOfWeek(day.getDay()),
                        effective_day_of_week: null,
                        allowed_session_types: getAllowedTypesForMode(getModeForDayOfWeek(day.getDay())),
                        allowed_standards: null,
                        session_overrides: applyModeRules(getModeForDayOfWeek(day.getDay()), sessions),
                        cancelled_sessions: {},
                        leave_standards: bulkLeaveStandards,
                        cancellation_reason_type: bulkReason, cancellation_reason_text: bulkReasonText || null,
                    })
                } else {
                    const mode = bulkMode as "Normal" | "Friday" | "Weekday" | "Custom"
                    const overrides = mode !== "Custom" ? applyModeRules(mode, sessions) : {}
                    entries.push({
                        date: dateStr, is_holiday: false, description: null,
                        day_mode: mode, effective_day_of_week: null,
                        allowed_session_types: mode !== "Custom" ? getAllowedTypesForMode(mode) : null,
                        allowed_standards: null,
                        session_overrides: Object.keys(overrides).length > 0 ? overrides : null,
                        cancelled_sessions: {}, leave_standards: [],
                        cancellation_reason_type: null, cancellation_reason_text: null,
                    })
                }
            }

            try {
                const res = await api.post('/academics/calendar/bulk', { entries })
                if (res.data.success) {
                    await loadPolicies()
                    setBulkDialogOpen(false)
                    alert(`Updated ${entries.length} days!`)
                } else {
                    alert('Failed: ' + res.data.error)
                }
            } catch (err) { alert("Failed") }
        } catch (err) { alert("Failed") }
        finally { setBulkSaving(false) }
    }

    // ============================
    // MODE TEMPLATE EDITOR
    // ============================
    const applyModeFromDate = async () => {
        if (!modeEffectiveDate) { alert("Select an effective date"); return }
        if (!confirm(`Apply "${modeEditTarget}" mode rules from ${modeEffectiveDate} to end of academic year?\nThis will overwrite existing rules for matching day-of-week days.`)) return

        setModeSaving(true)
        try {
            const start = new Date(modeEffectiveDate + "T00:00:00")
            const end = new Date(2026, 4, 31)
            const allDays = eachDayOfInterval({ start, end })

            // Only apply to days that match the target mode's day-of-week pattern
            const targetDays = allDays.filter(d => {
                const implicitMode = getModeForDayOfWeek(d.getDay())
                return implicitMode === modeEditTarget
            })

            const overrides = applyModeRules(modeEditTarget, sessions)
            const allowedTypes = getAllowedTypesForMode(modeEditTarget)

            const entries = targetDays.map(day => ({
                date: format(day, "yyyy-MM-dd"),
                is_holiday: false, description: null,
                day_mode: modeEditTarget, effective_day_of_week: null,
                allowed_session_types: allowedTypes,
                allowed_standards: null,
                session_overrides: Object.keys(overrides).length > 0 ? overrides : null,
                cancelled_sessions: {}, leave_standards: [],
                cancellation_reason_type: null, cancellation_reason_text: null,
            }))

            try {
                const res = await api.post('/academics/calendar/bulk', { entries })
                if (res.data.success) {
                    await loadPolicies()
                    setModeEditorOpen(false)
                    alert(`Applied "${modeEditTarget}" rules to ${entries.length} days from ${modeEffectiveDate}!`)
                } else {
                    alert('Failed: ' + res.data.error)
                }
            } catch (err) { alert("Failed") }
        } catch (err) { alert("Failed") }
        finally { setModeSaving(false) }
    }

    // ============================
    // HELPERS
    // ============================
    const getLocalDayMode = (date: Date): string => getDayMode(date, policies)

    const toggleSessionCancel = (sessionId: string) => {
        if (!editingPolicy) return
        const cs = { ...(editingPolicy.cancelled_sessions || {}) }
        if (cs[sessionId]) {
            delete cs[sessionId]
        } else {
            cs[sessionId] = { reason_type: "Institutional", reason_text: "" }
        }
        setEditingPolicy({ ...editingPolicy, cancelled_sessions: cs })
    }

    const updateSessionCancelReason = (sessionId: string, field: "reason_type" | "reason_text", value: string) => {
        if (!editingPolicy) return
        const cs = { ...(editingPolicy.cancelled_sessions || {}) }
        if (cs[sessionId]) {
            cs[sessionId] = { ...cs[sessionId], [field]: value }
        }
        setEditingPolicy({ ...editingPolicy, cancelled_sessions: cs })
    }

    const toggleLeaveStandard = (std: string) => {
        if (!editingPolicy) return
        const current = editingPolicy.leave_standards || []
        const next = current.includes(std) ? current.filter(s => s !== std) : [...current, std]
        setEditingPolicy({ ...editingPolicy, leave_standards: next })
    }

    // Calendar modifiers
    const modifiers = {
        holiday: (d: Date) => policies[format(d, "yyyy-MM-dd")]?.is_holiday === true,
        hasLeave: (d: Date) => (policies[format(d, "yyyy-MM-dd")]?.leave_standards?.length || 0) > 0,
        normalDay: (d: Date) => !policies[format(d, "yyyy-MM-dd")]?.is_holiday && getLocalDayMode(d) === "Normal",
        fridayDay: (d: Date) => !policies[format(d, "yyyy-MM-dd")]?.is_holiday && getLocalDayMode(d) === "Friday",
        weekdayMode: (d: Date) => !policies[format(d, "yyyy-MM-dd")]?.is_holiday && getLocalDayMode(d) === "Weekday",
        customDay: (d: Date) => !policies[format(d, "yyyy-MM-dd")]?.is_holiday && getLocalDayMode(d) === "Custom",
    }

    // Month Stats
    const getMonthStats = () => {
        const ms = startOfMonth(month)
        const me = new Date(month.getFullYear(), month.getMonth() + 1, 0)
        const days = eachDayOfInterval({ start: ms, end: me })
        let normal = 0, friday = 0, weekday = 0, holiday = 0, custom = 0, leaves = 0
        days.forEach(d => {
            const ds = format(d, "yyyy-MM-dd")
            if (policies[ds]?.is_holiday) holiday++
            else {
                const m = getLocalDayMode(d)
                if (m === "Normal") normal++
                else if (m === "Friday") friday++
                else if (m === "Weekday") weekday++
                else if (m === "Custom") custom++
            }
            if ((policies[ds]?.leave_standards?.length || 0) > 0) leaves++
        })
        return { normal, friday, weekday, holiday, custom, leaves, total: days.length }
    }
    const stats = getMonthStats()

    // Determine active sessions for current editing policy
    const getActiveSessions = () => {
        if (!editingPolicy) return sessions
        const allowedTypes = editingPolicy.allowed_session_types || []
        if (allowedTypes.length === 0) return sessions
        return sessions.filter(s => allowedTypes.includes(s.type))
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-emerald-900 dark:text-emerald-50">Academic Calendar</h1>
                    <p className="text-muted-foreground">Manage holidays, leaves, and class schedules.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={() => setModeEditorOpen(true)}
                        className="border-purple-500 text-purple-400 hover:bg-purple-950/30">
                        <Settings2 size={16} className="mr-2" /> Edit Mode Rules
                    </Button>
                    <Button variant="outline" onClick={() => setBulkDialogOpen(true)}
                        className="border-blue-500 text-blue-400 hover:bg-blue-950/30">
                        <CalendarRange size={16} className="mr-2" /> Bulk Change
                    </Button>
                    <Button onClick={generateYearSchedule} disabled={generating}
                        className="bg-emerald-600 hover:bg-emerald-700">
                        {generating ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Zap size={16} className="mr-2" />}
                        {generating ? "Generating..." : "Generate Year"}
                    </Button>
                </div>
            </div>

            {/* Month Stats */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {[
                    { label: "Total", value: stats.total, bg: "bg-slate-900/60", border: "border-slate-700", color: "text-white", sub: "text-slate-400" },
                    { label: "Normal", value: stats.normal, bg: "bg-emerald-950/40", border: "border-emerald-800", color: "text-emerald-400", sub: "text-emerald-500" },
                    { label: "Friday", value: stats.friday, bg: "bg-orange-950/40", border: "border-orange-800", color: "text-orange-400", sub: "text-orange-500" },
                    { label: "Weekday", value: stats.weekday, bg: "bg-purple-950/40", border: "border-purple-800", color: "text-purple-400", sub: "text-purple-500" },
                    { label: "Holiday", value: stats.holiday, bg: "bg-red-950/40", border: "border-red-800", color: "text-red-400", sub: "text-red-500" },
                    { label: "Custom", value: stats.custom, bg: "bg-blue-950/40", border: "border-blue-800", color: "text-blue-400", sub: "text-blue-500" },
                    { label: "Leaves", value: stats.leaves, bg: "bg-amber-950/40", border: "border-amber-800", color: "text-amber-400", sub: "text-amber-500" },
                ].map(s => (
                    <div key={s.label} className={`${s.bg} border ${s.border} rounded-lg p-2.5 text-center`}>
                        <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                        <div className={`text-[10px] ${s.sub}`}>{s.label}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                {/* Calendar Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>Calendar View</CardTitle>
                        <CardDescription>Click a date to edit its rules.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center p-6">
                        <Calendar
                            mode="single" selected={date}
                            onSelect={(d) => d && handleDayClick(d)}
                            month={month} onMonthChange={setMonth}
                            className="rounded-md border shadow w-fit"
                            modifiers={modifiers}
                            modifiersClassNames={{
                                holiday: "bg-red-200 text-red-900 font-bold rounded-md",
                                hasLeave: "ring-2 ring-amber-400 ring-inset rounded-md",
                                normalDay: "bg-emerald-100 text-emerald-900 rounded-md",
                                fridayDay: "bg-orange-100 text-orange-900 rounded-md",
                                weekdayMode: "bg-purple-100 text-purple-900 rounded-md",
                                customDay: "bg-blue-100 text-blue-900 font-bold rounded-md",
                            }}
                        />
                    </CardContent>
                    <div className="px-6 pb-4 flex flex-wrap gap-3 text-xs text-muted-foreground justify-center">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-100 rounded-full border border-emerald-300"></div> Normal</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-orange-100 rounded-full border border-orange-300"></div> Friday</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-purple-100 rounded-full border border-purple-300"></div> Weekday</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-100 rounded-full border border-blue-300"></div> Custom</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-200 rounded-full border border-red-300"></div> Holiday</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full border-2 border-amber-400"></div> Leave</div>
                    </div>
                </Card>

                {/* Schedule Rules */}
                <Card>
                    <CardHeader>
                        <CardTitle>Schedule Rules</CardTitle>
                        <CardDescription>Default class schedule for each day type</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="border border-emerald-800 rounded-lg p-3 bg-emerald-950/20">
                            <div className="font-semibold text-emerald-400 mb-1">🟢 Normal (Mon–Thu)</div>
                            <div className="text-xs text-slate-300 space-y-0.5">
                                <div>Hifz Class 1 → All | Class 2 → 6,8 | Class 3 → 5,7,9</div>
                                <div>School Morning → 5,7,9,10 | Noon → 6,8,10</div>
                            </div>
                        </div>
                        <div className="border border-orange-800 rounded-lg p-3 bg-orange-950/20">
                            <div className="font-semibold text-orange-400 mb-1">🟠 Friday (School Only)</div>
                            <div className="text-xs text-slate-300">School Morning → 5,7,9,10 | Noon → 6,8,10</div>
                        </div>
                        <div className="border border-purple-800 rounded-lg p-3 bg-purple-950/20">
                            <div className="font-semibold text-purple-400 mb-1">🟣 Weekday / Madrassa (Sat–Sun)</div>
                            <div className="text-xs text-slate-300 space-y-0.5">
                                <div>Hifz Class 1 → All | Class 2 → 6,8 | Class 3 → 5,7,9</div>
                                <div>Madrassa Shift 1 → 5,7,9 | Shift 2 → 6,8,10</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ============ DAY EDIT DIALOG ============ */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit: {date ? format(date, "EEEE, MMMM d, yyyy") : ""}</DialogTitle>
                        <DialogDescription>Configure classes, leaves, and cancellations.</DialogDescription>
                    </DialogHeader>

                    {editingPolicy && (
                        <div className="grid gap-5 py-3">
                            {/* 1. FULL HOLIDAY */}
                            <div className="flex items-center justify-between border p-4 rounded-md">
                                <div>
                                    <Label className="text-base">Full Holiday</Label>
                                    <div className="text-xs text-muted-foreground">All classes off for everyone.</div>
                                </div>
                                <Switch checked={editingPolicy.is_holiday}
                                    onCheckedChange={(c: boolean) => setEditingPolicy({ ...editingPolicy, is_holiday: c })} />
                            </div>

                            {editingPolicy.is_holiday && (
                                <div className="border border-red-800 rounded-md p-4 bg-red-950/10 grid gap-3">
                                    <Label className="text-red-400 font-semibold text-sm">Holiday Reason</Label>
                                    <div className="flex flex-wrap gap-3">
                                        {REASON_TYPES.map(r => (
                                            <label key={r} className="flex items-center gap-2 cursor-pointer">
                                                <input type="radio" name="holiday_reason" value={r}
                                                    checked={editingPolicy.cancellation_reason_type === r}
                                                    onChange={() => setEditingPolicy({ ...editingPolicy, cancellation_reason_type: r })}
                                                    className="accent-red-500" />
                                                <span className="text-sm">{r}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <Input placeholder="Details..." value={editingPolicy.cancellation_reason_text || ""}
                                        onChange={(e) => setEditingPolicy({ ...editingPolicy, cancellation_reason_text: e.target.value })} />
                                </div>
                            )}

                            {/* Description */}
                            <div className="grid gap-1.5">
                                <Label className="text-xs">Description / Note</Label>
                                <Input placeholder="e.g. Republic Day, Monthly leave..." value={editingPolicy.description || ""}
                                    onChange={(e) => setEditingPolicy({ ...editingPolicy, description: e.target.value })} />
                            </div>

                            {/* Only show rest if NOT full holiday */}
                            {!editingPolicy.is_holiday && (
                                <>
                                    {/* 2. STANDARD LEAVE */}
                                    <div className="border border-amber-800 rounded-md p-4 bg-amber-950/10 grid gap-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <Label className="text-amber-400 font-semibold text-sm">Standard Leave</Label>
                                                <div className="text-[10px] text-muted-foreground">Select standards that have leave (other standards continue normally)</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {ALL_STANDARDS.map(std => (
                                                <div key={std} onClick={() => toggleLeaveStandard(std)}
                                                    className={cn(
                                                        "cursor-pointer px-3 py-1.5 rounded-md text-xs border transition-all",
                                                        (editingPolicy.leave_standards || []).includes(std)
                                                            ? "bg-amber-500/20 border-amber-500 text-amber-300 font-bold"
                                                            : "bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400"
                                                    )}>
                                                    {std}
                                                </div>
                                            ))}
                                        </div>
                                        {(editingPolicy.leave_standards?.length || 0) > 0 && (
                                            <div className="grid gap-2 pt-1">
                                                <div className="flex flex-wrap gap-3">
                                                    {REASON_TYPES.map(r => (
                                                        <label key={r} className="flex items-center gap-2 cursor-pointer">
                                                            <input type="radio" name="leave_reason" value={r}
                                                                checked={editingPolicy.cancellation_reason_type === r}
                                                                onChange={() => setEditingPolicy({ ...editingPolicy, cancellation_reason_type: r })}
                                                                className="accent-amber-500" />
                                                            <span className="text-xs">{r}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                                <Input placeholder="Leave details..." value={editingPolicy.cancellation_reason_text || ""}
                                                    onChange={(e) => setEditingPolicy({ ...editingPolicy, cancellation_reason_text: e.target.value })}
                                                    className="text-sm" />
                                            </div>
                                        )}
                                    </div>

                                    {/* 3. DAY MODE */}
                                    <div className="grid gap-2">
                                        <Label>Day Mode</Label>
                                        <Select value={editingPolicy.day_mode || "Normal"}
                                            onValueChange={(v) => {
                                                const mode = v as any
                                                const overrides = applyModeRules(mode, sessions)
                                                let types: string[] | null = null
                                                if (mode === "Friday") types = ["School"]
                                                if (mode === "Weekday") types = ["Hifz", "Madrassa"]
                                                if (mode === "Normal") types = ["Hifz", "School"]
                                                setEditingPolicy({
                                                    ...editingPolicy, day_mode: mode,
                                                    session_overrides: mode === "Custom" ? (editingPolicy.session_overrides || {}) : overrides,
                                                    allowed_session_types: types
                                                })
                                            }}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Normal">Normal (Hifz + School)</SelectItem>
                                                <SelectItem value="Friday">Friday (School Only)</SelectItem>
                                                <SelectItem value="Weekday">Weekday (Hifz + Madrassa)</SelectItem>
                                                <SelectItem value="Custom">Custom Rules</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Custom type selection */}
                                    {editingPolicy.day_mode === "Custom" && (
                                        <div className="grid gap-2">
                                            <Label className="text-xs">Allowed Session Types</Label>
                                            <div className="flex gap-4">
                                                {["Hifz", "School", "Madrassa"].map(type => (
                                                    <div key={type} className="flex items-center space-x-2">
                                                        <Checkbox id={`type-${type}`}
                                                            checked={!editingPolicy.allowed_session_types || editingPolicy.allowed_session_types.length === 0 || editingPolicy.allowed_session_types.includes(type)}
                                                            onCheckedChange={(c: boolean) => {
                                                                const all = ["Hifz", "School", "Madrassa"]
                                                                const cur = editingPolicy.allowed_session_types || []
                                                                let next: string[]
                                                                if (cur.length === 0) { next = c ? [] : all.filter(t => t !== type) }
                                                                else { next = c ? [...cur, type] : cur.filter(t => t !== type); if (next.length === 3) next = [] }
                                                                setEditingPolicy({ ...editingPolicy, allowed_session_types: next })
                                                            }} />
                                                        <Label htmlFor={`type-${type}`} className="font-normal text-sm">{type}</Label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 4. SESSION STATUS — Per-session cancel/active */}
                                    <div className="grid gap-3 border-t pt-4">
                                        <Label className="font-semibold">Session Status</Label>
                                        <p className="text-[10px] text-muted-foreground -mt-2">Cancel individual sessions or configure standard overrides.</p>

                                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                            {getActiveSessions().map(session => {
                                                const isCancelled = !!editingPolicy.cancelled_sessions?.[session.id]
                                                const cancelInfo = editingPolicy.cancelled_sessions?.[session.id]
                                                const overrideStds = editingPolicy.session_overrides?.[session.id] || []

                                                return (
                                                    <div key={session.id} className={cn(
                                                        "border rounded-lg p-3 transition-all",
                                                        isCancelled ? "border-red-700 bg-red-950/20" : "border-slate-700 bg-slate-900/30"
                                                    )}>
                                                        {/* Session Header */}
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                {isCancelled
                                                                    ? <XCircle size={16} className="text-red-400" />
                                                                    : <CheckCircle2 size={16} className="text-emerald-400" />
                                                                }
                                                                <span className="font-medium text-sm">{session.name}</span>
                                                                <Badge variant="outline" className="text-[10px]">{session.type}</Badge>
                                                            </div>
                                                            <Button
                                                                size="sm" variant={isCancelled ? "destructive" : "outline"}
                                                                className="h-7 text-xs"
                                                                onClick={() => toggleSessionCancel(session.id)}>
                                                                {isCancelled ? "Cancelled" : "Active"}
                                                            </Button>
                                                        </div>

                                                        {/* Cancel Reason */}
                                                        {isCancelled && cancelInfo && (
                                                            <div className="grid gap-2 pl-6 pt-1">
                                                                <div className="flex flex-wrap gap-2">
                                                                    {REASON_TYPES.map(r => (
                                                                        <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                                                                            <input type="radio" name={`cancel-${session.id}`} value={r}
                                                                                checked={cancelInfo.reason_type === r}
                                                                                onChange={() => updateSessionCancelReason(session.id, "reason_type", r)}
                                                                                className="accent-red-500 w-3 h-3" />
                                                                            <span className="text-[11px]">{r}</span>
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                                <Input placeholder="Reason details..."
                                                                    value={cancelInfo.reason_text}
                                                                    onChange={(e) => updateSessionCancelReason(session.id, "reason_text", e.target.value)}
                                                                    className="h-7 text-xs" />
                                                            </div>
                                                        )}

                                                        {/* Standard Overrides (when active) */}
                                                        {!isCancelled && (
                                                            <div className="flex flex-wrap gap-1 pl-6">
                                                                {ALL_STANDARDS.map(std => {
                                                                    const isOn = overrideStds.includes(std)
                                                                    return (
                                                                        <div key={std} onClick={() => {
                                                                            const co = editingPolicy.session_overrides || {}
                                                                            const so = co[session.id] || []
                                                                            const next = so.includes(std) ? so.filter(s => s !== std) : [...so, std]
                                                                            setEditingPolicy({
                                                                                ...editingPolicy,
                                                                                session_overrides: { ...co, [session.id]: next }
                                                                            })
                                                                        }}
                                                                            className={cn(
                                                                                "cursor-pointer px-1.5 py-0.5 rounded text-[10px] border transition-colors",
                                                                                isOn
                                                                                    ? "bg-blue-100 border-blue-300 text-blue-800 font-bold"
                                                                                    : "bg-slate-800 border-slate-600 text-slate-500 hover:border-slate-400"
                                                                            )}>
                                                                            {std}
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <DialogFooter className="gap-2">
                        <Button variant="destructive" onClick={deletePolicy}>Reset</Button>
                        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={savePolicy}>Save Rules</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ============ BULK CHANGE DIALOG ============ */}
            <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Bulk Schedule Change</DialogTitle>
                        <DialogDescription>Apply changes to a range of dates. Existing rules will be overwritten.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label className="text-xs">Start Date</Label>
                                <Input type="date" value={bulkStartDate} onChange={(e) => setBulkStartDate(e.target.value)} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-xs">End Date <span className="text-muted-foreground">(empty = year end)</span></Label>
                                <Input type="date" value={bulkEndDate} onChange={(e) => setBulkEndDate(e.target.value)} />
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label className="text-xs">Apply Mode</Label>
                            <Select value={bulkMode} onValueChange={setBulkMode}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Holiday">Holiday / No Class (All Off)</SelectItem>
                                    <SelectItem value="Leave">Standard Leave (Specific Standards Off)</SelectItem>
                                    <SelectItem value="Normal">Normal (Hifz + School)</SelectItem>
                                    <SelectItem value="Friday">Friday (School Only)</SelectItem>
                                    <SelectItem value="Weekday">Weekday (Hifz + Madrassa)</SelectItem>
                                    <SelectItem value="Custom">Custom</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Leave standards selection */}
                        {bulkMode === "Leave" && (
                            <div className="border border-amber-800 rounded-md p-3 bg-amber-950/10 grid gap-2">
                                <Label className="text-amber-400 text-xs font-semibold">Standards on Leave</Label>
                                <div className="flex flex-wrap gap-2">
                                    {ALL_STANDARDS.map(std => (
                                        <div key={std} onClick={() => {
                                            setBulkLeaveStandards(prev =>
                                                prev.includes(std) ? prev.filter(s => s !== std) : [...prev, std]
                                            )
                                        }}
                                            className={cn("cursor-pointer px-3 py-1 rounded text-xs border transition-all",
                                                bulkLeaveStandards.includes(std)
                                                    ? "bg-amber-500/20 border-amber-500 text-amber-300 font-bold"
                                                    : "bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400"
                                            )}>
                                            {std}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Reason (for Holiday and Leave) */}
                        {(bulkMode === "Holiday" || bulkMode === "Leave") && (
                            <div className="border border-red-800 rounded-md p-3 bg-red-950/10 grid gap-2">
                                <Label className="text-red-400 text-xs font-semibold">Reason</Label>
                                <div className="flex flex-wrap gap-3">
                                    {REASON_TYPES.map(r => (
                                        <label key={r} className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" name="bulk_reason" value={r}
                                                checked={bulkReason === r} onChange={() => setBulkReason(r)}
                                                className="accent-red-500" />
                                            <span className="text-xs">{r}</span>
                                        </label>
                                    ))}
                                </div>
                                <Input placeholder="Details..." value={bulkReasonText}
                                    onChange={(e) => setBulkReasonText(e.target.value)} className="text-sm" />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
                        <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleBulkSave} disabled={bulkSaving}>
                            {bulkSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <CalendarRange size={16} className="mr-2" />}
                            {bulkSaving ? "Applying..." : "Apply Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ============ MODE EDITOR DIALOG ============ */}
            <Dialog open={modeEditorOpen} onOpenChange={setModeEditorOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Mode Rules</DialogTitle>
                        <DialogDescription>Change mode rules from a specific date. Earlier dates keep old rules.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-3">
                        <div className="grid gap-1.5">
                            <Label className="text-xs">Mode to Update</Label>
                            <Select value={modeEditTarget} onValueChange={(v) => setModeEditTarget(v as any)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Normal">Normal (Mon–Thu)</SelectItem>
                                    <SelectItem value="Friday">Friday</SelectItem>
                                    <SelectItem value="Weekday">Weekday (Sat–Sun)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label className="text-xs">Effective From</Label>
                            <Input type="date" value={modeEffectiveDate} onChange={(e) => setModeEffectiveDate(e.target.value)} />
                            <p className="text-[10px] text-muted-foreground">Rules will apply from this date to end of academic year. Days before this date remain unchanged.</p>
                        </div>
                        <div className="border rounded-md p-3 bg-slate-900/30">
                            <Label className="text-xs text-muted-foreground mb-2 block">Preview: Sessions that will be active</Label>
                            <div className="space-y-1">
                                {sessions.filter(s => getAllowedTypesForMode(modeEditTarget).includes(s.type)).map(s => {
                                    const overrides = applyModeRules(modeEditTarget, sessions)
                                    const stds = overrides[s.id] || []
                                    return (
                                        <div key={s.id} className="flex items-center justify-between text-xs">
                                            <span>{s.name} ({s.type})</span>
                                            <span className="text-muted-foreground">{stds.length > 0 ? stds.join(", ") : "All"}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setModeEditorOpen(false)}>Cancel</Button>
                        <Button className="bg-purple-600 hover:bg-purple-700" onClick={applyModeFromDate} disabled={modeSaving}>
                            {modeSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Settings2 size={16} className="mr-2" />}
                            {modeSaving ? "Applying..." : "Apply from Date"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
