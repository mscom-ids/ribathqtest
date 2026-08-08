"use client"

import type { ReactNode } from "react"
import { Clock, Lock, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getAttendanceGroupState,
  groupAttendanceSessionSchedules,
  type AttendanceScheduleLike,
} from "@/lib/attendance-session-groups"

type SlotStatus = { state?: string; startTime?: string; [key: string]: unknown }

type ClassColor = { bg: string; border: string; badge: string; text: string }

type Props<T extends AttendanceScheduleLike> = {
  schedules: T[]
  getSlotStatus: (schedule: T) => SlotStatus
  getClassColor: (department: string) => ClassColor
  formatTime: (time?: string) => string
  parseStandards: (schedule: T) => string[]
  onOpenRoster: (schedule: T, mentorId?: string) => void
  renderScheduleTools?: (schedule: T, status: SlotStatus) => ReactNode
  renderScheduleDetails?: (schedule: T, status: SlotStatus) => ReactNode
}

const stateLabel = (state: string) => {
  if (state === "completed") return "Submitted"
  if (state === "partial") return "Partially submitted"
  if (state === "cancelled") return "Cancelled"
  if (state === "upcoming") return "Upcoming"
  if (state === "locked") return "Locked"
  return "Ready to mark"
}

const stateTone = (state: string) => {
  if (state === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
  if (state === "partial") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
  if (state === "cancelled") return "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
  if (state === "upcoming" || state === "locked") return "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
  return "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-300"
}

function mentorRows(schedule: AttendanceScheduleLike, status: SlotStatus) {
  const expected = Array.isArray(schedule.expected_mentors) ? schedule.expected_mentors : []
  const marked = new Set(
    (Array.isArray(status.markedExpected) ? status.markedExpected : [])
      .map((mentor: any) => String(mentor?.id || ""))
      .filter(Boolean),
  )
  const pending = new Set(
    (Array.isArray(status.pendingExpected) ? status.pendingExpected : [])
      .map((mentor: any) => String(mentor?.id || ""))
      .filter(Boolean),
  )
  const ownerId = String(schedule.mentor_id || "").trim()
  if (ownerId) {
    const ownerFromExpected = expected.find((mentor: any) => String(mentor?.id || "") === ownerId)
    const ownerName = String(schedule.mentor_name || ownerFromExpected?.name || "Assigned mentor").trim()
    const ownerMarked = marked.has(ownerId)
    const hasUnexpectedSubmission = Array.isArray(status.unexpectedMarks) && status.unexpectedMarks.length > 0
    const state = status.state === "cancelled"
      ? "cancelled"
      : ownerMarked
        ? "marked"
        : status.state === "completed" || hasUnexpectedSubmission
          ? "submitted"
          : "pending"

    return [{ id: ownerId, name: ownerName, state }]
  }

  const rows = expected
    .map((mentor: any) => ({ id: String(mentor?.id || mentor?.name || ""), name: String(mentor?.name || "").trim() }))
    .filter((mentor: { id: string; name: string }) => mentor.name)
  if (rows.length > 0) {
    const activeExpectedIds = new Set(
      (Array.isArray(status.expected) ? status.expected : expected)
        .map((mentor: any) => String(mentor?.id || mentor?.name || ""))
        .filter(Boolean),
    )
    return rows.map(mentor => ({
      ...mentor,
      // Detailed per-mentor state is supplied by the Hifz/department page.
      // The general dashboard currently receives a schedule-level state, so
      // we deliberately label it as such instead of claiming each mentor has
      // marked separately.
      state: status.state === "cancelled" || !activeExpectedIds.has(mentor.id)
        ? "cancelled"
        : marked.has(mentor.id)
          ? "marked"
          : pending.has(mentor.id)
            ? "pending"
            : status.state === "completed"
              ? "submitted"
              : "pending",
    }))
  }
  const direct = String(schedule.mentor_name || "").trim()
  return [{ id: direct || "unassigned", name: direct || "Unassigned mentor", state: status.state === "completed" ? "submitted" : "pending" }]
}

type MentorAggregate<T extends AttendanceScheduleLike> = {
  id: string
  name: string
  state: "marked" | "pending" | "submitted" | "cancelled"
  standards: string[]
  primarySchedule: T
  primaryStatus: SlotStatus
}

// Precedence: the mentor's overall state is the "best" state across every
// child schedule they belong to.  A mentor who marked one class but hasn't
// touched a second still reads as "pending" so the operator sees work left.
const STATE_RANK: Record<string, number> = {
  cancelled: 0,
  pending: 1,
  submitted: 2,
  marked: 3,
}

function collapseMentorsAcrossSchedules<T extends AttendanceScheduleLike>(
  schedules: T[],
  getSlotStatus: (schedule: T) => SlotStatus,
  parseStandards: (schedule: T) => string[],
): MentorAggregate<T>[] {
  const byMentor = new Map<string, MentorAggregate<T>>()

  for (const schedule of schedules) {
    const status = getSlotStatus(schedule)
    const rows = mentorRows(schedule, status)
    const stds = parseStandards(schedule)

    for (const mentor of rows) {
      const existing = byMentor.get(mentor.id)
      const mentorState = mentor.state as MentorAggregate<T>["state"]

      if (!existing) {
        byMentor.set(mentor.id, {
          id: mentor.id,
          name: mentor.name,
          state: mentorState,
          standards: [...stds],
          primarySchedule: schedule,
          primaryStatus: status,
        })
        continue
      }

      // Merge standards without duplication.
      for (const std of stds) if (!existing.standards.includes(std)) existing.standards.push(std)

      // Pick the more actionable state.  "pending" beats "marked" so the
      // operator still sees remaining work.
      const preferPending = existing.state === "pending" || mentorState === "pending"
      if (preferPending && existing.state !== "pending") {
        existing.state = "pending"
        existing.primarySchedule = schedule
        existing.primaryStatus = status
      } else if (!preferPending && STATE_RANK[mentorState] > STATE_RANK[existing.state]) {
        existing.state = mentorState
        existing.primarySchedule = schedule
        existing.primaryStatus = status
      }
    }
  }

  return Array.from(byMentor.values()).sort((a, b) => {
    // Pending mentors first so unfinished work surfaces.
    const rankDiff = STATE_RANK[a.state] - STATE_RANK[b.state]
    if (rankDiff !== 0) return rankDiff
    return a.name.localeCompare(b.name)
  })
}

/**
 * One visual card per actual session slot. Child rows remain bound to the
 * original schedule ID so opening, marking, reviewing and cancellation keep
 * their existing behaviour and never merge attendance data.
 */
export function GroupedAttendanceSessionCards<T extends AttendanceScheduleLike>({
  schedules,
  getSlotStatus,
  getClassColor,
  formatTime,
  parseStandards,
  onOpenRoster,
  renderScheduleTools,
  renderScheduleDetails,
}: Props<T>) {
  const sessionGroups = groupAttendanceSessionSchedules(schedules)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 p-5">
      {sessionGroups.map(group => {
        const groupState = getAttendanceGroupState(group.schedules.map(schedule => getSlotStatus(schedule).state || "active"))
        const color = getClassColor(group.department)
        const completedRows = group.schedules.filter(schedule => getSlotStatus(schedule).state === "completed").length
        const cancelledRows = group.schedules.filter(schedule => getSlotStatus(schedule).state === "cancelled").length
        const mentorCount = new Set(
          group.schedules.flatMap(schedule => mentorRows(schedule, getSlotStatus(schedule)).map(mentor => mentor.id)),
        ).size

        return (
          <section
            key={group.key}
            className={cn("overflow-hidden rounded-xl border-2", color.bg, color.border)}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 p-4 dark:border-slate-700/70">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full text-white", color.badge)}>
                    {group.department}
                  </span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", stateTone(groupState))}>
                    {stateLabel(groupState)}
                  </span>
                </div>
                <h3 className="mt-2 truncate text-[16px] font-bold text-slate-800 dark:text-white">{group.subjectLabel}</h3>
                <p className={cn("mt-1 flex items-center gap-1.5 text-[13px] font-semibold", color.text)}>
                  <Clock className="h-4 w-4" />
                  {formatTime(group.startTime)} - {formatTime(group.endTime)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] font-bold text-slate-500">{mentorCount} mentor{mentorCount === 1 ? "" : "s"} / {group.schedules.length} roster{group.schedules.length === 1 ? "" : "s"}</p>
                <p className="mt-1 text-[10px] text-slate-400">{completedRows} submitted{cancelledRows ? ` / ${cancelledRows} cancelled` : ""}</p>
              </div>
            </div>

            <div className="divide-y divide-slate-200/70 dark:divide-slate-700/70">
              {collapseMentorsAcrossSchedules(group.schedules, getSlotStatus, parseStandards).map(mentor => {
                const state = mentor.state
                const status = mentor.primaryStatus
                const schedule = mentor.primarySchedule
                const scheduleState = status.state || "active"

                return (
                  <div key={mentor.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-start gap-1.5">
                          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            state === "marked"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                              : state === "cancelled"
                                ? "border-rose-200 bg-rose-50 text-rose-600 line-through dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                              : state === "submitted"
                                ? "border-slate-200 bg-white/80 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
                                : "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300",
                          )}>
                            {mentor.name}
                          </span>
                        </div>
                        {mentor.standards.length > 0 && (
                          <p className="mt-1.5 truncate pl-5 text-[11px] text-slate-500">
                            {mentor.standards.join(" / ")}
                          </p>
                        )}
                      </div>
                      <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        state === "marked" || state === "submitted"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                          : state === "cancelled"
                            ? "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                            : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300")}>
                        {state === "marked" ? "Marked"
                          : state === "submitted" ? "Submitted"
                            : state === "cancelled" ? "Cancelled"
                              : "Not marked"}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-5">
                      {scheduleState === "upcoming" ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-slate-500"><Clock className="h-3 w-3" />Starts at {status.startTime}</span>
                      ) : scheduleState === "locked" ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-slate-500"><Lock className="h-3 w-3" />Outside edit window</span>
                      ) : state === "cancelled" ? (
                        <span className="text-[10px] font-medium text-rose-500">This mentor slot is cancelled</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenRoster(schedule, mentor.id)}
                          className="text-[11px] font-bold text-indigo-600 transition hover:text-indigo-800 dark:text-indigo-300"
                        >
                          {state === "marked" || state === "submitted"
                            ? "Review attendance ->"
                            : "Mark attendance ->"}
                        </button>
                      )}
                      <div className="flex items-center gap-1.5">{renderScheduleTools?.(schedule, status)}</div>
                    </div>
                    {renderScheduleDetails && (
                      <div className="mt-2 pl-5">{renderScheduleDetails(schedule, status)}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
