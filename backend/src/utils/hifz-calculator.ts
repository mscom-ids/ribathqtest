import { calculatePages, getSurahId } from './quran-data';

export interface HifzLog {
    mode: 'New Verses' | 'Recent Revision' | 'Juz Revision';
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

export function calculateHifzReportPoints(logs: HifzLog[], attendance: AttendanceRecord[]) {
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
    const totalClassDays = uniqueClassDays.size;

    if (totalClassDays === 0) {
        return {
            totalClassDays: 0,
            newVersePoints: 0,
            recentRevisionPoints: 0,
            juzPoints: 0,
            totalPoints: 0,
            percentage: 0,
            grade: 'NO GRADE'
        };
    }

    // STEP 2: NEW VERSE POINT CALCULATION
    let totalPagesRecited = 0;
    logs.filter(l => l.mode === 'New Verses').forEach(log => {
        const sId = getSurahId(log.surah_name || "");
        if (sId && log.start_v && log.end_v) {
            totalPagesRecited += calculatePages(sId, log.start_v, sId, log.end_v);
        } else if (log.start_page && log.end_page) {
            totalPagesRecited += (log.end_page - log.start_page + 1);
        }
    });

    const expectedPages = totalClassDays * 0.9;
    let newVersePoints = expectedPages > 0 ? (totalPagesRecited / expectedPages) * 10 : 0;
    newVersePoints = roundTo2(Math.min(newVersePoints, 10));

    // STEP 3: RECENT REVISION POINT
    const uniqueRecentDates = new Set<string>();
    logs.filter(l => l.mode === 'Recent Revision').forEach(log => {
        const iso = safeToISO(log.entry_date);
        if (iso) uniqueRecentDates.add(iso);
    });
    const daysRecitedRecent = uniqueRecentDates.size;

    const expectedRecentDays = totalClassDays * 0.7;
    let recentRevisionPoints = expectedRecentDays > 0 ? (daysRecitedRecent / expectedRecentDays) * 10 : 0;
    recentRevisionPoints = roundTo2(Math.min(recentRevisionPoints, 10));

    // STEP 4: JUZ REVISION POINT
    let totalJuzRecited = 0;
    logs.filter(l => l.mode === 'Juz Revision').forEach(log => {
        const portion = log.juz_portion;
        if (portion === 'Full') totalJuzRecited += 1;
        else if (portion?.includes('Half')) totalJuzRecited += 0.5;
        else if (portion?.startsWith('Q')) totalJuzRecited += 0.25;
        else totalJuzRecited += 1; // Default
    });

    const expectedJuz = totalClassDays * 0.7;
    let juzPoints = expectedJuz > 0 ? (totalJuzRecited / expectedJuz) * 10 : 0;
    juzPoints = roundTo2(Math.min(juzPoints, 10));

    // STEP 5: TOTAL & GRADE
    const totalPoints = roundTo2(newVersePoints + recentRevisionPoints + juzPoints);
    const totalPercentage = roundTo2((totalPoints / 30) * 100);

    let grade = 'NO GRADE';
    if (totalPercentage >= 95) grade = 'A++';
    else if (totalPercentage >= 90) grade = 'A+';
    else if (totalPercentage >= 80) grade = 'A';
    else if (totalPercentage >= 70) grade = 'B+';
    else if (totalPercentage >= 60) grade = 'B';
    else if (totalPercentage >= 50) grade = 'C+';
    else if (totalPercentage >= 40) grade = 'C';
    else if (totalPercentage >= 35) grade = 'D+';

    return {
        totalClassDays,
        newVersePoints,
        recentRevisionPoints,
        juzPoints,
        totalPoints,
        percentage: totalPercentage,
        grade
    };
}
