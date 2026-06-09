"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
    BookMarked, BookOpen, Check, CheckSquare2, ChevronDown,
    GraduationCap, Loader2, RefreshCw, Save,
    School, Search, Square, Users,
} from "lucide-react"
import api from "@/lib/api"
import { cachedGet, invalidateCache } from "@/lib/api-cache"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────
type AcademicYear = { id: string; name: string; is_current?: boolean }
type ClassModel = {
    id: string; name: string
    type: "School" | "Madrassa" | "Hifz"
    standard?: string | null; section?: string | null
}
type StudentRow = {
    adm_no: string; name: string; standard?: string | null
    school_class_id?: string | null;  school_class_name?: string | null
    madrasa_class_id?: string | null; madrasa_class_name?: string | null
    hifz_class_ids: string[]
}
type StudentAssignmentRow = Omit<StudentRow, "hifz_class_ids"> & { hifz_class_ids?: unknown }
type ApiListResponse<T> = { data?: T[] }
type Tab = "school" | "madrasa" | "hifz"

function getApiErrorMessage(error: unknown) {
    const maybeError = error as { response?: { data?: { error?: string } }; message?: string } | null
    return maybeError?.response?.data?.error || maybeError?.message || "Unknown error"
}

function normalizeHifzIds(value: unknown) {
    if (!Array.isArray(value)) return []
    return value.filter((id): id is string => typeof id === "string" && id.length > 0)
}

// Standard sort order
const STD_ORDER = ["1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th","Plus One","Plus Two"]
function sortStd(a: string, b: string) {
    const ai = STD_ORDER.indexOf(a), bi = STD_ORDER.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1; if (bi !== -1) return 1
    return a.localeCompare(b)
}

// ─── HifzSessionPicker (checkbox dropdown) ────────────────────────────────────
function HifzSessionPicker({ sessions, selected, onChange }: {
    sessions: ClassModel[]; selected: string[]; onChange: (ids: string[]) => void
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
        document.addEventListener("mousedown", h)
        return () => document.removeEventListener("mousedown", h)
    }, [])

    function toggle(id: string) {
        onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id])
    }

    const label = selected.length === 0 ? "No sessions"
        : selected.length === sessions.length && sessions.length > 0 ? "All sessions"
        : selected.map(id => sessions.find(s => s.id === id)?.name ?? id).join(", ")

    return (
        <div ref={ref} className="relative w-full">
            <button type="button" onClick={() => setOpen(o => !o)}
                className={cn(
                    "flex h-9 w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500",
                    selected.length > 0
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold"
                        : "border-slate-200 bg-white text-slate-500"
                )}>
                <span className="truncate">{label}</span>
                <ChevronDown className={cn("ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <div className="absolute z-50 mt-1 w-full min-w-[200px] rounded-lg border border-slate-200 bg-white shadow-xl">
                    <div className="flex gap-1 border-b border-slate-100 px-2 py-1.5">
                        <button type="button" onClick={() => onChange(sessions.map(s => s.id))}
                            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold text-slate-500 hover:bg-slate-100">
                            <CheckSquare2 className="h-3 w-3" /> All
                        </button>
                        <button type="button" onClick={() => onChange([])}
                            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold text-slate-500 hover:bg-slate-100">
                            <Square className="h-3 w-3" /> None
                        </button>
                    </div>
                    {sessions.length === 0
                        ? <p className="px-3 py-3 text-xs text-slate-400">No Hifz sessions set up yet</p>
                        : <div className="py-1">
                            {sessions.map(s => {
                                const checked = selected.includes(s.id)
                                return (
                                    <button key={s.id} type="button" onClick={() => toggle(s.id)}
                                        className={cn("flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50",
                                            checked ? "font-bold text-slate-900" : "font-medium text-slate-600")}>
                                        <div className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
                                            checked ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-white")}>
                                            {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                                        </div>
                                        {s.name}
                                    </button>
                                )
                            })}
                        </div>
                    }
                </div>
            )}
        </div>
    )
}

// ─── AssignClassModal (School / Madrasa) ──────────────────────────────────────
function AssignClassModal({ classItem, allStudents, type, yearId, onSaved, onClose }: {
    classItem: ClassModel; allStudents: StudentRow[]
    type: "School" | "Madrassa"; yearId: string
    onSaved: () => void; onClose: () => void
}) {
    const { toast } = useToast()
    const getClassId = (s: StudentRow) => type === "School" ? s.school_class_id : s.madrasa_class_id
    const getClassName = (s: StudentRow) => type === "School" ? s.school_class_name : s.madrasa_class_name
    const deptKey = type === "School" ? "school_class_id" : "madrasa_class_id"

    // Who was already in this class when the modal opened
    const original = useMemo(
        () => new Set(allStudents.filter(s => getClassId(s) === classItem.id).map(s => s.adm_no)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    )
    const [selected, setSelected] = useState<Set<string>>(new Set(original))
    const [search, setSearch] = useState("")
    const [saving, setSaving] = useState(false)

    const filtered = useMemo(() => {
        const q = search.toLowerCase()
        return q ? allStudents.filter(s => s.name.toLowerCase().includes(q) || s.adm_no.toLowerCase().includes(q)) : allStudents
    }, [allStudents, search])

    // Stable sort: originally-in-class first, then alpha — computed once on open
    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            const aIn = original.has(a.adm_no) ? 0 : 1
            const bIn = original.has(b.adm_no) ? 0 : 1
            return aIn !== bIn ? aIn - bIn : a.name.localeCompare(b.name)
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtered]) // original is stable

    function toggle(id: string) {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const { addIds, removeIds } = useMemo(() => ({
        addIds:    [...selected].filter(id => !original.has(id)),
        removeIds: [...original].filter(id => !selected.has(id)),
    }), [selected, original])

    async function handleSave() {
        if (addIds.length === 0 && removeIds.length === 0) { onClose(); return }
        setSaving(true)
        try {
            await Promise.all([
                ...addIds.map(id => api.post("/classes/student-assignments", {
                    student_id: id, academic_year_id: yearId, [deptKey]: classItem.id,
                })),
                ...removeIds.map(id => api.post("/classes/student-assignments", {
                    student_id: id, academic_year_id: yearId, [deptKey]: null,
                })),
            ])
            const typeName = type === "School" ? "School" : "Madrasa"
            toast({
                title: "Assignments saved",
                description: `${addIds.length} added · ${removeIds.length} removed — ${typeName} class updated`,
            })
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast({ title: "Save failed", description: getApiErrorMessage(err), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const typeName = type === "School" ? "School" : "Madrasa"

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0">
                {/* Header */}
                <DialogHeader className="shrink-0 border-b border-slate-100 px-6 pb-4 pt-6">
                    <DialogTitle className="flex items-center gap-2 text-xl font-black">
                        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg",
                            type === "School" ? "bg-blue-100" : "bg-indigo-100")}>
                            {type === "School"
                                ? <School className="h-4 w-4 text-blue-700" />
                                : <BookMarked className="h-4 w-4 text-indigo-700" />}
                        </div>
                        {classItem.name}
                    </DialogTitle>
                    <p className="text-sm text-slate-500">
                        Tick students to enroll in this {typeName} class. Unticking a student already here removes them.
                    </p>
                </DialogHeader>

                {/* Toolbar */}
                <div className="shrink-0 border-b border-slate-100 bg-slate-50/60 px-6 py-3">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search by name or admission no." className="pl-9" />
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setSelected(new Set(filtered.map(s => s.adm_no)))}>All</Button>
                        <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>None</Button>
                        <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                            {selected.size} selected
                        </span>
                    </div>
                </div>

                {/* Student list */}
                <div className="flex-1 overflow-y-auto">
                    <div className="divide-y divide-slate-50 px-3 py-2">
                        {sorted.map(student => {
                            const isSelected  = selected.has(student.adm_no)
                            const inThisClass = original.has(student.adm_no)
                            const currentName = getClassName(student)
                            const inOtherClass = !inThisClass && !!getClassId(student)

                            return (
                                <div key={student.adm_no} onClick={() => toggle(student.adm_no)}
                                    className={cn(
                                        "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                                        isSelected ? "bg-emerald-50" : "hover:bg-slate-50"
                                    )}>
                                    {/* Checkbox */}
                                    <div className={cn(
                                        "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all",
                                        isSelected ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-white"
                                    )}>
                                        {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                                    </div>

                                    {/* Avatar */}
                                    <div className={cn(
                                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black",
                                        isSelected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                                    )}>
                                        {student.name.slice(0, 2).toUpperCase()}
                                    </div>

                                    {/* Name */}
                                    <div className="min-w-0 flex-1">
                                        <p className={cn("truncate text-sm font-semibold",
                                            isSelected ? "text-slate-900" : "text-slate-700")}>
                                            {student.name}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {student.adm_no}
                                            {student.standard && <span className="ml-2 text-slate-300">· Std {student.standard}</span>}
                                        </p>
                                    </div>

                                    {/* Badges */}
                                    {inThisClass && (
                                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                            ✓ enrolled
                                        </span>
                                    )}
                                    {inOtherClass && (
                                        <span className="max-w-[110px] shrink-0 truncate rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                                            {currentName ?? "other class"}
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="shrink-0 flex items-center justify-between gap-4 border-t border-slate-100 px-6 py-4">
                    <div className="text-sm">
                        {addIds.length > 0 && (
                            <span className="font-bold text-emerald-600">+{addIds.length} to add</span>
                        )}
                        {addIds.length > 0 && removeIds.length > 0 && <span className="mx-2 text-slate-300">·</span>}
                        {removeIds.length > 0 && (
                            <span className="font-bold text-red-500">{removeIds.length} to remove</span>
                        )}
                        {addIds.length === 0 && removeIds.length === 0 && (
                            <span className="text-slate-400">No changes</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSave}
                            disabled={saving || (addIds.length === 0 && removeIds.length === 0)}>
                            {saving
                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                                : <><Save className="mr-2 h-4 w-4" />Save Changes</>}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ─── HifzSessionsModal ────────────────────────────────────────────────────────
function HifzSessionsModal({ groupLabel, students, hifzSessions, yearId, onSaved, onClose }: {
    groupLabel: string; students: StudentRow[]
    hifzSessions: ClassModel[]; yearId: string
    onSaved: () => void; onClose: () => void
}) {
    const { toast } = useToast()
    const [sessionMap, setSessionMap] = useState<Record<string, string[]>>(
        () => Object.fromEntries(students.map(s => [s.adm_no, [...(s.hifz_class_ids ?? [])]]))
    )
    const [bulkSessions, setBulkSessions] = useState<string[]>([])
    const [search, setSearch] = useState("")
    const [saving, setSaving] = useState(false)

    const filtered = useMemo(() => {
        const q = search.toLowerCase()
        return q ? students.filter(s => s.name.toLowerCase().includes(q) || s.adm_no.includes(q)) : students
    }, [students, search])

    function applyBulk() {
        setSessionMap(prev => {
            const next = { ...prev }
            filtered.forEach(s => { next[s.adm_no] = [...bulkSessions] })
            return next
        })
    }

    const changedStudents = useMemo(() => students.filter(s => {
        const orig = [...(s.hifz_class_ids ?? [])].sort().join(",")
        const curr = [...(sessionMap[s.adm_no] ?? [])].sort().join(",")
        return orig !== curr
    }), [students, sessionMap])

    async function handleSaveAll() {
        if (changedStudents.length === 0) { onClose(); return }
        setSaving(true)
        try {
            await Promise.all(
                changedStudents.map(s => api.post("/classes/student-assignments", {
                    student_id: s.adm_no,
                    academic_year_id: yearId,
                    hifz_class_ids: sessionMap[s.adm_no] ?? [],
                }))
            )
            toast({
                title: "Hifz sessions saved",
                description: `${changedStudents.length} student${changedStudents.length !== 1 ? "s" : ""} updated`,
            })
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast({ title: "Save failed", description: getApiErrorMessage(err), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 p-0">
                {/* Header */}
                <DialogHeader className="shrink-0 border-b border-slate-100 px-6 pb-4 pt-6">
                    <DialogTitle className="flex items-center gap-2 text-xl font-black">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                            <BookOpen className="h-4 w-4 text-emerald-700" />
                        </div>
                        Hifz Sessions — {groupLabel}
                    </DialogTitle>
                    <p className="text-sm text-slate-500">
                        Set which sessions each student attends. Use &ldquo;Apply to all&rdquo; for quick bulk assignment, then adjust individually.
                    </p>
                </DialogHeader>

                {/* Bulk row */}
                {hifzSessions.length > 0 && (
                    <div className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-slate-50 px-6 py-4">
                        <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-500">
                            Bulk Apply — replaces sessions for all visible students
                        </p>
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <HifzSessionPicker sessions={hifzSessions} selected={bulkSessions} onChange={setBulkSessions} />
                            </div>
                            <Button size="sm" onClick={applyBulk}
                                className="shrink-0 border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-700">
                                <CheckSquare2 className="mr-2 h-4 w-4" />
                                Apply to {filtered.length === students.length ? "all" : filtered.length} students
                            </Button>
                        </div>
                    </div>
                )}

                {/* Search */}
                <div className="shrink-0 border-b border-slate-100 px-6 py-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search students…" className="pl-9" />
                    </div>
                </div>

                {/* Column headers */}
                <div className="shrink-0 grid grid-cols-[1fr_220px] border-b border-slate-100 bg-slate-50 px-6 py-2">
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Student</span>
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Hifz Sessions</span>
                </div>

                {/* Student rows */}
                <div className="flex-1 overflow-y-auto">
                    {filtered.length === 0
                        ? <div className="p-10 text-center text-sm font-bold text-slate-400">No students match.</div>
                        : <div className="divide-y divide-slate-50">
                            {filtered.map(student => {
                                const sessions = sessionMap[student.adm_no] ?? []
                                const orig     = [...(student.hifz_class_ids ?? [])].sort().join(",")
                                const curr     = [...sessions].sort().join(",")
                                const changed  = orig !== curr

                                return (
                                    <div key={student.adm_no}
                                        className={cn(
                                            "grid grid-cols-[1fr_220px] items-center gap-4 px-6 py-3 transition-colors",
                                            changed && "bg-amber-50/60"
                                        )}>
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className={cn(
                                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black",
                                                changed ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                                            )}>
                                                {student.name.slice(0, 2).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-slate-900">{student.name}</p>
                                                <p className="text-xs text-slate-400">
                                                    {student.adm_no}
                                                    {student.standard && <span className="ml-1.5 text-slate-300">· Std {student.standard}</span>}
                                                </p>
                                            </div>
                                            {changed && (
                                                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                                    modified
                                                </span>
                                            )}
                                        </div>
                                        <HifzSessionPicker
                                            sessions={hifzSessions}
                                            selected={sessions}
                                            onChange={ids => setSessionMap(prev => ({ ...prev, [student.adm_no]: ids }))}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    }
                </div>

                {/* Footer */}
                <div className="shrink-0 flex items-center justify-between gap-4 border-t border-slate-100 px-6 py-4">
                    <span className="text-sm">
                        {changedStudents.length > 0
                            ? <span className="font-bold text-amber-700">
                                {changedStudents.length} student{changedStudents.length !== 1 ? "s" : ""} with changes
                              </span>
                            : <span className="text-slate-400">No changes yet</span>
                        }
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSaveAll} disabled={saving || changedStudents.length === 0}>
                            {saving
                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                                : <><Save className="mr-2 h-4 w-4" />Save All Changes</>}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ─── SchoolMadrasaTab ─────────────────────────────────────────────────────────
function SchoolMadrasaTab({ type, classes, allStudents, yearId, onSaved }: {
    type: "School" | "Madrassa"; classes: ClassModel[]
    allStudents: StudentRow[]; yearId: string; onSaved: () => void
}) {
    const [openClass, setOpenClass] = useState<ClassModel | null>(null)

    const filteredClasses = useMemo(() => classes.filter(c => c.type === type), [classes, type])

    const countByClass = useMemo(() => {
        const counts: Record<string, number> = {}
        allStudents.forEach(s => {
            const id = type === "School" ? s.school_class_id : s.madrasa_class_id
            if (id) counts[id] = (counts[id] ?? 0) + 1
        })
        return counts
    }, [allStudents, type])

    const unassignedCount = useMemo(() => {
        return allStudents.filter(s => !(type === "School" ? s.school_class_id : s.madrasa_class_id)).length
    }, [allStudents, type])

    const typeName  = type === "School" ? "School" : "Madrasa"
    const TypeIcon  = type === "School" ? School : BookMarked
    const iconColor = type === "School" ? "text-blue-600" : "text-indigo-600"
    const bgColor   = type === "School" ? "bg-blue-50" : "bg-indigo-50"
    const barColor  = type === "School" ? "bg-blue-500" : "bg-indigo-500"

    if (filteredClasses.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-14 text-center">
                <TypeIcon className="mx-auto h-12 w-12 text-slate-200" />
                <p className="mt-3 text-sm font-bold text-slate-400">No {typeName} classes configured for this year.</p>
                <p className="mt-1 text-xs text-slate-400">Go to Class Setup → Add {typeName} classes first.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Unassigned banner */}
            {unassignedCount > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-black text-amber-700">
                        {unassignedCount} unassigned
                    </span>
                    <span className="text-sm text-amber-700">
                        {unassignedCount} student{unassignedCount !== 1 ? "s have" : " has"} no {typeName} class yet.
                        Open a class below and tick them in.
                    </span>
                </div>
            )}

            {/* Class cards */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredClasses.map(cls => {
                    const count = countByClass[cls.id] ?? 0
                    const pct = allStudents.length > 0 ? Math.round((count / allStudents.length) * 100) : 0
                    return (
                        <div key={cls.id}
                            className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                            <div className="flex items-start justify-between gap-2">
                                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", bgColor)}>
                                    <TypeIcon className={cn("h-5 w-5", iconColor)} />
                                </div>
                                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                                    {count} students
                                </span>
                            </div>
                            <h3 className="mt-3 text-lg font-black text-slate-900">{cls.name}</h3>
                            <p className="text-sm text-slate-500">
                                {type === "School"
                                    ? `Standard ${cls.standard}${cls.section ? ` · Section ${cls.section}` : ""}`
                                    : `Madrasa · ${cls.standard}`}
                            </p>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
                            </div>
                            <p className="mt-1 text-xs text-slate-400">{pct}% of total students</p>
                            <Button className="mt-4 w-full" variant="outline" onClick={() => setOpenClass(cls)}>
                                <Users className="mr-2 h-4 w-4" />
                                Assign Students
                            </Button>
                        </div>
                    )
                })}
            </div>

            {openClass && (
                <AssignClassModal
                    key={openClass.id}
                    classItem={openClass} allStudents={allStudents}
                    type={type} yearId={yearId}
                    onSaved={onSaved} onClose={() => setOpenClass(null)}
                />
            )}
        </div>
    )
}

// ─── HifzTab ──────────────────────────────────────────────────────────────────
function HifzTab({ hifzSessions, allStudents, yearId, onSaved }: {
    hifzSessions: ClassModel[]; allStudents: StudentRow[]
    yearId: string; onSaved: () => void
}) {
    const [openGroup, setOpenGroup] = useState<string | null>(null) // "__all" or a standard string

    const standards = useMemo(() => {
        const set = new Set<string>()
        allStudents.forEach(s => { if (s.standard) set.add(s.standard) })
        return [...set].sort(sortStd)
    }, [allStudents])

    const countByStd = useMemo(() => {
        const m: Record<string, { total: number; assigned: number }> = {
            __all: { total: allStudents.length, assigned: allStudents.filter(s => s.hifz_class_ids.length > 0).length }
        }
        allStudents.forEach(s => {
            const key = s.standard ?? "__none"
            if (!m[key]) m[key] = { total: 0, assigned: 0 }
            m[key].total++
            if (s.hifz_class_ids.length > 0) m[key].assigned++
        })
        return m
    }, [allStudents])

    const groupStudents = useMemo(() => {
        if (!openGroup || openGroup === "__all") return allStudents
        return allStudents.filter(s => s.standard === openGroup)
    }, [allStudents, openGroup])

    const groupLabel = openGroup === "__all" ? "All Students"
        : openGroup ? `Standard ${openGroup}` : ""

    if (hifzSessions.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-14 text-center">
                <BookOpen className="mx-auto h-12 w-12 text-slate-200" />
                <p className="mt-3 text-sm font-bold text-slate-400">No Hifz sessions configured for this year.</p>
                <p className="mt-1 text-xs text-slate-400">Go to Class Setup → add Hifz sessions (Morning, Noon, Subh…) first.</p>
            </div>
        )
    }

    const { total: totalAll, assigned: assignedAll } = countByStd["__all"] ?? { total: 0, assigned: 0 }
    const pctAll = totalAll > 0 ? Math.round((assignedAll / totalAll) * 100) : 0

    return (
        <div className="space-y-4">
            {/* Session legend */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs">
                <span className="font-black uppercase tracking-widest text-slate-400">Sessions this year:</span>
                {hifzSessions.map(s => (
                    <span key={s.id} className="rounded-full bg-emerald-100 px-3 py-0.5 font-bold text-emerald-800">{s.name}</span>
                ))}
            </div>

            {/* Completion summary */}
            {assignedAll < totalAll && (
                <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-black text-amber-700">
                        {totalAll - assignedAll} unassigned
                    </span>
                    <span className="text-sm text-amber-700">
                        {totalAll - assignedAll} student{totalAll - assignedAll !== 1 ? "s have" : " has"} no Hifz sessions yet.
                        Pick a group below to assign.
                    </span>
                </div>
            )}

            {/* Group cards */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {/* All students card */}
                <div className="flex flex-col rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                            <Users className="h-5 w-5 text-blue-700" />
                        </div>
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                            {assignedAll}/{totalAll}
                        </span>
                    </div>
                    <h3 className="mt-3 text-lg font-black text-blue-900">All Students</h3>
                    <p className="text-sm text-blue-600">{pctAll}% have sessions assigned</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100">
                        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pctAll}%` }} />
                    </div>
                    <Button className="mt-4 w-full bg-blue-600 text-white hover:bg-blue-700"
                        onClick={() => setOpenGroup("__all")}>
                        <BookOpen className="mr-2 h-4 w-4" />
                        Assign Sessions (All)
                    </Button>
                </div>

                {/* Per-standard cards */}
                {standards.map(std => {
                    const { total, assigned } = countByStd[std] ?? { total: 0, assigned: 0 }
                    const pct = total > 0 ? Math.round((assigned / total) * 100) : 0
                    const complete = assigned === total
                    return (
                        <div key={std}
                            className={cn(
                                "flex flex-col rounded-xl border p-5 shadow-sm transition-shadow hover:shadow-md",
                                complete ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"
                            )}>
                            <div className="flex items-start justify-between gap-2">
                                <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg",
                                    complete ? "bg-emerald-100" : "bg-slate-100")}>
                                    <GraduationCap className={cn("h-5 w-5", complete ? "text-emerald-600" : "text-slate-500")} />
                                </div>
                                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold",
                                    complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                                    {assigned}/{total}
                                </span>
                            </div>
                            <h3 className="mt-3 text-lg font-black text-slate-900">Standard {std}</h3>
                            <p className="text-sm text-slate-500">
                                {complete ? "All assigned ✓" : `${total - assigned} pending`}
                            </p>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div className={cn("h-full rounded-full transition-all",
                                    complete ? "bg-emerald-500" : "bg-emerald-400")}
                                    style={{ width: `${pct}%` }} />
                            </div>
                            <Button className="mt-4 w-full" variant={complete ? "outline" : "default"}
                                onClick={() => setOpenGroup(std)}>
                                <BookOpen className="mr-2 h-4 w-4" />
                                {complete ? "Review Sessions" : "Assign Sessions"}
                            </Button>
                        </div>
                    )
                })}
            </div>

            {openGroup && (
                <HifzSessionsModal
                    key={openGroup}
                    groupLabel={groupLabel}
                    students={groupStudents}
                    hifzSessions={hifzSessions}
                    yearId={yearId}
                    onSaved={onSaved}
                    onClose={() => setOpenGroup(null)}
                />
            )}
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StudentPlacementPage() {
    const { toast } = useToast()
    const loadRequestRef = useRef(0)
    const [tab, setTab] = useState<Tab>("school")
    const [years, setYears] = useState<AcademicYear[]>([])
    const [yearId, setYearId] = useState("")
    const [classes, setClasses] = useState<ClassModel[]>([])
    const [allStudents, setAllStudents] = useState<StudentRow[]>([])
    const [loading, setLoading] = useState(true)

    const schoolClasses  = useMemo(() => classes.filter(c => c.type === "School"),   [classes])
    const madrasaClasses = useMemo(() => classes.filter(c => c.type === "Madrassa"), [classes])
    const hifzSessions   = useMemo(() => classes.filter(c => c.type === "Hifz"),     [classes])

    async function loadYears() {
        const res = await cachedGet<ApiListResponse<AcademicYear>>("/classes/academic-years", undefined, 5 * 60_000)
        const next: AcademicYear[] = res.data?.data || []
        setYears(next)
        const selected = yearId || next.find(y => y.is_current)?.id || next[0]?.id || ""
        setYearId(selected)
        return selected
    }

    async function loadData(targetYear: string, forceFresh = false) {
        if (!targetYear) {
            setLoading(false)
            return
        }

        const requestId = ++loadRequestRef.current
        setLoading(true)
        try {
            const classParams = { academic_year_id: targetYear }
            const studentParams = { academic_year_id: targetYear, limit: 500 }
            const [clsRes, studRes] = forceFresh
                ? await Promise.all([
                    api.get<ApiListResponse<ClassModel>>("/classes", { params: classParams }),
                    api.get<ApiListResponse<StudentAssignmentRow>>("/classes/student-assignments", { params: studentParams }),
                ])
                : await Promise.all([
                    cachedGet<ApiListResponse<ClassModel>>("/classes", classParams, 30_000),
                    cachedGet<ApiListResponse<StudentAssignmentRow>>("/classes/student-assignments", studentParams, 30_000),
                ])

            if (requestId !== loadRequestRef.current) return
            setClasses(clsRes.data?.data || [])
            setAllStudents(
                (studRes.data?.data || []).map((r) => ({
                    ...r,
                    hifz_class_ids: normalizeHifzIds(r.hifz_class_ids),
                }))
            )
        } catch (err: unknown) {
            if (requestId === loadRequestRef.current) {
                toast({ title: "Failed to load data", description: getApiErrorMessage(err), variant: "destructive" })
            }
        } finally {
            if (requestId === loadRequestRef.current) setLoading(false)
        }
    }

    function refreshData() {
        invalidateCache("/classes")
        invalidateCache("/classes/student-assignments")
        void loadData(yearId, true)
    }

    function handleYearChange(nextYearId: string) {
        setYearId(nextYearId)
        void loadData(nextYearId)
    }

    useEffect(() => {
        let cancelled = false

        loadYears()
            .then((selected) => {
                if (!cancelled) return loadData(selected)
            })
            .catch(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
            loadRequestRef.current += 1
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Stats
    const stats = useMemo(() => ({
        school:  allStudents.filter(s => s.school_class_id).length,
        madrasa: allStudents.filter(s => s.madrasa_class_id).length,
        hifz:    allStudents.filter(s => s.hifz_class_ids.length > 0).length,
        total:   allStudents.length,
    }), [allStudents])

    const tabs: { id: Tab; label: string; icon: React.ElementType; classes: number }[] = [
        { id: "school",  label: "School",  icon: School,     classes: schoolClasses.length },
        { id: "madrasa", label: "Madrasa", icon: BookMarked, classes: madrasaClasses.length },
        { id: "hifz",    label: "Hifz",    icon: BookOpen,   classes: hifzSessions.length },
    ]

    return (
        <main className="space-y-5">
            {/* ── Header ───────────────────────────────────────────────────── */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Academic</p>
                        <h1 className="mt-1 text-2xl font-black text-slate-950">Student Placement</h1>
                        <p className="mt-1 text-sm font-medium text-slate-500">
                            Assign students to School, Madrasa, and Hifz sessions for the selected academic year.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Select value={yearId} onValueChange={handleYearChange}>
                            <SelectTrigger className="w-[190px] bg-white">
                                <SelectValue placeholder="Academic year" />
                            </SelectTrigger>
                            <SelectContent>
                                {years.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={refreshData} disabled={loading || !yearId}>
                            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                            Refresh
                        </Button>
                    </div>
                </div>
            </section>

            {/* ── Stats ────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: "School",  value: stats.school,  icon: School,     color: "blue"    },
                    { label: "Madrasa", value: stats.madrasa, icon: BookMarked, color: "indigo"  },
                    { label: "Hifz",    value: stats.hifz,    icon: BookOpen,   color: "emerald" },
                ].map(({ label, value, icon: Icon, color }) => {
                    const pct = stats.total > 0 ? Math.round((value / stats.total) * 100) : 0
                    return (
                        <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Icon className={cn("h-4 w-4",
                                    color === "blue" ? "text-blue-500" : color === "indigo" ? "text-indigo-500" : "text-emerald-500"
                                )} />
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
                            </div>
                            <p className="mt-2 text-2xl font-black text-slate-950">
                                {value}
                                <span className="text-sm font-semibold text-slate-400">/{stats.total}</span>
                            </p>
                            <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
                                <div className={cn("h-full rounded-full",
                                    color === "blue" ? "bg-blue-500" : color === "indigo" ? "bg-indigo-500" : "bg-emerald-500"
                                )} style={{ width: `${pct}%` }} />
                            </div>
                            <p className="mt-1 text-xs text-slate-400">{pct}% assigned</p>
                        </div>
                    )
                })}
            </div>

            {/* ── Tabbed section ───────────────────────────────────────────── */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {/* Tab bar */}
                <div className="flex border-b border-slate-100">
                    {tabs.map(t => {
                        const Icon = t.icon
                        const active = tab === t.id
                        return (
                            <button key={t.id} onClick={() => setTab(t.id)}
                                className={cn(
                                    "flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-4 text-sm font-semibold -mb-px transition-all",
                                    active
                                        ? "border-blue-600 bg-blue-50/50 text-blue-700"
                                        : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                )}>
                                <Icon className="h-4 w-4" />
                                {t.label}
                                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold",
                                    active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")}>
                                    {t.classes}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Tab content */}
                <div className="p-5">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                            <span className="ml-3 text-sm font-bold text-slate-400">Loading…</span>
                        </div>
                    ) : tab === "school" ? (
                        <SchoolMadrasaTab type="School"
                            classes={classes} allStudents={allStudents}
                            yearId={yearId} onSaved={refreshData} />
                    ) : tab === "madrasa" ? (
                        <SchoolMadrasaTab type="Madrassa"
                            classes={classes} allStudents={allStudents}
                            yearId={yearId} onSaved={refreshData} />
                    ) : (
                        <HifzTab
                            hifzSessions={hifzSessions} allStudents={allStudents}
                            yearId={yearId} onSaved={refreshData} />
                    )}
                </div>
            </section>
        </main>
    )
}
