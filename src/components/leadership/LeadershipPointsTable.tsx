"use client"

import { useMemo } from "react"
import { Award, ChevronRight, Loader2 } from "lucide-react"
import { GlassSelect } from "@/components/ui/glass-select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { rankLabel, rankLeaderboard } from "@/lib/leaderboard-ranking"
import { resolveBackendUrl } from "@/lib/utils"
import { LeaderboardPlaceFrame as PlaceFrame } from "@/components/leadership/LeaderboardPlaceFrame"

type Performer = { adm_no: string; name: string; standard: string; totalPoints: number; bonusPoints: number; grade: string; isHafiz: boolean; photo_url?: string | null }
type Props = {
    performers: Performer[]; loading: boolean; error: string | null
    month: string; onMonthChange: (month: string) => void; months: { value: string; label: string }[]
    mentors: { id: string; name: string }[]; mentor: string; onMentorChange: (mentor: string) => void
    onStudentClick: (student: Performer) => void
}

function StudentPortrait({ student, featured = false }: { student: Performer; featured?: boolean }) {
    return <Avatar className={featured ? "points-featured-avatar" : "points-row-avatar"}>
        <AvatarImage src={student.photo_url ? resolveBackendUrl(student.photo_url) : undefined} alt="" className="object-cover" />
        <AvatarFallback className="points-avatar-fallback">{student.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</AvatarFallback>
    </Avatar>
}

/** Report filters never switch identity. Every tie shares a place, including joint winners. */
export function LeadershipPointsTable(props: Props) {
    const { performers, loading, error, month, onMonthChange, months, mentors, mentor, onMentorChange, onStudentClick } = props
    const scope = mentor === "all" ? "All students" : mentors.find(item => item.id === mentor)?.name || "Selected mentor"
    const ranked = useMemo(() => rankLeaderboard(performers), [performers])
    // Include all ties at the podium boundary instead of arbitrarily hiding joint winners.
    const leaders = ranked.filter(student => student.rank <= 3)
    const remaining = ranked.filter(student => student.rank > 3)
    const uniqueWinner = leaders.filter(student => student.rank === 1).length === 1
    const classicPodium = uniqueWinner && leaders.length === 3 && leaders[1].rank === 2 && leaders[2].rank === 3
    const featured = classicPodium ? [leaders[1], leaders[0], leaders[2]] : leaders
    const points = (student: Performer) => <>
        <span className="points-value">{student.totalPoints.toFixed(2)}<span className="points-unit"> pts</span></span>
        <span className={`points-grade ${student.grade === "O" ? "is-outstanding" : ""}`}>{student.grade === "O" ? "O · Outstanding" : `Grade ${student.grade}`}</span>
        {student.bonusPoints > 0 && <span className="points-bonus">incl. +{student.bonusPoints.toFixed(2)} bonus</span>}
    </>
    return <div className="leadership-points-table">
        <header className="points-header-card">
            <div className="points-header-top">
                <div className="points-header-title"><span className="points-header-icon"><Award aria-hidden="true" /></span><div><h2>Top Performers</h2><p>Monthly leaderboard</p></div></div>
                <GlassSelect value={month} onValueChange={onMonthChange} options={months} label="Leaderboard month" tone="inverse" className="points-month-picker min-h-11 w-full" align="end" />
            </div>
            <div className="points-header-bottom">
                <div className="min-w-0" title={scope}><GlassSelect value={mentor} onValueChange={onMentorChange} options={[{ value: "all", label: "All students" }, ...mentors.map(item => ({ value: item.id, label: item.name }))]} label="Leaderboard mentor" tone="inverse" className="min-h-11 w-full min-w-0" /></div>
                <span>{loading ? "Updating…" : `${ranked.length} students`}</span>
            </div>
        </header>
        {loading ? <div role="status" className="points-message"><Loader2 className="h-5 w-5 animate-spin" />Loading monthly points…</div>
            : error ? <p role="alert" className="points-message text-red-600 dark:text-red-300">{error}</p>
            : ranked.length === 0 ? <div className="points-message"><Award className="h-8 w-8" /><p>No students in this selection.</p><p>Choose another mentor or month.</p></div>
            : <>
                <div className="points-podium-panel"><div className="points-podium-heading"><h3>Leading students</h3><span>Monthly honours</span></div>
                <div role="group" aria-label="Leading students" className={`points-leaders ${classicPodium ? "is-podium" : "has-shared-places"}`} style={{ gridTemplateColumns: `repeat(${Math.min(featured.length, 3)}, minmax(0, 1fr))` }}>
                    {featured.map(student => <button key={student.adm_no} type="button" data-rank={student.rank} data-student-id={student.adm_no} aria-label={`Open progress for ${rankLabel(student.rank, student.tied)}: ${student.name}`} onClick={() => onStudentClick(student)} className={`points-leader ${student.rank === 1 ? "is-first" : ""}`}>
                        <span className="points-podium-slot"><span className="points-leader-visual"><PlaceFrame rank={student.rank} tied={student.tied} /><span className="points-portrait-wrap"><StudentPortrait student={student} featured /></span></span></span>
                        <span className="points-leader-name" title={student.name}>{student.name}</span>
                        <span className="points-place-label">{rankLabel(student.rank, student.tied)}</span>
                        <span className="points-leader-class">{student.standard}{student.isHafiz ? " · Hafiz" : ""}</span>
                        <span className="points-leader-score">{points(student)}</span>
                    </button>)}
                </div></div>
                {ranked.some(student => student.tied) && <p className="points-tie-note">Equal points share the same place.</p>}
                {remaining.length > 0 && <section className="points-list-surface" aria-label="Remaining rankings">
                    <div className="points-list-heading"><h3>The rankings</h3><span>Earned points</span></div>
                    <ol aria-label="Student point rankings" className="points-rankings">
                        {remaining.map(student => <li key={student.adm_no}><button type="button" data-rank={student.rank} data-student-id={student.adm_no} data-honour={student.rank <= 10 ? "true" : undefined} onClick={() => onStudentClick(student)} aria-label={`Open progress for ${rankLabel(student.rank, student.tied)}: ${student.name}`} className="points-student-row">
                            {student.rank <= 10 ? <PlaceFrame rank={student.rank} tied={student.tied} /> : <span className="points-row-rank" aria-label={rankLabel(student.rank, student.tied)}>{student.rank}</span>}
                            <StudentPortrait student={student} />
                            <span className="points-row-identity"><span>{student.name}</span><small>{student.standard} · {student.adm_no}{student.tied ? ` · ${rankLabel(student.rank, true)}` : ""}</small></span>
                            <span className="points-row-score">{points(student)}</span>
                            <ChevronRight className="points-row-arrow" aria-hidden="true" />
                        </button></li>)}
                    </ol>
                </section>}
                <p className="points-footnote">Monthly totals include earned bonus points. Tap a student to view progress.</p>
            </>}
    </div>
}
