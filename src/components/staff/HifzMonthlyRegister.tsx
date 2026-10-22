"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { addMonths, format, startOfMonth, subMonths } from "date-fns"
import { BookOpen, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, Loader2, Maximize2, Minimize2, Plus, RotateCcw, Save, Table2, Trash2, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import api from "@/lib/api"
import { cn, resolveBackendUrl } from "@/lib/utils"
import { SURAH_LIST } from "@/lib/data/surah-list"
import { getArabic, toArabicNum, calculateCoveredPagesFromLogs } from "@/lib/hifz-progress"
import { groupContinuousSurahEntries } from "@/lib/hifz-entry-ranges"
import { GlassSelect } from "@/components/ui/glass-select"

type Stage = "MEMORIZING" | "HAFIZ_REVISION"
type Activity = "newHifz" | "recentRevision" | "juzRevision" | "newJuzRevision" | "oldJuzRevision"

type Entry = {
  id: string
  mode: string
  entry_date: string
  surah_name?: string | null
  start_v?: number | null
  end_v?: number | null
  juz_number?: number | null
  juz_portion?: string | null
  notes?: string | null
  recorded_by_name?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type Day = {
  date: string
  attendance: { status: string; sessionId: string; sessionName: string; sessionStart: string; sessionEnd: string } | null
  eligibility: { allowed: boolean; reason: string | null; sessionId: string | null; attendanceStatus: string | null }
  entries: Record<Activity, Entry[]>
}

type MonthRegister = {
  student: { id: string; name: string; admNo: string; class: string | null; division: string | null; hifzStage: Stage }
  month: string
  summary: Record<string, number | null>
  days: Day[]
}

type Student = { adm_no: string; name: string; standard: string | null; photo_url?: string | null } | null
type Props = { open: boolean; onClose: () => void; student: Student; onChange?: () => void }
type EditorTarget = { day: Day; activity: Activity } | null
type ViewMode = "weekly" | "cards"

const MONTH_CACHE = new Map<string, MonthRegister>()
const IN_FLIGHT_MONTHS = new Map<string, Promise<MonthRegister>>()
const PORTIONS = ["Full", "1st Half", "2nd Half", "Q1", "Q2", "Q3", "Q4"]
const JUZ_OPTIONS = Array.from({ length: 30 }, (_, index) => ({ value: String(index + 1), label: `Juz ${index + 1}` }))
const PORTION_OPTIONS = PORTIONS.map(portion => ({ value: portion, label: portion }))
const VIEW_STORAGE_KEY = "hifz-register-view"

type SurahMeta = { id: number; name: string; totalVerses: number }
const SURAHS = SURAH_LIST as SurahMeta[]
const SURAH_BY_NAME = new Map(SURAHS.map((surah) => [surah.name, surah]))

const ACTIVITY: Record<Activity, { ar: string; en: string; mode: string; kind: "range" | "juz" }> = {
  newHifz: { ar: "حفظ يومي", en: "New Hifz", mode: "New Verses", kind: "range" },
  recentRevision: { ar: "تسميع", en: "Recent Revision", mode: "Recent Revision", kind: "range" },
  juzRevision: { ar: "مراجعة", en: "Juz Revision", mode: "Juz Revision", kind: "juz" },
  newJuzRevision: { ar: "مراجعة جديدة", en: "New Juz Revision", mode: "Juz Revision (New)", kind: "juz" },
  oldJuzRevision: { ar: "مراجعة قديمة", en: "Old Juz Revision", mode: "Juz Revision (Old)", kind: "juz" },
}

function monthKey(date: Date) {
  return format(startOfMonth(date), "yyyy-MM")
}

function activityKeys(stage: Stage): Activity[] {
  return stage === "HAFIZ_REVISION"
    ? ["newJuzRevision", "oldJuzRevision"]
    : ["newHifz", "recentRevision", "juzRevision"]
}

function portionValue(portion?: string | null) {
  if (portion === "Full") return 1
  if (portion?.includes("Half")) return 0.5
  if (portion?.startsWith("Q")) return 0.25
  return 0
}

function translatePortion(portion?: string | null): string {
  if (!portion) return ""
  if (portion === "Full") return "كامل"
  if (portion === "1st Half") return "نصف ١"
  if (portion === "2nd Half") return "نصف ٢"
  if (portion === "Q1") return "ربع ١"
  if (portion === "Q2") return "ربع ٢"
  if (portion === "Q3") return "ربع ٣"
  if (portion === "Q4") return "ربع ٤"
  return portion
}

type RenderGroup = {
  isCombined: boolean
  startEntry: Entry
  endEntry?: Entry
}

// Compact Arabic chip label for an entry (surah name in Arabic + Arabic-numeral range, or juz).
function entryChip(group: RenderGroup) {
  const start = group.startEntry
  if (group.isCombined && group.endEntry) {
    const end = group.endEntry
    const startName = start.surah_name ? getArabic(start.surah_name) : ""
    const endName = end.surah_name ? getArabic(end.surah_name) : ""
    const startRange = start.start_v ? toArabicNum(start.start_v) : ""
    const endRange = end.end_v ? toArabicNum(end.end_v) : ""

    if (start.surah_name === end.surah_name) {
      return `${startName} ${startRange} - ${endRange}`.trim()
    } else {
      return `${startName} ${startRange} - ${endName} ${endRange}`.trim()
    }
  }

  // Single entry case
  if (start.surah_name) {
    const range = start.start_v ? `${toArabicNum(start.start_v)}${start.end_v ? ` - ${toArabicNum(start.end_v)}` : ""}` : ""
    return `${getArabic(start.surah_name)} ${range}`.trim()
  }
  if (start.juz_number) {
    const portionAr = translatePortion(start.juz_portion)
    return `جزء ${toArabicNum(start.juz_number)}${portionAr ? ` ${portionAr}` : ""}`
  }
  return "مُسجّل"
}

function groupEntries(entries: Entry[]): RenderGroup[] {
  return groupContinuousSurahEntries(entries).map(group => ({
    isCombined: group.length > 1,
    startEntry: group[0],
    endEntry: group.length > 1 ? group[group.length - 1] : undefined,
  }))
}

function entryTooltip(entry: Entry) {
  if (entry.surah_name) return `${entry.surah_name} ${entry.start_v || ""}${entry.end_v ? `-${entry.end_v}` : ""}`.trim()
  if (entry.juz_number) return `Juz ${entry.juz_number}${entry.juz_portion ? ` - ${entry.juz_portion}` : ""}`
  return "Recorded"
}

function attendanceLabel(day: Day) {
  if (!day.attendance) return "No Session"
  const status = day.attendance.status.replaceAll("_", " ")
  if (status === "NOT MARKED") return "Attendance Required"
  return status[0] + status.slice(1).toLowerCase()
}

function dayObj(date: string) {
  return new Date(`${date}T12:00:00`)
}

function useCompactLayout() {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)")
    const update = () => setCompact(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return compact
}

type Week = { index: number; days: Day[]; summary: { pages: number; revisionDays: number; juz: number } }

// Group month days into institutional weeks (Fri-Thu), with a per-week display summary.
function groupIntoWeeks(days: Day[]): Week[] {
  const weeks: Week[] = []
  let current: Day[] = []
  for (const day of days) {
    const weekday = dayObj(day.date).getDay() // 0=Sun..6=Sat
    const isFriday = weekday === 5
    if (isFriday && current.length) {
      weeks.push(buildWeek(weeks.length + 1, current))
      current = []
    }
    current.push(day)
  }
  if (current.length) weeks.push(buildWeek(weeks.length + 1, current))
  return weeks
}

function buildWeek(index: number, days: Day[]): Week {
  const allEntries = days.flatMap((day) => Object.values(day.entries).flat())
  const newHifz = allEntries.filter((entry) => entry.mode === "New Verses")
  const recent = allEntries.filter((entry) => entry.mode === "Recent Revision")
  const juz = allEntries.filter((entry) => entry.mode.startsWith("Juz Revision"))
  // Use the same mushaf-page algorithm the backend/top card use so weekly and
  // monthly page counts agree instead of drifting from a verse-count/15 heuristic.
  const pages = calculateCoveredPagesFromLogs(newHifz)
  const revisionDays = new Set(recent.map((entry) => entry.entry_date.slice(0, 10))).size
  const juzTotal = [...juz, ...recent.filter(entry => entry.juz_number)].reduce((total, entry) => total + (entry.juz_portion ? portionValue(entry.juz_portion) : 0), 0)
  return { index, days, summary: { pages, revisionDays, juz: juzTotal } }
}

/* --------------------------- Surah combobox --------------------------- */

function SurahCombobox({
  value,
  onChange,
  portalContainer,
}: {
  value: string
  onChange: (name: string) => void
  portalContainer?: HTMLElement | null
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? SURAH_BY_NAME.get(value) : undefined
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-label="Select Surah" aria-expanded={open} className="glass-picker-trigger h-10 w-full justify-between rounded-xl px-3 text-sm font-normal">
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <>
                <span dir="rtl" className="font-medium text-slate-900 dark:text-slate-100">{getArabic(selected.name)}</span>
                <span className="truncate text-xs text-slate-500">{selected.name} · {selected.id}</span>
              </>
            ) : <span className="text-slate-400">Select Surah</span>}
          </span>
          <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Portal to document.body (Radix default) — do NOT pass `container`.
          Portalling inside the parent DialogContent clips the popover when the
          trigger sits near the bottom of the dialog (dialog uses overflow-hidden
          and a bounded max-h). The higher z-index below keeps it above the dialog. */}
      <PopoverContent
        className="glass-picker-panel z-[240] w-[min(360px,calc(100vw-1.5rem))] overflow-hidden rounded-[22px] p-1.5"
        align="start"
        sideOffset={8}
        collisionPadding={12}
      >
        <Command
          defaultValue={selected ? `${selected.id} ${selected.name} ${getArabic(selected.name)}` : undefined}
          filter={(itemValue, search) => {
            const term = search.toLowerCase()
            return itemValue.toLowerCase().includes(term) ? 1 : 0
          }}
        >
          <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Choose Surah</div>
          <CommandInput aria-label="Search Surah" placeholder="Search Arabic, English or number…" className="h-11 text-base sm:text-sm" />
          <CommandList
            className="max-h-[min(300px,calc(var(--radix-popover-content-available-height,420px)-90px))] overscroll-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch]"
          >
            <CommandEmpty>No Surah found.</CommandEmpty>
            <CommandGroup>
              {SURAHS.map((surah) => (
                <CommandItem
                  key={surah.id}
                  value={`${surah.id} ${surah.name} ${getArabic(surah.name)}`}
                  aria-current={value === surah.name ? "true" : undefined}
                  className="glass-picker-option min-h-12 cursor-pointer rounded-xl px-3 py-3"
                  onSelect={() => { onChange(surah.name); setOpen(false) }}
                >
                  <span className="flex flex-1 items-center gap-2 truncate">
                    <span dir="rtl" className="min-w-[5rem] font-medium">{getArabic(surah.name)}</span>
                    <span className="truncate text-xs text-muted-foreground">{surah.id}. {surah.name} · {surah.totalVerses} ayahs</span>
                  </span>
                  <Check className={cn("ml-2 h-4 w-4", value === surah.name ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/* --------------------------- Editor --------------------------- */

type DraftItem = {
  id?: string           // existing hifz_logs id, absent for new rows
  surah_name: string
  start_v: string
  end_v: string
  juz_number: string
  juz_portion: string
  recorded_by_name?: string | null
  created_at?: string | null
  updated_at?: string | null
}

function toDraft(entry: Entry): DraftItem {
  return {
    id: entry.id,
    surah_name: entry.surah_name || "",
    start_v: entry.start_v ? String(entry.start_v) : "",
    end_v: entry.end_v ? String(entry.end_v) : "",
    juz_number: entry.juz_number ? String(entry.juz_number) : "",
    juz_portion: entry.juz_portion || "",
    recorded_by_name: entry.recorded_by_name,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  }
}

function emptyDraft(): DraftItem {
  return { surah_name: "", start_v: "", end_v: "", juz_number: "", juz_portion: "" }
}

type RangeDraft = {
  fromSurah: string
  fromAyah: string
  toSurah: string
  toAyah: string
  // A range is stored as individual Surah rows. Keep their IDs so editing or
  // deleting this compact range updates the same underlying rows as one unit.
  entryIds?: string[]
}

function emptyRangeDraft(): RangeDraft {
  return { fromSurah: "", fromAyah: "", toSurah: "", toAyah: "" }
}

function compressEntriesToRanges(entries: DraftItem[]): RangeDraft[] {
  const ranges = groupContinuousSurahEntries(entries.filter(entry => entry.id || entry.surah_name || entry.start_v || entry.end_v))
    .map(group => ({
      fromSurah: group[0].surah_name,
      fromAyah: group[0].start_v,
      toSurah: group[group.length - 1].surah_name,
      toAyah: group[group.length - 1].end_v,
      entryIds: group.flatMap(entry => entry.id ? [entry.id] : []),
    }))
  return ranges.length ? ranges : [emptyRangeDraft()]
}

function expandRangeDrafts(ranges: RangeDraft[]): DraftItem[] {
  const expanded: DraftItem[] = []

  for (const range of ranges) {
    const from = SURAH_BY_NAME.get(range.fromSurah)
    const to = SURAH_BY_NAME.get(range.toSurah)
    const fromAyah = Number(range.fromAyah)
    const toAyah = Number(range.toAyah)

    if (!from || !to || !Number.isInteger(fromAyah) || !Number.isInteger(toAyah)) {
      throw new Error("Select both Surahs and enter the start and end verses.")
    }
    if (fromAyah < 1 || fromAyah > from.totalVerses || toAyah < 1 || toAyah > to.totalVerses) {
      throw new Error("A verse number is outside the selected Surah.")
    }
    if (from.id > to.id || (from.id === to.id && fromAyah > toAyah)) {
      throw new Error("The range end must come after its start.")
    }

    for (const surah of SURAHS) {
      if (surah.id < from.id || surah.id > to.id) continue
      expanded.push({
        surah_name: surah.name,
        start_v: String(surah.id === from.id ? fromAyah : 1),
        end_v: String(surah.id === to.id ? toAyah : surah.totalVerses),
        juz_number: "",
        juz_portion: "",
      })
    }
  }

  return expanded
}

function expandRangesWithSavedIds(ranges: RangeDraft[], originals: DraftItem[]) {
  const originalById = new Map(originals.filter(item => item.id).map(item => [item.id!, item]))
  const unusedIds = new Set(originals.flatMap(item => item.id ? [item.id] : []))
  const items = ranges.flatMap(range => {
    const expanded = expandRangeDrafts([range])
    const saved = (range.entryIds || []).flatMap(id => originalById.has(id) ? [originalById.get(id)!] : [])
    const previous = saved.length ? compressEntriesToRanges(saved) : []
    if (previous.length === 1 && previous[0].fromSurah === range.fromSurah && previous[0].fromAyah === range.fromAyah
      && previous[0].toSurah === range.toSurah && previous[0].toAyah === range.toAyah) {
      // A view change alone must not rewrite or consolidate saved records.
      saved.forEach(item => unusedIds.delete(item.id!))
      return saved
    }
    return expanded.map(row => {
      const original = saved.find(item => item.surah_name === row.surah_name && unusedIds.has(item.id!))
      if (original?.id) unusedIds.delete(original.id)
      return { ...original, ...row, id: original?.id }
    })
  })
  return { items, removedIds: [...unusedIds] }
}

function HifzEntryEditor({ target, onClose, onSave, portalContainer }: {
  target: EditorTarget
  onClose: () => void
  onSave: (target: { day: Day; activity: Activity }, items: DraftItem[], removedIds: string[]) => Promise<void>
  portalContainer?: HTMLElement | null
}) {
  const activity = target?.activity ? ACTIVITY[target.activity] : null
  const existing = useMemo(() => (target ? target.day.entries[target.activity] || [] : []), [target])
  const allowed = target?.day.eligibility.allowed ?? false
  const isRange = activity?.kind === "range"
  const [juzClear, setJuzClear] = useState(false)
  const [juzItems, setJuzItems] = useState<DraftItem[]>([])
  const [items, setItems] = useState<DraftItem[]>([])
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [entryMode, setEntryMode] = useState<"individual" | "range">("individual")
  const [ranges, setRanges] = useState<RangeDraft[]>([emptyRangeDraft()])
  const [rangeRemovedIds, setRangeRemovedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const surahEntries = isRange ? existing.filter(entry => !entry.juz_number) : existing
    const drafts = surahEntries.length ? surahEntries.map(toDraft) : [emptyDraft()]
    setJuzItems(existing.filter(entry => entry.juz_number).map(toDraft))
    setJuzClear(false)
    setItems(drafts)
    setRemovedIds([])
    setRangeRemovedIds([])
    // Restore range-entry records in their compact From → To form. Users can
    // still switch to Daily Entry if they need individual Surah control.
    setEntryMode(isRange && surahEntries.length ? "range" : "individual")
    setRanges(isRange && surahEntries.length ? compressEntriesToRanges(drafts) : [emptyRangeDraft()])
    setError(null)
  }, [existing, isRange, target?.day.date, target?.activity])

  if (!target || !activity) return null

  const setItem = (index: number, patch: Partial<DraftItem>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const addItem = () => setItems((current) => [...current, emptyDraft()])
  const removeItem = async (index: number) => {
    const item = items[index]
    // A saved entry is deleted immediately so it disappears without a separate Save click.
    if (item.id) {
      setSaving(true)
      setError(null)
      try {
        const remaining = items.filter((_, i) => i !== index)
        await onSave({ day: target.day, activity: target.activity }, [...remaining, ...(target.activity === "recentRevision" ? juzItems : [])].filter((row) => row.id), [item.id, ...removedIds])
        if (remaining.some((row) => !row.id)) {
          setItems(remaining)
        } else {
          onClose()
        }
      } catch (cause) {
        const err = cause as { response?: { data?: { error?: string } }; message?: string }
        setError(err?.response?.data?.error || err?.message || "Could not delete this entry.")
      } finally {
        setSaving(false)
      }
      return
    }
    setItems((current) => {
      const next = current.filter((_, i) => i !== index)
      return next.length ? next : [emptyDraft()]
    })
  }

  const setRange = (index: number, patch: Partial<RangeDraft>) =>
    setRanges((current) => current.map((range, i) => (i === index ? { ...range, ...patch } : range)))
  const addRange = () => setRanges((current) => [...current, emptyRangeDraft()])
  const removeRange = (index: number) => {
    const removed = ranges[index]
    if (removed?.entryIds?.length) {
      setRangeRemovedIds((ids) => Array.from(new Set([...ids, ...removed.entryIds!])))
    }
    setRanges(current => current.filter((_, i) => i !== index))
  }

  const switchEntryMode = (next: "individual" | "range") => {
    if (next === entryMode || saving) return
    setError(null)
    try {
      if (next === "range") {
        setRanges(compressEntriesToRanges(items))
        setRangeRemovedIds([])
      } else {
        const nonempty = ranges.filter(range => range.fromSurah || range.fromAyah || range.toSurah || range.toAyah)
        const expanded = expandRangesWithSavedIds(nonempty, items)
        setItems(expanded.items.length ? expanded.items : [emptyDraft()])
        setRemovedIds(ids => Array.from(new Set([...ids, ...rangeRemovedIds, ...expanded.removedIds])))
        setRangeRemovedIds([])
      }
      setEntryMode(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Complete the range before switching entry views.")
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      let saveItems = items
      let deletedIds = removedIds
      if (target.activity === "recentRevision" && juzItems.some(item => (item.juz_number || item.juz_portion) && (!item.juz_number || !item.juz_portion))) {
        throw new Error("Select both the Juz number and portion for each Juz Clear entry.")
      }
      if (entryMode === "range") {
        const expanded = expandRangesWithSavedIds(ranges.filter(range => range.fromSurah || range.fromAyah || range.toSurah || range.toAyah), items)
        saveItems = expanded.items
        deletedIds = Array.from(new Set([...removedIds, ...rangeRemovedIds, ...expanded.removedIds]))
      }
      if (target.activity === "recentRevision") saveItems = [...saveItems, ...juzItems]
      await onSave({ day: target.day, activity: target.activity }, saveItems, deletedIds)
      onClose()
    } catch (cause) {
      const err = cause as { response?: { data?: { error?: string } }; message?: string }
      setError(err?.response?.data?.error || err?.message || "Could not save this entry.")
    } finally {
      setSaving(false)
    }
  }

  const showFields = allowed || existing.length > 0
  const hasRangeValue = ranges.some((range) => range.fromSurah || range.toSurah || range.fromAyah || range.toAyah)
  const canSave = showFields && (juzItems.some(item => item.juz_number) || (entryMode === "range"
    ? hasRangeValue || removedIds.length > 0 || rangeRemovedIds.length > 0
    : items.some((item) => (isRange ? item.surah_name : item.juz_number) || item.id) || removedIds.length > 0))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 text-left">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <DialogTitle className="flex items-center gap-2 font-semibold text-slate-900">
              <span dir="rtl" className="text-base">{activity.ar}</span>
              <span className="text-xs font-medium text-slate-500">{activity.en}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">{format(dayObj(target.day.date), "EEE, d MMMM yyyy")}</DialogDescription>
          </div>
          {isRange && <div role="group" aria-label="Entry layout" className="flex shrink-0 rounded-lg border border-emerald-100 bg-emerald-50/50 p-1">
            {target.activity === "recentRevision" && <button type="button" aria-pressed={juzClear} disabled={saving} onClick={() => { setJuzClear(value => !value); setJuzItems(value => value.length ? value : [emptyDraft()]) }} className={cn('rounded-md px-2 py-1.5 text-[11px] font-semibold', juzClear ? 'bg-emerald-700 text-white' : 'text-emerald-700')}>Juz Clear</button>}
            {([['individual', 'Daily Entry'], ['range', 'Range Entry']] as const).map(([mode, label]) => <button key={mode} type="button" aria-pressed={!juzClear && entryMode === mode} disabled={saving} onClick={() => { switchEntryMode(mode); setJuzClear(false) }} className={cn('rounded-md px-2 py-1.5 text-[11px] font-semibold transition', !juzClear && entryMode === mode ? 'bg-emerald-700 text-white shadow-sm' : 'text-emerald-700 hover:bg-emerald-100')}>{label}</button>)}
          </div>}
        </div>
      </DialogHeader>

      {!showFields && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{target.day.eligibility.reason}</p>
        </div>
      )}

      {showFields && (
        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]"

        >
          {juzClear ? <>
            <p className="text-xs text-slate-500">Earn one Recent Revision day plus proportional Juz Revision credit. The usual Juz eligibility and monthly limits apply.</p>
            {juzItems.map((item, index) => <div key={item.id || index} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between"><Label>Juz Clear {index + 1}</Label><button type="button" disabled={saving} className="text-xs text-red-500" onClick={() => { if (item.id) setRemovedIds(ids => [...ids, item.id!]); setJuzItems(rows => rows.filter((_, i) => i !== index)) }}>Delete</button></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 text-xs"><Label className="text-xs">Juz number</Label><GlassSelect label={`Juz Clear ${index + 1} number`} placeholder="Select Juz" value={item.juz_number} options={JUZ_OPTIONS} onValueChange={value => setJuzItems(rows => rows.map((row, i) => i === index ? { ...row, juz_number: value } : row))} /></div>
                <div className="space-y-1 text-xs"><Label className="text-xs">Portion</Label><GlassSelect label={`Juz Clear ${index + 1} portion`} placeholder="Select portion" value={item.juz_portion} options={PORTION_OPTIONS} onValueChange={value => setJuzItems(rows => rows.map((row, i) => i === index ? { ...row, juz_portion: value } : row))} /></div>
              </div>
            </div>)}
            <Button type="button" variant="outline" size="sm" onClick={() => setJuzItems(rows => [...rows, emptyDraft()])} className="w-full border-dashed"><Plus className="mr-2 h-4 w-4" />Add another Juz</Button>
          </> : entryMode === "range" ? (
            <>
              <p className="text-xs text-slate-500">Each continuous portion stays together from its starting Surah and Ayah to its ending Surah and Ayah.</p>
              {ranges.map((range, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Range {index + 1}</span>
                    {(ranges.length > 1 || range.entryIds?.length) && (
                      <button type="button" onClick={() => removeRange(index)} className="flex items-center gap-1 text-xs font-medium text-red-500 hover:underline">
                        <Trash2 className="h-3.5 w-3.5" />Delete range
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Start Surah / Ayah</Label>
                      <SurahCombobox value={range.fromSurah} onChange={(name) => setRange(index, { fromSurah: name })} portalContainer={portalContainer} />
                      <Input type="number" min="1" placeholder="Verse" value={range.fromAyah} onChange={(event) => setRange(index, { fromAyah: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">End Surah / Ayah</Label>
                      <SurahCombobox value={range.toSurah} onChange={(name) => setRange(index, { toSurah: name })} portalContainer={portalContainer} />
                      <Input type="number" min="1" placeholder="Verse" value={range.toAyah} onChange={(event) => setRange(index, { toAyah: event.target.value })} />
                    </div>
                  </div>
                  {range.fromSurah && range.toSurah && range.fromAyah && range.toAyah && <p className="mt-3 rounded-md bg-emerald-50 px-2.5 py-2 text-xs font-medium text-emerald-800">{range.fromSurah} {range.fromAyah} → {range.toSurah} {range.toAyah}</p>}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addRange} className="w-full border-dashed">
                <Plus className="mr-2 h-4 w-4" />Add another range
              </Button>
            </>
          ) : (
            <>
              {items.map((item, index) => (
                <div key={item.id || `new-${index}`} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {isRange ? "Surah" : "Juz"} {index + 1}
                    </span>
                    {(items.length > 1 || item.id) && (
                      <button type="button" onClick={() => removeItem(index)} className="flex items-center gap-1 text-xs font-medium text-red-500 hover:underline">
                        <Trash2 className="h-3.5 w-3.5" />Delete
                      </button>
                    )}
                  </div>
                  {isRange ? (
                    <div className="space-y-2">
                      <SurahCombobox value={item.surah_name} onChange={(name) => setItem(index, { surah_name: name })} portalContainer={portalContainer} />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1"><Label className="text-xs">Start verse</Label><Input type="number" min="1" value={item.start_v} onChange={(event) => setItem(index, { start_v: event.target.value })} /></div>
                        <div className="space-y-1"><Label className="text-xs">End verse</Label><Input type="number" min="1" value={item.end_v} onChange={(event) => setItem(index, { end_v: event.target.value })} /></div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Juz number</Label>
                        <GlassSelect label={`Juz ${index + 1} number`} placeholder="Select Juz" value={item.juz_number} options={JUZ_OPTIONS} onValueChange={value => setItem(index, { juz_number: value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Portion</Label>
                        <GlassSelect label={`Juz ${index + 1} portion`} placeholder="Select portion" value={item.juz_portion} options={PORTION_OPTIONS} onValueChange={value => setItem(index, { juz_portion: value })} />
                      </div>
                    </div>
                  )}
                  {item.id && (item.recorded_by_name || item.created_at) && (
                    <p className="mt-2 text-[11px] text-slate-400">
                      Recorded by {item.recorded_by_name || "mentor"}
                      {item.created_at ? ` on ${format(new Date(item.created_at), "d MMM yyyy, HH:mm")}` : ""}
                      {item.updated_at ? ` · edited ${format(new Date(item.updated_at), "d MMM yyyy, HH:mm")}` : ""}
                    </p>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full border-dashed">
                <Plus className="mr-2 h-4 w-4" />{isRange ? "Add another Surah" : "Add another Juz"}
              </Button>
            </>
          )}
        </div>
      )}

      {error && <p className="shrink-0 px-5 pb-2 text-sm text-red-600">{error}</p>}

      <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="button" onClick={save} disabled={saving || !canSave}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save
        </Button>
      </div>
    </div>
  )
}
/* --------------------------- Cells & layouts --------------------------- */

function HifzCell({ day, activity, onOpen }: { day: Day; activity: Activity; onOpen: () => void }) {
  const entries = day.entries[activity] || []
  const canOpen = entries.length > 0 || day.eligibility.allowed

  const colorMap: Record<Activity, { bg: string; text: string; border: string }> = {
    newHifz: { bg: "bg-blue-50/70 hover:bg-blue-100/70", text: "text-blue-600", border: "border-blue-100" },
    recentRevision: { bg: "bg-orange-50/70 hover:bg-orange-100/70", text: "text-orange-600", border: "border-orange-100" },
    juzRevision: { bg: "bg-emerald-50/70 hover:bg-emerald-100/70", text: "text-emerald-600", border: "border-emerald-100" },
    newJuzRevision: { bg: "bg-blue-50/70 hover:bg-blue-100/70", text: "text-blue-600", border: "border-blue-100" },
    oldJuzRevision: { bg: "bg-orange-50/70 hover:bg-orange-100/70", text: "text-orange-600", border: "border-orange-100" },
  }

  const colors = colorMap[activity] || { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-100" }
  const groups = useMemo(() => groupEntries(entries), [entries])

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!canOpen}
      title={entries.length ? entries.map(entryTooltip).join(", ") : day.eligibility.reason || "Add Hifz entry"}
      className={cn(
        "min-h-0 w-full rounded-md py-0.5 flex items-center justify-center text-center text-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300",
        canOpen ? "hover:bg-slate-50/80 cursor-pointer" : "cursor-not-allowed opacity-90"
      )}
      data-register-cell={`${day.date}-${activity}`}
    >
      {groups.length ? (
        <div className="flex w-full flex-col items-center justify-center gap-0.5">
          {groups.map((group, idx) => (
            <span key={idx} className={cn("inline-flex min-w-0 max-w-full flex-col items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-tight shadow-none transition sm:px-2 sm:text-[11px]", colors.bg, colors.text, colors.border)}>
              <span dir="rtl" className="block w-full min-w-0 break-words whitespace-normal text-center">{entryChip(group)}</span>
            </span>
          ))}
        </div>
      ) : (
        <span className="block text-slate-300 font-normal select-none w-full text-center">—</span>
      )}
    </button>
  )
}

function ColumnHeader({ activity }: { activity: Activity }) {
  const labelMap: Record<Activity, string> = {
    newHifz: "حفظ يومي (New Hifz)",
    recentRevision: "تسميع (Revision)",
    juzRevision: "مراجعة (Juz Rev)",
    newJuzRevision: "مراجعة جديدة (New Rev)",
    oldJuzRevision: "مراجعة قديمة (Old Rev)",
  }
  return (
    <span className="block break-words text-center text-[10px] font-bold leading-4 text-slate-500 sm:text-xs">
      {labelMap[activity] || activity}
    </span>
  )
}

function getColumnSummary(days: Day[], activity: Activity): string {
  const entries = days.flatMap((day) => day.entries[activity] || [])
  if (activity === "newHifz") {
    const pages = calculateCoveredPagesFromLogs(entries)
    return `${pages} pages`
  }
  if (activity === "recentRevision") {
    const uniqueDays = new Set(entries.map((entry) => entry.entry_date.slice(0, 10))).size
    return `${uniqueDays} days`
  }
  if (["juzRevision", "newJuzRevision", "oldJuzRevision"].includes(activity)) {
    const totalJuz = entries.reduce((total, entry) => total + (entry.juz_portion ? portionValue(entry.juz_portion) : 0), 0)
    return `${totalJuz} Juz`
  }
  return ""
}

function DesktopWeeklyRegister({ weeks, columns, renderCell }: {
  weeks: Week[]
  columns: Activity[]
  renderCell: (day: Day, activity: Activity) => React.ReactNode
}) {
  const activityWidths = columns.length === 3
    ? ["30%", "27%", "27%"]
    : columns.map(() => `${84 / columns.length}%`)

  return (
    <div className="space-y-5">
      {weeks.map((week) => (
        <section key={week.index} className="overflow-hidden rounded-[20px] border border-slate-200 bg-white">
          <div className="flex h-10 items-center bg-indigo-50/80 px-4 text-sm font-semibold text-indigo-600">
            Week {week.index}
          </div>
          <table className="w-full max-w-full table-fixed border-collapse text-left text-[11px] sm:text-sm">
            <colgroup>
              <col style={{ width: "16%" }} />
              {columns.map((activity, index) => <col key={activity} style={{ width: activityWidths[index] }} />)}
            </colgroup>
            <thead>
              <tr className="h-10 border-y border-slate-100 bg-slate-50/90">
                <th className="min-w-0 px-2 py-1 align-middle text-[10px] font-semibold text-slate-500 sm:px-3 sm:text-xs">Date</th>
                {columns.map((activity) => (
                  <th key={activity} className="min-w-0 px-1 py-1 align-middle text-center text-[10px] font-semibold text-slate-500 sm:px-2 sm:text-xs">
                    <ColumnHeader activity={activity} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {week.days.map((day) => {
                const hasEntries = columns.some((activity) => (day.entries[activity] || []).length > 0)
                const isFriday = format(dayObj(day.date), "EEE") === "Fri"
                return (
                  <tr key={day.date} className={cn("h-10 border-b border-slate-100 last:border-0", hasEntries ? "bg-emerald-50/30" : isFriday ? "bg-amber-50/35" : "bg-white")}>
                    <td className="min-w-0 whitespace-nowrap px-2 py-1 align-middle font-medium text-slate-700 sm:px-3">
                      <span className="mr-1 text-sm font-semibold text-slate-900">{format(dayObj(day.date), "d")}</span>
                      <span className="text-[10px] font-normal text-slate-400 sm:text-xs">{format(dayObj(day.date), "EEE")}</span>
                      {day.attendance?.status === "PRESENT" && (
                        <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" title="Present" />
                      )}
                      {day.attendance?.status === "LATE" && (
                        <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" title="Late" />
                      )}
                    </td>
                    {columns.map((activity) => (
                      <td key={activity} className="min-w-0 px-1 py-0.5 align-middle sm:px-2">
                        {renderCell(day, activity)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="h-10 border-t border-slate-200 bg-slate-100/80 text-xs font-semibold text-slate-600">
                <td className="min-w-0 px-2 py-1 text-left text-[10px] font-semibold text-slate-500 sm:px-3 sm:text-xs">Summary</td>
                {columns.map((activity) => {
                  const summaryStr = getColumnSummary(week.days, activity)
                  const colorClass = activity === "newHifz" || activity === "newJuzRevision"
                    ? "text-blue-600"
                    : activity === "recentRevision" || activity === "oldJuzRevision"
                      ? "text-orange-600"
                      : "text-emerald-600"
                  return (
                    <td key={activity} className={cn("min-w-0 px-1 py-1 align-middle text-center text-[10px] sm:px-2 sm:text-xs", colorClass)}>
                      {summaryStr}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </section>
      ))}
    </div>
  )
}
// Mobile day-card renderer.
function MobileDayCardRegister({ weeks, columns, onOpen }: {
  weeks: Week[]
  columns: Activity[]
  onOpen: (day: Day, activity: Activity) => void
}) {
  return (
    <div className="space-y-5">
      {weeks.map((week) => (
        <div key={week.index} className="space-y-2">
          <div className="flex items-center justify-between px-1 text-xs font-semibold text-slate-500">
            <span>Week {week.index}</span>
            <span className="font-normal">{week.summary.pages} pages · {week.summary.revisionDays} rev · {week.summary.juz} Juz</span>
          </div>
          {week.days.map((day) => {
            const blocked = !day.eligibility.allowed && columns.every((activity) => (day.entries[activity] || []).length === 0)
            return (
              <div key={day.date} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">{format(dayObj(day.date), "d EEE")}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium",
                    day.attendance?.status === "PRESENT" ? "bg-emerald-50 text-emerald-700"
                      : day.attendance?.status === "LATE" ? "bg-amber-50 text-amber-700"
                        : "bg-slate-100 text-slate-600")}>
                    {attendanceLabel(day)}{day.attendance ? ` · ${day.attendance.sessionName}` : ""}
                  </span>
                </div>
                {blocked ? (
                  <p className="mt-2 text-xs italic text-slate-400">{day.eligibility.reason}</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {columns.map((activity) => {
                      const entries = day.entries[activity] || []
                      const canOpen = entries.length > 0 || day.eligibility.allowed
                      const meta = ACTIVITY[activity]
                      return (
                        <button
                          key={activity}
                          type="button"
                          disabled={!canOpen}
                          onClick={() => onOpen(day, activity)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition",
                            entries.length ? "border-blue-200 bg-blue-50" : canOpen ? "border-dashed border-slate-200 hover:border-blue-300" : "cursor-not-allowed border-transparent bg-slate-50/50",
                          )}
                        >
                          <span className="flex flex-col">
                            <span dir="rtl" className="text-sm font-semibold text-slate-700">{meta.ar}</span>
                            <span className="text-[11px] text-slate-400">{meta.en}</span>
                          </span>
                          <span className="text-right text-xs">
                            {entries.length ? (
                              <span className="flex flex-col items-end gap-0.5">
                                {groupEntries(entries).map((group, idx) => (
                                  <span key={idx} dir="rtl" className="font-medium text-blue-800">{entryChip(group)}</span>
                                ))}
                              </span>
                            ) : (
                              <span className="text-slate-400">{canOpen ? "+ Add" : "—"}</span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* --------------------------- Main component --------------------------- */

export function HifzMonthlyRegister({ open, onClose, student, onChange }: Props) {
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()))
  const [register, setRegister] = useState<MonthRegister | null>(null)
  const [loading, setLoading] = useState(false)
  const [editor, setEditor] = useState<EditorTarget>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const compact = useCompactLayout()
  const [view, setView] = useState<ViewMode>("weekly")
  const requestRef = useRef<AbortController | null>(null)
  const month = monthKey(monthDate)
  const cacheKey = student ? `${student.adm_no}:${month}` : ""

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(VIEW_STORAGE_KEY) : null
    if (stored === "weekly" || stored === "cards") setView(stored)
    else setView(compact ? "cards" : "weekly")
  }, [compact])

  const chooseView = (next: ViewMode) => {
    setView(next)
    try { window.localStorage.setItem(VIEW_STORAGE_KEY, next) } catch { /* ignore */ }
  }

  const loadMonth = useCallback(async () => {
    if (!student || !open) return
    const cached = MONTH_CACHE.get(cacheKey)
    if (cached) { setRegister(cached); return }
    const inFlight = IN_FLIGHT_MONTHS.get(cacheKey)
    if (inFlight) {
      try { setRegister(await inFlight) } catch (error) { if ((error as { name?: string })?.name !== "CanceledError") setRegister(null) }
      return
    }
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    const request = api.get(`/hifz/students/${student.adm_no}/month`, { params: { month }, signal: controller.signal })
      .then((response) => response.data as MonthRegister)
      .then((data) => { MONTH_CACHE.set(cacheKey, data); return data })
      .finally(() => IN_FLIGHT_MONTHS.delete(cacheKey))
    IN_FLIGHT_MONTHS.set(cacheKey, request)
    try { setRegister(await request) } catch (error) { if ((error as { name?: string })?.name !== "CanceledError") setRegister(null) } finally { if (!controller.signal.aborted) setLoading(false) }
  }, [cacheKey, month, open, student])

  useEffect(() => { if (open && student) setMonthDate(startOfMonth(new Date())) }, [open, student?.adm_no])
  useEffect(() => { void loadMonth(); return () => requestRef.current?.abort() }, [loadMonth])

  // Persist the last monthRegister returned by a write so the UI updates without a dashboard reload.
  const applyRegister = (updated?: MonthRegister) => {
    if (!updated || !student) return
    MONTH_CACHE.set(`${student.adm_no}:${updated.month}`, updated)
    setRegister(updated)
  }

  const saveCell = async (targetCell: { day: Day; activity: Activity }, items: DraftItem[], removedIds: string[]) => {
    if (!student) return
    const meta = ACTIVITY[targetCell.activity]
    const basePayload = (item: DraftItem) => ({
      surah_name: meta.kind === "range" ? (item.surah_name || null) : null,
      start_v: meta.kind === "range" && item.start_v ? Number(item.start_v) : null,
      end_v: meta.kind === "range" && item.end_v ? Number(item.end_v) : null,
      juz_number: (meta.kind === "juz" || targetCell.activity === "recentRevision") && item.juz_number ? Number(item.juz_number) : null,
      juz_portion: (meta.kind === "juz" || targetCell.activity === "recentRevision") ? (item.juz_portion || null) : null,
    })
    const hasValue = (item: DraftItem) => (meta.kind === "range" ? !!item.surah_name || (targetCell.activity === "recentRevision" && !!item.juz_number) : !!item.juz_number)
    const nullableNumber = (value: number | null | undefined) => value == null ? null : Number(value)
    const originals = new Map(targetCell.day.entries[targetCell.activity].map((entry) => [entry.id, entry]))

    // A range expansion can contain many Surahs. Send only genuinely new/changed
    // rows and let the server apply the whole cell edit in one transaction.
    const emptiedIds = items.filter((item) => item.id && !hasValue(item)).map((item) => item.id!)
    const deleteIds = Array.from(new Set([...removedIds, ...emptiedIds]))
    const deleted = new Set(deleteIds)
    const creates: ReturnType<typeof basePayload>[] = []
    const updates: Array<ReturnType<typeof basePayload> & { id: string }> = []

    for (const item of items) {
      if (!hasValue(item) || (item.id && deleted.has(item.id))) continue
      const payload = basePayload(item)
      if (!item.id) {
        creates.push(payload)
        continue
      }

      const original = originals.get(item.id)
      const unchanged = !!original
        && (original.surah_name || null) === payload.surah_name
        && nullableNumber(original.start_v) === payload.start_v
        && nullableNumber(original.end_v) === payload.end_v
        && nullableNumber(original.juz_number) === payload.juz_number
        && (original.juz_portion || null) === payload.juz_portion
      if (!unchanged) updates.push({ id: item.id, ...payload })
    }

    if (creates.length === 0 && updates.length === 0 && deleteIds.length === 0) return

    const response = await api.post("/hifz/entries/batch", {
      student_id: student.adm_no,
      entry_date: targetCell.day.date,
      session_id: targetCell.day.eligibility.sessionId,
      mode: meta.mode,
      creates,
      updates,
      delete_ids: deleteIds,
    })
    const updated = response.data?.monthRegister as MonthRegister | undefined
    if (updated) {
      applyRegister(updated)
    } else {
      // The write is already committed. A rare hydration failure should refresh
      // the view, never make the user retry a successful save.
      MONTH_CACHE.delete(cacheKey)
      await loadMonth()
    }
    onChange?.()
  }

  const columns = useMemo(() => (register ? activityKeys(register.student.hifzStage) : []), [register])
  const weeks = useMemo(() => (register ? groupIntoWeeks(register.days) : []), [register])

  const summaryCards = useMemo(() => {
    if (!register) return []
    const isHafiz = register.student.hifzStage === "HAFIZ_REVISION"
    if (isHafiz) {
      return [
        {
          label: "New revision",
          value: register.summary.newJuzRevisionTotal ?? 0,
          bg: "bg-blue-50/50 border border-blue-100/50",
          text: "text-blue-600",
        },
        {
          label: "Old revision",
          value: register.summary.oldJuzRevisionTotal ?? 0,
          bg: "bg-orange-50/50 border border-orange-100/50",
          text: "text-orange-600",
        },
        {
          label: "Revision days",
          value: register.summary.revisionDays ?? 0,
          bg: "bg-emerald-50/50 border border-emerald-100/50",
          text: "text-emerald-600",
        },
        {
          label: "Juz completed",
          value: `${register.summary.completedJuz ?? 0} / 30`,
          bg: "bg-violet-50/50 border border-violet-100/50",
          text: "text-violet-600",
        },
      ]
    } else {
      return [
        {
          label: "New Hifz pages",
          value: register.summary.newHifzPages ?? 0,
          bg: "bg-blue-50/50 border border-blue-100/50",
          text: "text-blue-600",
        },
        {
          label: "Revision days",
          value: register.summary.revisionDays ?? 0,
          bg: "bg-orange-50/50 border border-orange-100/50",
          text: "text-orange-600",
        },
        {
          label: "Juz revised",
          value: register.summary.juzRevised ?? 0,
          bg: "bg-emerald-50/50 border border-emerald-100/50",
          text: "text-emerald-600",
        },
        {
          label: "Juz completed",
          value: `${register.summary.completedJuz ?? 0} / 30`,
          bg: "bg-violet-50/50 border border-violet-100/50",
          text: "text-violet-600",
        },
      ]
    }
  }, [register])

  const [entryDialogNode, setEntryDialogNode] = useState<HTMLDivElement | null>(null)

  const editorNode = (
    <HifzEntryEditor
      target={editor}
      onClose={() => setEditor(null)}
      onSave={saveCell}
      portalContainer={entryDialogNode}
    />
  )

  const renderCell = (day: Day, activity: Activity) => (
    <HifzCell day={day} activity={activity} onOpen={() => setEditor({ day, activity })} />
  )

  const useCards = false

  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
    <DialogContent showCloseButton={false} className={cn("flex min-h-0 flex-col gap-0 overflow-hidden p-0", fullscreen ? "h-[96vh] max-h-[96vh] max-w-[98vw]" : "h-[92vh] max-h-[92vh] max-w-6xl")}>
      <DialogHeader className="border-b px-5 py-4 text-left">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10"><AvatarImage src={resolveBackendUrl(student?.photo_url)} /><AvatarFallback>{student?.name?.[0] || "H"}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base font-bold text-slate-800 uppercase tracking-wide">
                {register?.student.name || student?.name || "Hifz progress"}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 font-medium">
                {register?.student.admNo || student?.adm_no} · {register?.student.class || student?.standard || ""} · Hifz Progress
              </DialogDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close progress register"><X className="h-4 w-4" /></Button>
        </div>
      </DialogHeader>
      <div className="flex items-center justify-between border-b bg-slate-50/50 px-4 py-2">
        <Button variant="ghost" size="icon" onClick={() => setMonthDate((value) => subMonths(value, 1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4 text-slate-600" /></Button>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Calendar className="h-4 w-4 text-slate-500" />{format(monthDate, "MMMM yyyy")}</div>
        <div className="flex items-center gap-1"><Button variant="ghost" size="sm" className="text-slate-600 text-xs font-semibold" onClick={() => setMonthDate(startOfMonth(new Date()))}>Today</Button><Button variant="ghost" size="icon" onClick={() => setMonthDate((value) => addMonths(value, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4 text-slate-600" /></Button></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 [touch-action:pan-y]">
        {loading && !register ? <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div> : register ? <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {summaryCards.map((card) => {
              return (
                <div key={card.label} className={cn("rounded-xl p-4 flex flex-col justify-center items-start text-left h-20 shadow-sm border transition-all duration-200", card.bg)}>
                  <span className={cn("text-xs font-semibold tracking-normal", card.text)}>
                    {card.label}
                  </span>
                  <div className={cn("text-2xl font-bold tracking-tight mt-1", card.text)}>
                    {card.value}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            WEEKLY HIFZ REPORT — Monthly breakdown by week
          </div>
          {useCards
            ? <MobileDayCardRegister weeks={weeks} columns={columns} onOpen={(day, activity) => setEditor({ day, activity })} />
            : <DesktopWeeklyRegister weeks={weeks} columns={columns} renderCell={renderCell} />}
        </> : <div className="py-16 text-center text-sm text-slate-500">Could not load this month.</div>}
      </div>
      <Dialog open={!!editor} onOpenChange={(value) => !value && setEditor(null)}>
        <DialogContent
          ref={setEntryDialogNode}
          showCloseButton={false}
          overlayClassName="z-[70] bg-slate-950/55"
          className="z-[80] flex min-h-0 w-[440px] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200 p-0 shadow-2xl max-h-[min(590px,calc(100dvh-2rem))] sm:max-w-[440px]"
        >
          {editorNode}
        </DialogContent>
      </Dialog>
    </DialogContent>
  </Dialog>
}
