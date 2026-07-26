"use client"

import Link from "next/link"
import { AlertTriangle, CheckCircle2, CircleDot, Clock3, LucideIcon, ShieldAlert } from "lucide-react"
import { ThreeBallLoader } from "@/components/ui/three-ball-loader"

export type Incident = {
    id: string
    reference_no: string
    student_id: string
    student_name: string
    photo_url?: string | null
    status: string
    severity: string
    discipline_marks: number
    reported_at: string
    category_name: string
    offence_name: string
    reporter_name?: string | null
    repeat_offence?: boolean
    parent_notification_status?: string
}

export const STATUS_LABELS: Record<string, string> = {
    draft: "Draft",
    submitted: "Submitted",
    under_review: "Under review",
    waiting_student_explanation: "Waiting for explanation",
    action_assigned: "Action assigned",
    follow_up_pending: "Follow-up pending",
    completed: "Completed",
    cancelled: "Cancelled",
}

export function formatDisciplineDate(value?: string | null, includeTime = false) {
    if (!value) return "-"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "-"
    return date.toLocaleDateString("en-IN", includeTime
        ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "short", year: "numeric" })
}

export function SeverityBadge({ severity }: { severity: string }) {
    const styles: Record<string, string> = {
        minor: "border-sky-200 bg-sky-50 text-sky-700",
        moderate: "border-amber-200 bg-amber-50 text-amber-700",
        major: "border-orange-200 bg-orange-50 text-orange-700",
        critical: "border-red-200 bg-red-50 text-red-700",
    }
    return <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold capitalize ${styles[severity] || styles.minor}`}>{severity}</span>
}

export function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        draft: "border-slate-200 bg-slate-50 text-slate-600",
        submitted: "border-blue-200 bg-blue-50 text-blue-700",
        under_review: "border-violet-200 bg-violet-50 text-violet-700",
        waiting_student_explanation: "border-amber-200 bg-amber-50 text-amber-700",
        action_assigned: "border-cyan-200 bg-cyan-50 text-cyan-700",
        follow_up_pending: "border-orange-200 bg-orange-50 text-orange-700",
        completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
        cancelled: "border-slate-200 bg-slate-100 text-slate-500",
    }
    return <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${styles[status] || styles.draft}`}>{STATUS_LABELS[status] || status}</span>
}

export function RiskBadge({ level }: { level: string }) {
    const danger = level === "Critical Review" || level === "High Risk"
    const warning = level === "Warning" || level === "Needs Attention"
    return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${danger ? "bg-red-50 text-red-700" : warning ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{level}</span>
}

export function DisciplineMetric({ label, value, icon: Icon, tone = "blue", href }: { label: string; value: number | string; icon: LucideIcon; tone?: "blue" | "amber" | "red" | "emerald" | "violet"; href?: string }) {
    const colors = {
        blue: "bg-blue-50 text-blue-700 border-blue-100",
        amber: "bg-amber-50 text-amber-700 border-amber-100",
        red: "bg-red-50 text-red-700 border-red-100",
        emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
        violet: "bg-violet-50 text-violet-700 border-violet-100",
    }
    const content = <div className={`h-full rounded-lg border p-4 ${colors[tone]}`}><div className="mb-4 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide opacity-75">{label}</p><Icon className="h-5 w-5" /></div><p className="text-3xl font-bold text-slate-950">{value}</p></div>
    return href ? <Link href={href} className="block h-full transition-transform hover:-translate-y-0.5">{content}</Link> : content
}

export function DisciplineLoading({ label = "Loading discipline records" }: { label?: string }) {
    return <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm text-slate-500"><ThreeBallLoader label="" /><span>{label}</span></div>
}

export function DisciplineEmpty({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
    return <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500"><ShieldAlert className="h-5 w-5" /></div><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>{action && <div className="mt-5">{action}</div>}</div>
}

export function WorkflowStrip({ status }: { status: string }) {
    const stages = [
        { key: "submitted", label: "Reported", icon: CircleDot },
        { key: "under_review", label: "Review", icon: AlertTriangle },
        { key: "action_assigned", label: "Corrective action", icon: Clock3 },
        { key: "completed", label: "Resolved", icon: CheckCircle2 },
    ]
    const order = ["draft", "submitted", "waiting_student_explanation", "under_review", "action_assigned", "follow_up_pending", "completed"]
    const current = order.indexOf(status)
    return <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{stages.map(stage => { const active = current >= order.indexOf(stage.key); const Icon = stage.icon; return <div key={stage.key} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-400"}`}><Icon className="h-4 w-4" />{stage.label}</div> })}</div>
}