"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarClock, CheckCircle2, Loader2, Lock, Save, ShieldCheck, Unlock } from "lucide-react"

import api from "@/lib/api"
import { invalidateCache } from "@/lib/api-cache"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type AccessFeature = "attendance" | "hifz_recording"

type AccessPolicy = {
    feature: AccessFeature
    default_window_days: number
    default_start_date: string
    today: string
    unlock_start_date: string | null
    unlock_end_date: string | null
    unlock_is_active: boolean
    note?: string
}

const FEATURE_META: Record<AccessFeature, { title: string; description: string; accent: string }> = {
    attendance: {
        title: "Attendance Marking",
        description: "Controls how far back mentors can mark or edit attendance.",
        accent: "blue",
    },
    hifz_recording: {
        title: "Hifz Recording",
        description: "Controls how far back mentors can add, update, or delete Hifz progress.",
        accent: "emerald",
    },
}

const PRESETS = [
    { label: "Unlock 2 weeks", days: 14 },
    { label: "Unlock 1 month", days: 30 },
    { label: "Unlock 2 months", days: 60 },
]

function formatDate(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function rangeForDays(days: number) {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - (days - 1))
    return { start: formatDate(start), end: formatDate(end) }
}

function isUnlocked(policy: AccessPolicy) {
    return !!policy.unlock_start_date && !!policy.unlock_end_date && policy.unlock_is_active
}

export default function MentorAccessPage() {
    const [policies, setPolicies] = useState<AccessPolicy[]>([])
    const [drafts, setDrafts] = useState<Record<string, { start: string; end: string; note: string }>>({})
    const [loading, setLoading] = useState(true)
    const [savingFeature, setSavingFeature] = useState<string | null>(null)

    async function loadPolicies() {
        setLoading(true)
        try {
            const res = await api.get("/access-control/mentor-policies")
            const nextPolicies = res.data?.policies || []
            setPolicies(nextPolicies)
            const nextDrafts: Record<string, { start: string; end: string; note: string }> = {}
            nextPolicies.forEach((policy: AccessPolicy) => {
                nextDrafts[policy.feature] = {
                    start: policy.unlock_start_date || "",
                    end: policy.unlock_end_date || "",
                    note: policy.note || "",
                }
            })
            setDrafts(nextDrafts)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadPolicies()
    }, [])

    async function savePolicy(feature: AccessFeature, start: string | null, end: string | null, note?: string) {
        setSavingFeature(feature)
        try {
            const res = await api.post("/access-control/mentor-policies", {
                feature,
                default_window_days: 7,
                unlock_start_date: start,
                unlock_end_date: end,
                note: note || null,
            })
            if (!res.data?.success) throw new Error(res.data?.error || "Failed to save")

            invalidateCache("/access-control/mentor-policies")
            invalidateCache("/attendance")
            await loadPolicies()
        } catch (error: any) {
            alert(error?.response?.data?.error || error.message || "Failed to save access policy")
        } finally {
            setSavingFeature(null)
        }
    }

    function updateDraft(feature: AccessFeature, patch: Partial<{ start: string; end: string; note: string }>) {
        setDrafts(prev => ({
            ...prev,
            [feature]: { ...({ start: "", end: "", note: "" }), ...(prev[feature] || {}), ...patch },
        }))
    }

    if (loading) {
        return (
            <div className="flex min-h-[420px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-6xl space-y-6 pb-12">
            <div className="flex flex-col gap-4 rounded-3xl bg-slate-950 p-6 text-white shadow-sm md:flex-row md:items-center md:justify-between">
                <div>
                    <Link href="/admin" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
                        <ArrowLeft className="h-4 w-4" />
                        Back to dashboard
                    </Link>
                    <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight">
                        <ShieldCheck className="h-8 w-8 text-emerald-300" />
                        Mentor Access Locks
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-300">
                        Keep mentors locked to the last 7 days by default, then safely open a controlled date range when older attendance or Hifz records need correction.
                    </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm">
                    <p className="font-bold text-white">Default locked window</p>
                    <p className="text-slate-300">Last 7 days only</p>
                </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
                {policies.map(policy => {
                    const meta = FEATURE_META[policy.feature]
                    const draft = drafts[policy.feature] || { start: "", end: "", note: "" }
                    const active = isUnlocked(policy)
                    const saving = savingFeature === policy.feature

                    return (
                        <Card key={policy.feature} className="overflow-hidden border-none bg-white shadow-sm dark:bg-slate-900">
                            <CardHeader className={cn(
                                "border-b",
                                meta.accent === "blue" ? "bg-blue-50/70 dark:bg-blue-950/20" : "bg-emerald-50/70 dark:bg-emerald-950/20"
                            )}>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <CardTitle className="flex items-center gap-2 text-xl">
                                            {active ? <Unlock className="h-5 w-5 text-emerald-600" /> : <Lock className="h-5 w-5 text-slate-500" />}
                                            {meta.title}
                                        </CardTitle>
                                        <p className="mt-1 text-sm text-slate-500">{meta.description}</p>
                                    </div>
                                    <Badge className={active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-100"}>
                                        {active ? "Unlocked range active" : "Locked"}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-5 p-5">
                                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950/40">
                                    <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                                        <CalendarClock className="h-4 w-4 text-slate-500" />
                                        Current rule
                                    </div>
                                    <p className="text-slate-600 dark:text-slate-300">
                                        Mentors can always edit from <strong>{policy.default_start_date}</strong> to <strong>{policy.today}</strong>.
                                    </p>
                                    {policy.unlock_start_date && policy.unlock_end_date ? (
                                        <p className="text-emerald-700 dark:text-emerald-300">
                                            Extra unlocked range: <strong>{policy.unlock_start_date}</strong> to <strong>{policy.unlock_end_date}</strong>.
                                        </p>
                                    ) : (
                                        <p className="text-slate-500">No extra unlocked range is active.</p>
                                    )}
                                </div>

                                <div className="grid gap-2 sm:grid-cols-3">
                                    {PRESETS.map(preset => (
                                        <Button
                                            key={preset.days}
                                            type="button"
                                            variant="outline"
                                            disabled={saving}
                                            onClick={() => {
                                                const range = rangeForDays(preset.days)
                                                updateDraft(policy.feature, {
                                                    start: range.start,
                                                    end: range.end,
                                                    note: preset.label,
                                                })
                                                savePolicy(policy.feature, range.start, range.end, preset.label)
                                            }}
                                            className="justify-start"
                                        >
                                            {preset.label}
                                        </Button>
                                    ))}
                                </div>

                                <div className="grid gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-slate-500">Unlock from</Label>
                                            <Input type="date" value={draft.start} onChange={e => updateDraft(policy.feature, { start: e.target.value })} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-slate-500">Unlock until</Label>
                                            <Input type="date" value={draft.end} onChange={e => updateDraft(policy.feature, { end: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-slate-500">Reason / note</Label>
                                        <Input
                                            placeholder="Example: April correction window"
                                            value={draft.note}
                                            onChange={e => updateDraft(policy.feature, { note: e.target.value })}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={saving}
                                            onClick={() => savePolicy(policy.feature, null, null, "")}
                                            className="gap-2"
                                        >
                                            <Lock className="h-4 w-4" />
                                            Lock to 7 days
                                        </Button>
                                        <Button
                                            type="button"
                                            disabled={saving || !draft.start || !draft.end}
                                            onClick={() => savePolicy(policy.feature, draft.start, draft.end, draft.note)}
                                            className="gap-2 bg-slate-900 text-white hover:bg-slate-800"
                                        >
                                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                            Apply Custom Range
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                                    This only controls mentor editing access. Admins can still manage and correct data normally.
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
