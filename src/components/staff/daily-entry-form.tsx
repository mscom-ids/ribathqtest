"use client"

import { useEffect, useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format, subDays, isBefore } from "date-fns"
import { Loader2, Save, ArrowLeft, PlusCircle, Trash2 } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import api from "@/lib/api"
import { SURAH_LIST } from "@/lib/data/surah-list"
type Surah = { id: number; name: string; totalVerses: number };
const typedSurahList = SURAH_LIST as Surah[];

// Helper: preprocess empty/falsy values to undefined so .optional() works with z.coerce
const optionalNum = z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : val),
    z.coerce.number().optional()
)
const optionalNumMin1 = z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : val),
    z.coerce.number().min(1).optional()
)

// Schema
const formSchema = z.object({
    date: z.string(), // YYYY-MM-DD
    session: z.enum(["Subh", "Breakfast", "Lunch"]),

    mode: z.enum(["New Verses", "Recent Revision", "Juz Revision", "Juz Revision (New)", "Juz Revision (Old)"]),

    // New Verses - Array of entries
    new_verses: z.array(z.object({
        surah_id: optionalNumMin1,
        start_v: optionalNum,
        end_v: optionalNum,
    })),

    // Recent Revision (Pages)
    start_page: optionalNumMin1,
    end_page: optionalNumMin1,
    // Juz Revision
    juz_number: optionalNumMin1,
    juz_portion: z.preprocess(
        (val) => (val === "" || val === undefined || val === null ? undefined : val),
        z.enum(["Full", "1st Half", "2nd Half", "Q1", "Q2", "Q3", "Q4"]).optional()
    ),
    // Common
}).superRefine((data, ctx) => {
    if (data.mode === "New Verses" || data.mode === "Recent Revision") {
        data.new_verses.forEach((entry, index) => {
            if (!entry.surah_id) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Surah is required", path: ["new_verses", index, "surah_id"] })
            } else {
                const surah = typedSurahList.find(s => s.id === entry.surah_id);
                if (surah && surah.totalVerses) {
                    if (entry.start_v && (entry.start_v < 1 || entry.start_v > surah.totalVerses)) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Must be 1-${surah.totalVerses}`, path: ["new_verses", index, "start_v"] })
                    }
                    if (entry.end_v && (entry.end_v < 1 || entry.end_v > surah.totalVerses)) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Must be 1-${surah.totalVerses}`, path: ["new_verses", index, "end_v"] })
                    }
                    if (entry.start_v && entry.end_v && entry.start_v > entry.end_v) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "End verse must be >= start verse", path: ["new_verses", index, "end_v"] })
                    }
                }
            }
            if (!entry.end_v) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required", path: ["new_verses", index, "end_v"] })
        })

    } else if (data.mode?.startsWith("Juz Revision")) {
        if (!data.juz_number) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Juz is required", path: ["juz_number"] })
        if (!data.juz_portion) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Portion is required", path: ["juz_portion"] })
    }
})

type FormValues = z.infer<typeof formSchema>

export default function DailyEntryForm({ studentId }: { studentId: string }) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const returnTo = searchParams.get("returnTo")
    const [loading, setLoading] = useState(false)
    const [logId, setLogId] = useState<string | null>(null)
    const [student, setStudent] = useState<{ adm_no: string; name: string } | null>(null)
    const [assignedUsthadId, setAssignedUsthadId] = useState<string | null>(null)
    const [isOutside, setIsOutside] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [isHafiz, setIsHafiz] = useState(false)

    // ── Range Entry mode state ──────────────────────────────────────────────
    const [entryMode, setEntryMode] = useState<'daily' | 'range'>('daily')
    type RangeEntry = { fromSurah: number | undefined; fromAyah: number | undefined; toSurah: number | undefined; toAyah: number | undefined }
    const [ranges, setRanges] = useState<RangeEntry[]>([{ fromSurah: undefined, fromAyah: undefined, toSurah: undefined, toAyah: undefined }])
    const [rangeDate, setRangeDate] = useState(format(new Date(), 'yyyy-MM-dd'))
    const [rangeSaving, setRangeSaving] = useState(false)
    const [rangeError, setRangeError] = useState<string | null>(null)
    const [rangeSuccess, setRangeSuccess] = useState(false)

    const today = new Date()
    const minDate = subDays(today, 7)

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            date: searchParams.get("date") || format(today, "yyyy-MM-dd"),
            session: "Subh",
            mode: "New Verses",
            new_verses: [{ surah_id: undefined, start_v: undefined, end_v: undefined }],
        },
    })

    // Field array for multiple surahs
    const { fields: versesFields, append: appendVerse, remove: removeVerse, replace: replaceVerses } = useFieldArray({
        control: form.control,
        name: "new_verses"
    });

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        async function loadData() {
            // Load student info
            try {
                const sRes = await api.get(`/students/${studentId}`)
                if (sRes.data.success) {
                    setStudent(sRes.data.student)
                    setAssignedUsthadId(sRes.data.student.assigned_usthad_id)
                    setIsOutside(!!sRes.data.student.is_outside)
                }
            } catch (e) { console.error(e) }

            const logIdParam = searchParams.get("log_id")
            let existingLog = null
            let isStudentHafiz = false

            try {
                const progRes = await api.get('/hifz/progress-summary', { params: { student_id: studentId } })
                isStudentHafiz = progRes.data?.data?.summary?.isHafiz ?? false
                setIsHafiz(isStudentHafiz)
                
                if (isStudentHafiz && form.getValues("mode") === "New Verses") {
                    form.setValue("mode", "Juz Revision (New)")
                }
            } catch (error) { console.error(error) }

            try {
                if (logIdParam) {
                    const res = await api.get(`/hifz/logs/${logIdParam}`)
                    if (res.data.success) existingLog = res.data.log
                } else {
                    const date = form.getValues("date")
                    const session = form.getValues("session")
                    const mode = form.getValues("mode")

                    const res = await api.get('/hifz/logs', {
                        params: { student_id: studentId, date: date, session_type: session, mode, limit: 1 }
                    })
                    if (res.data.success && res.data.logs?.length > 0) existingLog = res.data.logs[0]
                }
            } catch (e) { console.error(e) }

            if (existingLog) {
                setLogId(existingLog.id)
                let surahId = undefined;
                if (existingLog.surah_name) {
                    const matched = SURAH_LIST.find(s => s.name === existingLog.surah_name);
                    surahId = matched?.id;
                }

                form.reset({
                    date: existingLog.entry_date ? format(new Date(existingLog.entry_date), 'yyyy-MM-dd') : format(today, 'yyyy-MM-dd'),
                    session: existingLog.session_type as any,
                    mode: existingLog.mode as any,
                    new_verses: [{
                        surah_id: surahId,
                        start_v: existingLog.start_v || undefined,
                        end_v: existingLog.end_v || undefined
                    }],
                    start_page: existingLog.start_page,
                    end_page: existingLog.end_page,
                    juz_number: existingLog.juz_number,
                    juz_portion: existingLog.juz_portion as any
                })
            } else {
                if (!logIdParam) {
                    setLogId(null)
                    form.reset({
                        date: watchedDate || format(today, 'yyyy-MM-dd'),
                        session: watchedSession || "Subh",
                        mode: watchedMode || "New Verses",
                        new_verses: [{ surah_id: "" as any, start_v: "" as any, end_v: "" as any }],
                        juz_number: "" as any,
                        juz_portion: "" as any
                    })
                }
            }
        }
        loadData()
    }, [studentId, form, searchParams])

    // Re-fetch when date/session/mode change (track via separate effect)
    const watchedDate = form.watch("date")
    const watchedSession = form.watch("session")
    const watchedMode = form.watch("mode")

    useEffect(() => {
        if (!mounted) return
        async function reloadLog() {
            const logIdParam = searchParams.get("log_id")
            if (logIdParam) return

            try {
                const res = await api.get('/hifz/logs', {
                    params: { student_id: studentId, date: watchedDate, session_type: watchedSession, mode: watchedMode, limit: 1 }
                })
                const data = res.data.success && res.data.logs?.length > 0 ? res.data.logs[0] : null

                if (data) {
                    setLogId(data.id)
                    let surahId = undefined;
                    if (data.surah_name) {
                        const matched = SURAH_LIST.find(s => s.name === data.surah_name);
                        surahId = matched?.id;
                    }
                    form.reset({
                        date: data.entry_date ? format(new Date(data.entry_date), 'yyyy-MM-dd') : watchedDate,
                        session: data.session_type as any,
                        mode: data.mode as any,
                        new_verses: [{ surah_id: surahId, start_v: data.start_v || undefined, end_v: data.end_v || undefined }],
                        start_page: data.start_page,
                        end_page: data.end_page,
                        juz_number: data.juz_number,
                        juz_portion: data.juz_portion as any
                    })
                } else {
                    setLogId(null)
                    form.reset({
                        date: watchedDate,
                        session: watchedSession,
                        mode: watchedMode,
                        new_verses: [{ surah_id: "" as any, start_v: "" as any, end_v: "" as any }],
                        juz_number: "" as any,
                        juz_portion: "" as any
                    })
                }
            } catch (e) { console.error(e) }
        }
        reloadLog()
    }, [watchedDate, watchedSession, watchedMode])

    const onSubmit = async (values: FormValues) => {
        setLoading(true)

        // Get my staff profile to know usthad_id
        let targetUsthadId = null
        try {
            const profileRes = await api.get('/staff/me')
            if (profileRes.data.success) {
                const staff = profileRes.data.staff
                targetUsthadId = staff.id
                // Admins use the student's assigned usthad instead
                if (['admin', 'principal', 'vice_principal'].includes(staff.role || '') && assignedUsthadId) {
                    targetUsthadId = assignedUsthadId
                }
            }
        } catch (e) { console.error('Could not get staff profile:', e) }

        const commonData = {
            student_id: studentId,
            usthad_id: targetUsthadId,
            entry_date: values.date,
            session_type: values.session,
            mode: values.mode
        }

        try {
            if (values.mode === "New Verses" || values.mode === "Recent Revision") {
                const recordsToInsert = values.new_verses.map(v => ({
                    ...commonData,
                    surah_name: SURAH_LIST.find(s => s.id === v.surah_id)?.name || null,
                    start_v: v.start_v,
                    end_v: v.end_v,
                    start_page: null, end_page: null, juz_number: null, juz_portion: null
                }))

                if (logId) {
                    await api.put(`/hifz/logs/${logId}`, recordsToInsert[0])
                    if (recordsToInsert.length > 1) {
                        await api.post('/hifz/logs/bulk', { logs: recordsToInsert.slice(1) })
                    }
                } else {
                    await api.post('/hifz/logs/bulk', { logs: recordsToInsert })
                }
            } else {
                const singleData = {
                    ...commonData,
                    surah_name: null, start_v: null, end_v: null,
                    start_page: null,
                    end_page: null,
                    juz_number: values.juz_number,
                    juz_portion: values.juz_portion,
                }
                if (logId) {
                    await api.put(`/hifz/logs/${logId}`, singleData)
                } else {
                    await api.post('/hifz/logs', singleData)
                }
            }

            if (returnTo) {
                router.push(returnTo)
            } else {
                alert("Saved successfully!")
                form.reset({
                    date: form.getValues("date"),
                    session: form.getValues("session"),
                    mode: form.getValues("mode"),
                    new_verses: [{ surah_id: "" as any, start_v: "" as any, end_v: "" as any }],
                    juz_number: "" as any,
                    juz_portion: "" as any
                })
            }
        } catch (err: any) {
            alert(`Failed to save log: ${err?.response?.data?.error || err.message}`)
        }
        setLoading(false)
    }

    const handleDelete = async () => {
        if (!logId) return
        if (!confirm("Are you sure you want to delete this specific entry?")) return

        setLoading(true)
        try {
            await api.delete(`/hifz/logs/${logId}`)
            alert("Entry deleted.")
            if (returnTo) {
                router.push(returnTo)
            } else {
                setLogId(null)
            }
        } catch (err: any) {
            alert("Error deleting: " + err?.response?.data?.error || err.message)
        }
        setLoading(false)
    }

    // ── Range Entry helpers ───────────────────────────────────────────────────
    function expandRangeToLogs(fromSurahId: number, fromAyah: number, toSurahId: number, toAyah: number) {
        const records: { surah_name: string; start_v: number; end_v: number }[] = []
        for (let sid = fromSurahId; sid <= toSurahId; sid++) {
            const surah = typedSurahList.find(s => s.id === sid)
            if (!surah) continue
            const startV = sid === fromSurahId ? fromAyah : 1
            const endV = sid === toSurahId ? toAyah : surah.totalVerses
            records.push({ surah_name: surah.name, start_v: startV, end_v: endV })
        }
        return records
    }

    function rangePreview(r: RangeEntry): string {
        if (!r.fromSurah || !r.toSurah) return '—'
        const from = typedSurahList.find(s => s.id === r.fromSurah)
        const to = typedSurahList.find(s => s.id === r.toSurah)
        const surahCount = (r.toSurah ?? 0) - (r.fromSurah ?? 0) + 1
        return `${from?.name ?? ''} ${r.fromAyah ?? '?'} → ${to?.name ?? ''} ${r.toAyah ?? '?'} · ${surahCount} surah(s)`
    }

    async function handleRangeSave() {
        setRangeError(null)
        setRangeSuccess(false)
        // Validate
        for (let i = 0; i < ranges.length; i++) {
            const r = ranges[i]
            if (!r.fromSurah || !r.fromAyah || !r.toSurah || !r.toAyah) {
                setRangeError(`Range ${i + 1}: all fields are required`)
                return
            }
            const toSurahData = typedSurahList.find(s => s.id === r.toSurah)
            if (r.fromSurah > r.toSurah) {
                setRangeError(`Range ${i + 1}: Start surah must be before end surah`)
                return
            }
            if (r.fromSurah === r.toSurah && (r.fromAyah ?? 0) > (r.toAyah ?? 0)) {
                setRangeError(`Range ${i + 1}: Start ayah must be ≤ end ayah`)
                return
            }
            if (toSurahData && (r.toAyah ?? 0) > toSurahData.totalVerses) {
                setRangeError(`Range ${i + 1}: End ayah exceeds total verses of ${toSurahData.name} (${toSurahData.totalVerses})`)
                return
            }
        }
        setRangeSaving(true)
        try {
            let targetUsthadId = null
            const profileRes = await api.get('/staff/me')
            if (profileRes.data.success) {
                const staff = profileRes.data.staff
                targetUsthadId = staff.id
                if (['admin', 'principal', 'vice_principal'].includes(staff.role || '') && assignedUsthadId) {
                    targetUsthadId = assignedUsthadId
                }
            }

            const allLogs: any[] = []
            for (const r of ranges) {
                const expanded = expandRangeToLogs(r.fromSurah!, r.fromAyah!, r.toSurah!, r.toAyah!)
                for (const rec of expanded) {
                    allLogs.push({
                        student_id: studentId,
                        usthad_id: targetUsthadId,
                        entry_date: rangeDate,
                        session_type: 'Subh',
                        mode: 'New Verses',
                        surah_name: rec.surah_name,
                        start_v: rec.start_v,
                        end_v: rec.end_v,
                        start_page: null, end_page: null, juz_number: null, juz_portion: null
                    })
                }
            }
            await api.post('/hifz/logs/bulk', { logs: allLogs })
            setRangeSuccess(true)
            setRanges([{ fromSurah: undefined, fromAyah: undefined, toSurah: undefined, toAyah: undefined }])
            setTimeout(() => setRangeSuccess(false), 3000)
        } catch (err: any) {
            setRangeError(err?.response?.data?.error || err.message || 'Save failed')
        }
        setRangeSaving(false)
    }

    const isOldDate = isBefore(new Date(form.watch("date")), minDate)

    if (!mounted) return <div className="p-4 max-w-lg mx-auto flex justify-center items-center h-40"><Loader2 className="animate-spin text-emerald-500" /></div>

    // Block recording for outside students
    if (isOutside) {
        return (
            <div className="p-4 max-w-lg mx-auto pb-20">
                <div className="flex items-center mb-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8">
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <h1 className="ml-2 text-lg font-bold text-slate-800 dark:text-slate-100">{student?.name || "Student"}</h1>
                </div>
                <div className="rounded-xl border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-950/20 p-6 text-center space-y-3">
                    <div className="text-4xl">🚫</div>
                    <h2 className="font-bold text-orange-700 dark:text-orange-400 text-base">Student is Currently Outside</h2>
                    <p className="text-sm text-orange-600 dark:text-orange-500">
                        Hifz records cannot be added for students who are outside the institution.
                        Please wait until the student returns.
                    </p>
                    <Button variant="outline" onClick={() => router.back()} className="mt-2 border-orange-300 text-orange-700 hover:bg-orange-100">
                        Go Back
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="p-4 max-w-lg mx-auto pb-20">
            <div className="flex items-center mb-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8">
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <h1 className="ml-2 text-lg font-bold text-slate-800 dark:text-slate-100">{student?.name || "Loading..."}</h1>
            </div>

            {/* ── Mode Toggle ───────────────────────────────────────────── */}
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-full mb-3">
                <button
                    type="button"
                    onClick={() => setEntryMode('daily')}
                    className={`flex-1 py-1.5 px-4 rounded-full text-xs font-bold transition-all ${
                        entryMode === 'daily' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                    Daily Entry
                </button>
                <button
                    type="button"
                    onClick={() => setEntryMode('range')}
                    className={`flex-1 py-1.5 px-4 rounded-full text-xs font-bold transition-all ${
                        entryMode === 'range' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                    Range Entry
                </button>
            </div>

            {/* ── RANGE ENTRY MODE ──────────────────────────────────────── */}
            {entryMode === 'range' && (
                <div className="space-y-3">
                    {/* Date picker — free, no lock */}
                    <div className="bg-white dark:bg-slate-900 border border-emerald-900/10 rounded-xl p-3 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2">Entry Date (Historical)</p>
                        <input
                            type="date"
                            value={rangeDate}
                            onChange={e => setRangeDate(e.target.value)}
                            className="w-full h-9 rounded-md border border-input bg-white dark:bg-slate-900 px-2 text-sm"
                        />
                    </div>

                    {/* Range cards */}
                    <div className="bg-white dark:bg-slate-900 border border-emerald-900/10 rounded-xl shadow-sm overflow-hidden">
                        <div className="p-3 pb-1.5 bg-emerald-50/30 dark:bg-emerald-950/10 border-b border-emerald-900/5">
                            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Recitation Ranges</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Each range is saved as individual surah records</p>
                        </div>
                        <div className="p-3 space-y-3">
                            {ranges.map((r, idx) => (
                                <div key={idx} className="p-3 border-l-2 border-emerald-500 bg-emerald-950/10 rounded-r-lg space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs uppercase tracking-wider text-emerald-500/80 font-semibold">Range {idx + 1}</span>
                                        {ranges.length > 1 && (
                                            <button type="button" onClick={() => setRanges(prev => prev.filter((_, i) => i !== idx))}
                                                className="text-[10px] font-bold text-red-500 hover:text-red-400 flex items-center gap-1">
                                                <Trash2 size={12} /> Remove
                                            </button>
                                        )}
                                    </div>
                                    {/* FROM */}
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">From</p>
                                        <div className="grid grid-cols-[1fr_80px] gap-2">
                                            <select
                                                value={r.fromSurah ?? ''}
                                                onChange={e => setRanges(prev => prev.map((x, i) => i === idx ? { ...x, fromSurah: e.target.value ? parseInt(e.target.value) : undefined, fromAyah: undefined } : x))}
                                                className="h-9 rounded-md border border-input bg-white dark:bg-slate-900 px-2 text-sm w-full"
                                            >
                                                <option value="">Select Surah</option>
                                                {typedSurahList.map(s => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
                                            </select>
                                            <input type="number" placeholder="Ayah"
                                                value={r.fromAyah ?? ''}
                                                min={1}
                                                max={r.fromSurah ? typedSurahList.find(s => s.id === r.fromSurah)?.totalVerses : undefined}
                                                onChange={e => setRanges(prev => prev.map((x, i) => i === idx ? { ...x, fromAyah: e.target.value ? parseInt(e.target.value) : undefined } : x))}
                                                className="h-9 rounded-md border border-input bg-white dark:bg-slate-900 px-2 text-sm w-full"
                                            />
                                        </div>
                                    </div>
                                    {/* TO */}
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">To</p>
                                        <div className="grid grid-cols-[1fr_80px] gap-2">
                                            <select
                                                value={r.toSurah ?? ''}
                                                onChange={e => setRanges(prev => prev.map((x, i) => i === idx ? { ...x, toSurah: e.target.value ? parseInt(e.target.value) : undefined, toAyah: undefined } : x))}
                                                className="h-9 rounded-md border border-input bg-white dark:bg-slate-900 px-2 text-sm w-full"
                                            >
                                                <option value="">Select Surah</option>
                                                {typedSurahList.map(s => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
                                            </select>
                                            <input type="number" placeholder="Ayah"
                                                value={r.toAyah ?? ''}
                                                min={1}
                                                max={r.toSurah ? typedSurahList.find(s => s.id === r.toSurah)?.totalVerses : undefined}
                                                onChange={e => setRanges(prev => prev.map((x, i) => i === idx ? { ...x, toAyah: e.target.value ? parseInt(e.target.value) : undefined } : x))}
                                                className="h-9 rounded-md border border-input bg-white dark:bg-slate-900 px-2 text-sm w-full"
                                            />
                                        </div>
                                    </div>
                                    {/* Preview */}
                                    {r.fromSurah && r.toSurah && (
                                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium pt-1 border-t border-emerald-900/10">
                                            📖 {rangePreview(r)}
                                        </p>
                                    )}
                                </div>
                            ))}
                            <button type="button"
                                onClick={() => setRanges(prev => [...prev, { fromSurah: undefined, fromAyah: undefined, toSurah: undefined, toAyah: undefined }])}
                                className="w-full h-8 border border-dashed border-emerald-800/30 rounded-md text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center justify-center gap-1"
                            >
                                <PlusCircle size={13} /> Add another Range
                            </button>
                        </div>
                    </div>

                    {/* Feedback */}
                    {rangeError && <p className="text-xs text-red-500 font-medium px-1">{rangeError}</p>}
                    {rangeSuccess && <p className="text-xs text-emerald-600 font-bold px-1">✅ Saved successfully!</p>}

                    <Button
                        type="button"
                        onClick={handleRangeSave}
                        disabled={rangeSaving}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-10 text-sm font-bold shadow-md"
                    >
                        {rangeSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save Range</>}
                    </Button>
                </div>
            )}

            {/* ── DAILY ENTRY MODE ──────────────────────────────────────── */}
            {entryMode === 'daily' && (
                <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
                    console.log("Form validation errors:", errors)
                    const firstError = Object.values(errors)[0]
                    const msg = Array.isArray(firstError)
                        ? firstError[0]?.surah_id?.message || firstError[0]?.start_v?.message || firstError[0]?.end_v?.message || "Validation error"
                        : (firstError as any)?.message || "Please fill all required fields"
                    alert("Validation failed: " + msg)
                })} className="space-y-3">

                    <Card className="border-emerald-900/10 shadow-sm">
                        <CardHeader className="p-3 pb-1.5 border-b border-emerald-900/5">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Session Setup</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2.5 p-3 pt-2">
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="date"
                                    render={({ field }) => (
                                        <FormItem className="space-y-1">
                                            <FormLabel className="text-[10px] font-bold text-muted-foreground uppercase">Date</FormLabel>
                                            <FormControl>
                                                <Input type="date" {...field} className="bg-white dark:bg-slate-900 border-input h-9 text-sm px-2 cursor-pointer" />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="session"
                                    render={({ field }) => (
                                        <FormItem className="space-y-1">
                                            <FormLabel className="text-[10px] font-bold text-muted-foreground uppercase">Session</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value} disabled={isOldDate}>
                                                <FormControl>
                                                    <SelectTrigger className="bg-white dark:bg-slate-900 border-input h-9 text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="Subh">Subh</SelectItem>
                                                    <SelectItem value="Breakfast">Breakfast</SelectItem>
                                                    <SelectItem value="Lunch">Lunch</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border border-emerald-900/10 shadow-sm overflow-hidden">
                        <CardHeader className="p-3 pb-1.5 bg-emerald-50/30 dark:bg-emerald-950/10 border-b border-emerald-900/5">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Hifz Progress Tracker</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3 p-3 pt-2">
                            <FormField
                                control={form.control}
                                name="mode"
                                render={({ field }) => (
                                    <FormItem>
                                        <Select 
                                            onValueChange={(val) => {
                                                // 1. Force RHF absolute wipe instantly
                                                form.reset({
                                                    date: form.getValues("date"),
                                                    session: form.getValues("session"),
                                                    mode: val as any,
                                                    new_verses: [{ surah_id: "" as any, start_v: "" as any, end_v: "" as any }],
                                                    juz_number: "" as any,
                                                    juz_portion: "" as any
                                                });
                                                setLogId(null);
                                            }} 
                                            value={field.value} 
                                            disabled={isOldDate}
                                        >
                                            <FormControl>
                                                <SelectTrigger className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-600/30 text-emerald-700 dark:text-emerald-300 font-semibold h-10 w-[180px] rounded-full px-4">
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {isHafiz ? (
                                                    <>
                                                        <SelectItem value="Juz Revision (New)">Juz Revision (New)</SelectItem>
                                                        <SelectItem value="Juz Revision (Old)">Juz Revision (Old)</SelectItem>
                                                    </>
                                                ) : (
                                                    <>
                                                        <SelectItem value="New Verses">New Verses</SelectItem>
                                                        <SelectItem value="Recent Revision">Recent Revision</SelectItem>
                                                        <SelectItem value="Juz Revision">Juz Revision</SelectItem>
                                                    </>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />

                            {/* New Verses Mode - Multiple Surahs */}
                            {(form.watch("mode") === "New Verses" || form.watch("mode") === "Recent Revision") && (
                                <div className="space-y-4" key={form.watch("mode")}>
                                    {versesFields.map((field, index) => (
                                        <div key={field.id} className="p-4 border-l-2 border-emerald-500 bg-emerald-950/10 rounded-r-lg relative group">
                                            <div className="flex justify-between items-center mb-3">
                                                <span className="text-xs uppercase tracking-wider text-emerald-500/80 font-semibold">Surah Entry {index + 1}</span>
                                                {versesFields.length > 1 && !isOldDate && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 px-2 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                                        onClick={() => removeVerse(index)}
                                                    >
                                                        <Trash2 size={14} className="mr-1" /> Remove
                                                    </Button>
                                                )}
                                            </div>

                                             <FormField
                                                control={form.control}
                                                name={`new_verses.${index}.surah_id`}
                                                render={({ field }) => (
                                                     <FormItem className="mb-2">
                                                        <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value?.toString() || ""} disabled={isOldDate}>
                                                            <FormControl>
                                                                <SelectTrigger className="bg-white dark:bg-slate-900 border-input h-9 text-sm">
                                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600/70 font-bold pointer-events-none uppercase">
                                                                        {typedSurahList.find(s => s.id === field.value)?.totalVerses ? `${typedSurahList.find(s => s.id === field.value)?.totalVerses} Ayahs` : ''}
                                                                    </div>
                                                                    <SelectValue placeholder="Select Surah" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent className="max-h-[300px]">
                                                                {typedSurahList.map((surah) => (
                                                                    <SelectItem key={surah.id} value={surah.id.toString()}>
                                                                        {surah.id}. {surah.name} <span className="text-xs text-muted-foreground ml-2">({surah.totalVerses} ayahs)</span>
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage className="text-[10px]" />
                                                    </FormItem>
                                                )}
                                            />

                                             <div className="grid grid-cols-2 gap-2">
                                                <FormField
                                                    control={form.control}
                                                    name={`new_verses.${index}.start_v`}
                                                    render={({ field }) => (
                                                        <FormItem className="flex flex-col gap-1">
                                                            <FormLabel className="text-[10px] font-bold text-muted-foreground uppercase">Start</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" {...field} value={field.value ?? ""} disabled={isOldDate} className="h-8 text-sm px-2" />
                                                            </FormControl>
                                                            <FormMessage className="text-[10px]" />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name={`new_verses.${index}.end_v`}
                                                    render={({ field }) => (
                                                        <FormItem className="flex flex-col gap-1">
                                                            <FormLabel className="text-[10px] font-bold text-muted-foreground uppercase">End</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" {...field} value={field.value ?? ""} disabled={isOldDate} className="h-8 text-sm px-2" />
                                                            </FormControl>
                                                            <FormMessage className="text-[10px]" />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    {!isOldDate && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() => appendVerse({ surah_id: undefined, start_v: undefined, end_v: undefined })}
                                            className="w-full h-8 border border-dashed border-emerald-800/30 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                        >
                                            <PlusCircle size={14} className="mr-2" /> Add another Surah
                                        </Button>
                                    )}
                                </div>
                            )}

                             {/* Juz Revision Mode */}
                            {form.watch("mode")?.startsWith("Juz Revision") && (
                                <div className="space-y-3 p-3 border border-purple-500/10 bg-purple-50/30 dark:bg-purple-950/10 rounded-lg" key="juz">
                                    <div className="flex gap-3">
                                        <FormField
                                            control={form.control}
                                            name="juz_number"
                                            render={({ field }) => (
                                                <FormItem className="flex-1">
                                                    <FormLabel className="text-[10px] font-bold text-muted-foreground uppercase">Juz Number</FormLabel>
                                                    <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString()} disabled={isOldDate}>
                                                        <FormControl>
                                                            <SelectTrigger className="bg-white dark:bg-slate-900 border-input h-9 text-sm">
                                                                <SelectValue placeholder="Select Juz" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="max-h-[200px]">
                                                            {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => (
                                                                <SelectItem key={juz} value={juz.toString()}>
                                                                    Juz {juz}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage className="text-[10px]" />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="juz_portion"
                                            render={({ field }) => (
                                                <FormItem className="flex-1">
                                                    <FormLabel className="text-[10px] font-bold text-muted-foreground uppercase">Portion</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value} disabled={isOldDate}>
                                                        <FormControl>
                                                            <SelectTrigger className="bg-white dark:bg-slate-900 border-input h-9 text-sm">
                                                                <SelectValue placeholder="Portion" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="Full">Full Juz</SelectItem>
                                                            <SelectItem value="1st Half">1st Half</SelectItem>
                                                            <SelectItem value="2nd Half">2nd Half</SelectItem>
                                                            <SelectItem value="Q1">Quarter 1</SelectItem>
                                                            <SelectItem value="Q2">Quarter 2</SelectItem>
                                                            <SelectItem value="Q3">Quarter 3</SelectItem>
                                                            <SelectItem value="Q4">Quarter 4</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage className="text-[10px]" />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>
                            )}

                        </CardContent>
                    </Card>

                     <div className="flex flex-col gap-3">
                        {isOldDate && (
                            <p className="text-red-400 text-[11px] text-center font-bold bg-red-400/5 py-1.5 rounded-md border border-red-400/20">
                                Locked for dates older than 7 days.
                            </p>
                        )}
                        <div className="flex gap-3">
                            {logId && (
                                <Button type="button" variant="destructive" className="h-10 px-4 text-xs font-bold" onClick={handleDelete} disabled={loading || isOldDate}>
                                    Delete
                                </Button>
                            )}
                            <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white h-10 text-sm font-bold shadow-md" disabled={loading || isOldDate}>
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                {logId ? "Update" : "Save Progress"}
                            </Button>
                        </div>
                    </div>
                </form>
                </Form>
            )}

        </div>
    )
}
