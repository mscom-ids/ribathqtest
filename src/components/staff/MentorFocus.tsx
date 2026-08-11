"use client"

import { useEffect, useMemo, useState } from "react"
import { Target, Search, Users, Loader2, X, ArrowLeftRight, ChevronRight } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import api from "@/lib/api"
import { cachedGet } from "@/lib/api-cache"
import { resolveBackendUrl as getPhotoUrl } from "@/lib/utils"

// Roles that supervise every mentor and therefore get the Mentor Focus control.
const SUPERVISOR_ROLES = ["principal", "vice_principal", "admin"]

type FocusableMentor = {
    id: string
    name: string
    photo_url: string | null
    role: string
    place: string | null
    student_count: number
}

/**
 * Mentor Focus — lets a Principal / Vice Principal pick a mentor and operate the
 * whole Mentor Portal as that mentor's class (students, attendance, reports,
 * Hifz register), exactly like the mentor's own portal. Renders nothing for
 * non-supervisor roles.
 *
 * `role` is the supervisor's REAL role (from /auth/me) — never /staff/me, which
 * returns the focused mentor's role while a focus is active.
 */
export function MentorFocus({ role }: { role: string }) {
    const isSupervisor = SUPERVISOR_ROLES.includes(role)

    const [focusedName, setFocusedName] = useState<string | null>(null)
    const [picking, setPicking] = useState(false)
    const [mentors, setMentors] = useState<FocusableMentor[]>([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState("")
    const [submittingId, setSubmittingId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Read current focus state from sessionStorage on mount.
    useEffect(() => {
        if (typeof window === "undefined") return
        if (sessionStorage.getItem("mentorFocus") === "1") {
            setFocusedName(sessionStorage.getItem("delegationMentorName"))
        }
    }, [])

    // Lazily load the mentor list the first time the picker opens.
    useEffect(() => {
        if (!picking || mentors.length > 0) return
        let cancelled = false
        setLoading(true)
        setError(null)
        cachedGet("/delegations/focusable-mentors", undefined, 60_000)
            .then((res) => {
                if (cancelled) return
                if (res.data?.success) setMentors(res.data.mentors || [])
            })
            .catch(() => { if (!cancelled) setError("Could not load mentors.") })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [picking, mentors.length])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return mentors
        return mentors.filter(
            (m) => m.name.toLowerCase().includes(q) || (m.place || "").toLowerCase().includes(q)
        )
    }, [mentors, search])

    if (!isSupervisor) return null

    async function focusOn(mentor: FocusableMentor) {
        setSubmittingId(mentor.id)
        setError(null)
        try {
            const res = await api.post("/delegations/supervisor-focus", { mentorId: mentor.id })
            if (res.data?.success) {
                sessionStorage.setItem("delegationToken", res.data.delegationToken)
                sessionStorage.setItem("delegationMentorName", res.data.mentor.name)
                sessionStorage.setItem("mentorFocus", "1")
                sessionStorage.removeItem("delegationStudentName")
                // Full reload so every request picks up the focus token and the
                // dashboard re-fetches as the focused mentor.
                window.location.href = "/staff"
            } else {
                setError(res.data?.error || "Could not focus on this mentor.")
                setSubmittingId(null)
            }
        } catch (e: any) {
            setError(e?.response?.data?.error || "Could not focus on this mentor.")
            setSubmittingId(null)
        }
    }

    function exitFocus() {
        sessionStorage.removeItem("delegationToken")
        sessionStorage.removeItem("delegationMentorName")
        sessionStorage.removeItem("delegationStudentName")
        sessionStorage.removeItem("mentorFocus")
        window.location.href = "/staff"
    }

    // ── Focused: compact "viewing X's class" bar with change / exit ──────────
    if (focusedName) {
        return (
            <div className="mx-3 mt-3 lg:mx-6 lg:mt-4 rounded-2xl border border-indigo-200 dark:border-indigo-500/30 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/30 px-4 py-3 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                            <Target className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-500 dark:text-indigo-300">Mentor Focus active</p>
                            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                                Viewing <span className="text-indigo-700 dark:text-indigo-300">{focusedName}</span>&apos;s class
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setFocusedName(null); setPicking(true) }}>
                            <ArrowLeftRight className="h-3.5 w-3.5" /> Change mentor
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-slate-500 hover:text-red-600" onClick={exitFocus}>
                            <X className="h-3.5 w-3.5" /> Exit focus
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    // ── Not focused: the picker (collapsed prompt → expands to mentor list) ──
    return (
        <div className="mx-3 mt-3 lg:mx-6 lg:mt-4 rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-[#0f172a] shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={() => setPicking((v) => !v)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
            >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm">
                    <Target className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Mentor Focus</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Set a mentor&apos;s class as active to view and manage it like their own portal.
                    </p>
                </div>
                <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${picking ? "rotate-90" : ""}`} />
            </button>

            {picking && (
                <div className="border-t border-slate-100 dark:border-gray-700 p-4 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                            autoFocus
                            placeholder="Search mentor by name or place…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8 h-9 text-sm"
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-6 text-xs text-slate-400">
                            {search ? "No mentors match your search." : "No mentors found."}
                        </div>
                    ) : (
                        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-gray-800/50 rounded-xl border border-slate-100 dark:border-gray-800">
                            {filtered.map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    disabled={submittingId !== null}
                                    onClick={() => focusOn(m)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors disabled:opacity-60"
                                >
                                    <Avatar className="h-9 w-9 shrink-0">
                                        <AvatarImage src={getPhotoUrl(m.photo_url)} className="object-cover" />
                                        <AvatarFallback className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold">
                                            {m.name.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{m.name}</p>
                                        <p className="truncate text-[11px] text-slate-400">
                                            {m.place ? `${m.place} · ` : ""}
                                            <span className="inline-flex items-center gap-1">
                                                <Users className="h-3 w-3" />{m.student_count} student{m.student_count !== 1 ? "s" : ""}
                                            </span>
                                        </p>
                                    </div>
                                    {submittingId === m.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-indigo-500 shrink-0" />
                                    ) : (
                                        <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">View class</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
