import { calculateCoveredPagesFromLogs } from './quran-data';

export interface HifzLog {
    mode: 'New Verses' | 'Recent Revision' | 'Juz Revision' | 'Juz Revision (New)' | 'Juz Revision (Old)';
    entry_date: string;
    surah_name?: string;
    start_v?: number;
    end_v?: number;
    start_page?: number;
    end_page?: number;
    juz_portion?: string;
}

export interface AttendanceRecord {
    date: string;
    status: string;
}

interface HifzReportPointOptions {
    expectedClassDaysOverride?: number | null;
    attendedClasses?: number | null;
    countedClasses?: number | null;
    isHafiz?: boolean;
    firstJuzCompletionDate?: string | null;
    periodStartDate?: string;
    periodEndDate?: string;
    pointDayWeights?: Record<string, number> | null;
}

// Memorizing: New Verses 20 + Recent Rev 15 + applicable Juz Rev up to 15 + Attendance 20.
// Before the first completed Juz, the Juz component is non-applicable; in the
// transition period its maximum is pro-rated by eligible Hifz point days.
// Hafiz (30 Juz complete): Juz Revision (New+Old combined) 50 + Attendance 20.
const HIFZ_POINT_MAX = {
    newVerses: 20,
    recentRevision: 15,
    juzRevision: 15,
    attendance: 20,
} as const;
const HAFIZ_POINT_MAX = {
    juzRevision: 50,
    attendance: 20,
} as const;

export function calculateHifzReportPoints(
    logs: HifzLog[],
    attendance: AttendanceRecord[],
    options?: HifzReportPointOptions
) {
    // Rounding helper
    const roundTo2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

    const safeToISO = (dateStr: any) => {
        if (!dateStr) return null;
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return null;
            return d.toISOString().split('T')[0];
        } catch { return null; }
    };

    // STEP 1: CALCULATE TOTAL CLASS DAYS
    // Count UNIQUE DAYS where status is NOT Cancelled or Leave
    const uniqueClassDays = new Set<string>();
    attendance.forEach(rec => {
        const status = rec.status?.toLowerCase();
        if (status !== 'cancelled' && status !== 'leave') {
            const iso = safeToISO(rec.date);
            if (iso) uniqueClassDays.add(iso);
        }
    });
    const attendanceClassDays = uniqueClassDays.size;
    const uniqueLogDays = new Set<string>();
    logs.forEach(log => {
        const iso = safeToISO(log.entry_date);
        if (iso) uniqueLogDays.add(iso);
    });
    const detectedClassDays = attendanceClassDays > 0 ? attendanceClassDays : uniqueLogDays.size;
    const totalClassDays = Math.max(0, Number(options?.expectedClassDaysOverride ?? detectedClassDays));

    // Attendance is scored independently of the recitation class-day scale so a
    // student with no logged classes still gets a fair 0 rather than a crash.
    const roundTo2Early = roundTo2;
    const countedClasses = Math.max(0, Number(options?.countedClasses ?? 0));
    const attendedClasses = Math.max(0, Number(options?.attendedClasses ?? 0));
    const attendancePercentage = countedClasses > 0
        ? Math.min(100, (attendedClasses / countedClasses) * 100)
        : 0;
    const attendancePoints = roundTo2Early((attendancePercentage / 100) * HIFZ_POINT_MAX.attendance);
    const isHafiz = !!options?.isHafiz;

    let juzEligibleRatio = 1;
    let juzEligiblePointDays = totalClassDays;
    const completionDate = safeToISO(options?.firstJuzCompletionDate);
    const periodStartDate = safeToISO(options?.periodStartDate);
    const periodEndDate = safeToISO(options?.periodEndDate);

    if (!isHafiz && options && Object.prototype.hasOwnProperty.call(options, 'firstJuzCompletionDate')) {
        if (!completionDate) {
            juzEligibleRatio = 0;
        } else if (periodStartDate && completionDate < periodStartDate) {
            juzEligibleRatio = 1;
        } else if (periodEndDate && completionDate >= periodEndDate) {
            juzEligibleRatio = 0;
        } else if (periodStartDate && periodEndDate) {
            const weightedDays = Object.entries(options.pointDayWeights || {})
                .filter(([date, weight]) => date >= periodStartDate && date <= periodEndDate && Number(weight) > 0);
            const totalWeight = weightedDays.reduce((sum, [, weight]) => sum + Number(weight), 0);
            if (totalWeight > 0) {
                const eligibleWeight = weightedDays
                    .filter(([date]) => date > completionDate)
                    .reduce((sum, [, weight]) => sum + Number(weight), 0);
                juzEligibleRatio = eligibleWeight / totalWeight;
            } else {
                // Without effective per-date Hifz point days, do not invent a
                // calendar-day target. The component remains non-applicable for
                // this transition period and becomes fully applicable next period.
                juzEligibleRatio = 0;
            }
        }
    }

    juzEligibleRatio = Math.min(1, Math.max(0, juzEligibleRatio));
    juzEligiblePointDays = roundTo2Early(totalClassDays * juzEligibleRatio);
    const juzMax = isHafiz
        ? HAFIZ_POINT_MAX.juzRevision
        : roundTo2Early(HIFZ_POINT_MAX.juzRevision * juzEligibleRatio);
    const totalMax = isHafiz
        ? HAFIZ_POINT_MAX.juzRevision + HIFZ_POINT_MAX.attendance
        : HIFZ_POINT_MAX.newVerses + HIFZ_POINT_MAX.recentRevision + juzMax + HIFZ_POINT_MAX.attendance;

    if (totalClassDays === 0) {
        const zeroTotal = attendancePoints;
        const zeroPct = totalMax > 0 ? roundTo2Early((zeroTotal / totalMax) * 100) : 0;
        return {
            detectedClassDays,
            totalClassDays: 0,
            newVersePoints: 0,
            recentRevisionPoints: 0,
            juzPoints: 0,
            juzMax,
            totalMax,
            juzEligibleRatio: roundTo2Early(juzEligibleRatio),
            juzEligiblePointDays,
            firstJuzCompletionDate: completionDate,
            attendancePoints,
            attendancePercentage: roundTo2Early(attendancePercentage),
            totalPoints: zeroTotal,
            percentage: zeroPct,
            grade: resolveGrade(zeroPct)
        };
    }

    // Denominator is the FULL month's expected class days (planned − cancelled),
    // supplied by the caller via expectedClassDaysOverride. Students climb toward
    // a fixed monthly target instead of a rolling one, so scores go up as they
    // recite and only shrink when a class is cancelled.
    // Juz Revision sum — must mirror what the report table shows in the
    // "Juz Revision" columns, otherwise grade and columns disagree.
    // - Memorizing display sums plain "Juz Revision" + "(New)" + "(Old)" logs.
    // - Hafiz display shows ONLY "(New)" and "(Old)" — any plain "Juz Revision"
    //   entry for a Hafiz student is invisible in the columns, so must not
    //   count here either (that was the bug that pushed Suhail KP to A++ from
    //   plain-mode entries not appearing in his 1.5 / 4.75 totals).
    // Portion-less logs contribute 0 (matches the display's portionValue).
    const juzRevisionModes = isHafiz
        ? ['Juz Revision (New)', 'Juz Revision (Old)']
        : ['Juz Revision', 'Juz Revision (New)', 'Juz Revision (Old)'];
    let totalJuzRecited = 0;
    logs.filter(log => {
        if (!log.mode || !juzRevisionModes.includes(log.mode)) return false;
        if (isHafiz) return true;
        const entryDate = safeToISO(log.entry_date);
        return !!completionDate && !!entryDate && entryDate > completionDate;
    }).forEach(log => {
        const portion = log.juz_portion;
        if (portion === 'Full') totalJuzRecited += 1;
        else if (portion?.includes('Half')) totalJuzRecited += 0.5;
        else if (portion?.startsWith('Q')) totalJuzRecited += 0.25;
        else if (portion) totalJuzRecited += 1;
    });

    let newVersePoints = 0;
    let recentRevisionPoints = 0;
    let juzPoints = 0;

    if (isHafiz) {
        // Hafiz: expect 0.5 Juz per class day. New + Old combined out of 50.
        const expectedHafizJuz = totalClassDays * 0.5;
        juzPoints = expectedHafizJuz > 0
            ? (totalJuzRecited / expectedHafizJuz) * HAFIZ_POINT_MAX.juzRevision
            : 0;
        juzPoints = roundTo2(Math.min(juzPoints, HAFIZ_POINT_MAX.juzRevision));
    } else {
        // Memorizing: three separate recitation buckets.
        const expectedPages = totalClassDays * 0.9;
        const totalPagesRecited = calculateCoveredPagesFromLogs(logs.filter(l => l.mode === 'New Verses'));
        newVersePoints = expectedPages > 0
            ? (totalPagesRecited / expectedPages) * HIFZ_POINT_MAX.newVerses
            : 0;
        newVersePoints = roundTo2(Math.min(newVersePoints, HIFZ_POINT_MAX.newVerses));

        const uniqueRecentDates = new Set<string>();
        logs.filter(l => l.mode === 'Recent Revision').forEach(log => {
            const iso = safeToISO(log.entry_date);
            if (iso) uniqueRecentDates.add(iso);
        });
        const daysRecitedRecent = uniqueRecentDates.size;

        const expectedRecentDays = totalClassDays * 0.7;
        recentRevisionPoints = expectedRecentDays > 0
            ? (daysRecitedRecent / expectedRecentDays) * HIFZ_POINT_MAX.recentRevision
            : 0;
        recentRevisionPoints = roundTo2(Math.min(recentRevisionPoints, HIFZ_POINT_MAX.recentRevision));

        const expectedJuz = juzEligiblePointDays * 0.5;
        juzPoints = expectedJuz > 0
            ? (totalJuzRecited / expectedJuz) * juzMax
            : 0;
        juzPoints = roundTo2(Math.min(juzPoints, juzMax));
    }

    // Percentage, not raw points, is the comparable value when the Juz maximum is dynamic.
    const totalPoints = roundTo2(newVersePoints + recentRevisionPoints + juzPoints + attendancePoints);
    const totalPercentage = totalMax > 0 ? roundTo2((totalPoints / totalMax) * 100) : 0;

    return {
        detectedClassDays,
        totalClassDays,
        newVersePoints,
        recentRevisionPoints,
        juzPoints,
        juzMax,
        totalMax: roundTo2(totalMax),
        juzEligibleRatio: roundTo2(juzEligibleRatio),
        juzEligiblePointDays,
        firstJuzCompletionDate: completionDate,
        attendancePoints,
        attendancePercentage: roundTo2(attendancePercentage),
        totalPoints,
        percentage: totalPercentage,
        grade: resolveGrade(totalPercentage)
    };
}

function resolveGrade(totalPercentage: number): string {
    if (totalPercentage >= 95) return 'A++';
    if (totalPercentage >= 90) return 'A+';
    if (totalPercentage >= 80) return 'A';
    if (totalPercentage >= 70) return 'B+';
    if (totalPercentage >= 60) return 'B';
    if (totalPercentage >= 50) return 'C+';
    if (totalPercentage >= 40) return 'C';
    if (totalPercentage >= 35) return 'D+';
    return 'NO GRADE';
}
