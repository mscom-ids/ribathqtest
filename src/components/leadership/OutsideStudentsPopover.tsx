"use client"

import { useEffect, useId, useMemo, useState, type ReactElement } from "react"
import Link from "next/link"
import { Popover } from "radix-ui"
import { ArrowUpRight, Clock3, DoorOpen, Loader2, RefreshCw, Search, X } from "lucide-react"
import api from "@/lib/api"
import { resolveBackendUrl } from "@/lib/utils"

type OutsideStudent = {
  adm_no: string; student_name: string; standard?: string | null; photo_url?: string | null
  leave_type?: string | null; institutional_leave_name?: string | null
  actual_exit_datetime?: string | null; start_datetime?: string | null; end_datetime?: string | null
  hifz_mentor_name?: string | null
}

function displayTime(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(date)
}

/** Anchored, read-only presence list. No return/attendance mutations live here. */
export function OutsideStudentsPopover({ children, count }: { children: ReactElement; count: number | null }) {
  const [open, setOpen] = useState(false)
  const [students, setStudents] = useState<OutsideStudent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState("")
  const [refresh, setRefresh] = useState(0)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    api.get("/leaves/outside-students", { signal: controller.signal }).then(response => {
      if (controller.signal.aborted) return
      if (response.data?.success === false || !Array.isArray(response.data?.students)) throw new Error("Invalid presence response")
      // Old databases may return more than one open leave for a student.
      // This popup lists people, not duplicate leave rows.
      const unique = new Map<string, OutsideStudent>()
      for (const row of response.data.students as OutsideStudent[]) {
        if (!row.adm_no || !row.student_name) continue
        if (!unique.has(row.adm_no)) unique.set(row.adm_no, row)
      }
      setStudents([...unique.values()].sort((a, b) => a.student_name.localeCompare(b.student_name)))
    }).catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, refresh])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return students.filter(student => !query || [student.student_name, student.adm_no, student.standard].some(value => value?.toLowerCase().includes(query)))
  }, [students, search])

  return <Popover.Root open={open} onOpenChange={value => { setOpen(value); if (value) { setSearch(""); setLoading(true); setError(false) } }}>
    <Popover.Trigger asChild>{children}</Popover.Trigger>
    <Popover.Portal>
      <Popover.Content aria-labelledby={titleId} aria-describedby={descriptionId} align="end" sideOffset={10} collisionPadding={12} className="leadership-outside-popover z-[150] flex max-h-[min(560px,var(--radix-popover-content-available-height,calc(100dvh-24px)))] w-[min(390px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-[0_24px_70px_-24px_rgba(15,23,42,0.35)] outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex shrink-0 items-start gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300"><DoorOpen className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><h2 id={titleId} className="text-sm font-bold">Students outside</h2><p id={descriptionId} className="mt-1 text-xs text-slate-500 dark:text-slate-400">{loading ? "Checking campus records…" : error ? "Campus records are unavailable" : `${students.length} student${students.length === 1 ? "" : "s"} currently outside`}</p></div>
          <Popover.Close aria-label="Close outside students" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-800"><X className="h-4 w-4" /></Popover.Close>
        </div>
        {loading ? <div role="status" className="flex min-h-36 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading students…</div> : error ? <div role="alert" className="p-5 text-sm"><p>Could not load the outside students. Please try again.</p><button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-50 px-3 font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200"><RefreshCw className="h-4 w-4" />Retry</button></div> : <>
          <div className="shrink-0 px-4 pb-2 pt-3"><label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 dark:bg-slate-800"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input aria-label="Search outside students" placeholder="Search name, admission no. or class" value={search} onChange={event => setSearch(event.target.value)} className="h-10 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-slate-400 sm:text-xs" /></label></div>
          <div className="min-h-0 max-h-[360px] flex-1 overflow-y-auto overscroll-contain px-2 pb-2 [touch-action:pan-y]">
            {filtered.length ? <ul className="divide-y divide-slate-100 dark:divide-slate-800">{filtered.map(student => {
              const left = displayTime(student.actual_exit_datetime || student.start_datetime)
              const expected = displayTime(student.end_datetime)
              const leave = student.institutional_leave_name || (student.leave_type === "outdoor" ? "Outdoor leave" : "Outside campus")
              return <li key={student.adm_no}><Link href={`/leadership/student/${encodeURIComponent(student.adm_no)}`} onClick={() => setOpen(false)} className="group flex gap-3 rounded-2xl px-2 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-800">
                {student.photo_url ? <img src={resolveBackendUrl(student.photo_url)} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xs font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-200">{student.student_name.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span>}
                <div className="min-w-0 flex-1"><p className="break-words text-xs font-semibold leading-5">{student.student_name}</p><p className="text-[11px] text-slate-500 dark:text-slate-400">{student.adm_no}{student.standard ? ` · ${student.standard}` : ""}</p><p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">{leave}</p>{(left || expected) && <p className="mt-1 flex items-start gap-1 text-[10px] leading-4 text-slate-400"><Clock3 className="mt-0.5 h-3 w-3 shrink-0" /><span>{left && `Left ${left}`}{expected && `${left ? " · " : ""}Return ${expected}`}</span></p>}{student.hifz_mentor_name && <p className="mt-1 truncate text-[10px] text-slate-400">Mentor: {student.hifz_mentor_name}</p>}</div>
                <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-indigo-500" />
              </Link></li>
            })}</ul> : <p className="px-3 py-8 text-center text-xs text-slate-500">{search ? "No students match your search." : "No students are currently listed as outside."}</p>}
          </div>
          {count !== null && count !== students.length && <p className="shrink-0 border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400 dark:border-slate-800">Overview: {count} · Current list: {students.length}. The overview may refresh separately.</p>}
        </>}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
}
