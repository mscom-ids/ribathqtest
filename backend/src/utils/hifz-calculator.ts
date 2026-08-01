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
}

// Two scales, both summing to 70 so Memorizing and Hafiz students rank together.
// Memorizing: New Verses 20 + Recent Rev 15 + Juz Rev 15 + Attendance 20.
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
const HIFZ_TOTAL_POINT_MAX =
    HIFZ_POINT_MAX.newVerses +
    HIFZ_POINT_MAX.recentRevision +
    HIFZ_POINT_MAX.juzRevision +
    HIFZ_POINT_MAX.attendance;

export function calculateHifzReportPoints(
    logs: HifzLog[],
    attendance: AttendanceRecord[],
    options?: HifzReportPointOptions
) {
    // Rounding helper
    const roundTo2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

    const safeToISO = (dateStr: any) => {
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
    const totalClassDays = options?.expectedClassDaysOverride ?? detectedClassDays;

    // Attendance is scored independently of the recitation class-day scale so a
    // student with no logged classes still gets a fair 0 rather than a crash.
    const roundTo2Early = roundTo2;
    const countedClasses = Math.max(0, Number(options?.countedClasses ?? 0));
    const attendedClasses = Math.max(0, Number(options?.attendedClasses ?? 0));
    const attendancePercentage = countedClasses > 0
        ? Math.min(100, (attendedClasses / countedClasses) * 100)
        : 0;
    const attendancePoints = roundTo2Early((attendancePercentage / 100) * HIFZ_POINT_MAX.attendance);

    if (totalClassDays === 0) {
        const zeroTotal = attendancePoints;
        const zeroPct = roundTo2Early((zeroTotal / HIFZ_TOTAL_POINT_MAX) * 100);
        return {
            detectedClassDays,
            totalClassDays: 0,
            newVersePoints: 0,
            recentRevisionPoints: 0,
            juzPoints: 0,
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
    const isHafiz = !!options?.isHafiz;

    // Juz Revision sum — for Memorizing students this catches the plain "Juz Revision"
    // mode; for Hafiz students it catches both "Juz Revision (New)" and "Juz Revision (Old)".
    let totalJuzRecited = 0;
    logs.filter(l => l.mode?.startsWith('Juz Revision')).forEach(log => {
        const portion = log.juz_portion;
        if (portion === 'Full') totalJuzRecited += 1;
        else if (portion?.includes('Half')) totalJuzRecited += 0.5;
        else if (portion?.startsWith('Q')) totalJuzRecited += 0.25;
        else totalJuzRecited += 1;
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

        const expectedJuz = totalClassDays * 0.5;
        juzPoints = expectedJuz > 0
            ? (totalJuzRecited / expectedJuz) * HIFZ_POINT_MAX.juzRevision
            : 0;
        juzPoints = roundTo2(Math.min(juzPoints, HIFZ_POINT_MAX.juzRevision));
    }

    // Both scales sum to 70 so ranking is comparable across Memorizing and Hafiz.
    const totalPoints = roundTo2(newVersePoints + recentRevisionPoints + juzPoints + attendancePoints);
    const totalPercentage = roundTo2((totalPoints / HIFZ_TOTAL_POINT_MAX) * 100);

    return {
        detectedClassDays,
        totalClassDays,
        newVersePoints,
        recentRevisionPoints,
        juzPoints,
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
