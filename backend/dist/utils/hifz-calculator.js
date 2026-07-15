"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateHifzReportPoints = calculateHifzReportPoints;
const quran_data_1 = require("./quran-data");
// Keep the report, ranking, and grade calculation on one shared scale.
const HIFZ_POINT_MAX = {
    newVerses: 20,
    recentRevision: 15,
    juzRevision: 15,
};
const HIFZ_TOTAL_POINT_MAX = HIFZ_POINT_MAX.newVerses +
    HIFZ_POINT_MAX.recentRevision +
    HIFZ_POINT_MAX.juzRevision;
// A monthly ranking needs enough observed teaching time before a student can reach full marks.
const MINIMUM_SCORING_CLASS_DAYS = 5;
function calculateHifzReportPoints(logs, attendance, options) {
    // Rounding helper
    const roundTo2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
    const safeToISO = (dateStr) => {
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime()))
                return null;
            return d.toISOString().split('T')[0];
        }
        catch {
            return null;
        }
    };
    // STEP 1: CALCULATE TOTAL CLASS DAYS
    // Count UNIQUE DAYS where status is NOT Cancelled or Leave
    const uniqueClassDays = new Set();
    attendance.forEach(rec => {
        const status = rec.status?.toLowerCase();
        if (status !== 'cancelled' && status !== 'leave') {
            const iso = safeToISO(rec.date);
            if (iso)
                uniqueClassDays.add(iso);
        }
    });
    const attendanceClassDays = uniqueClassDays.size;
    const uniqueLogDays = new Set();
    logs.forEach(log => {
        const iso = safeToISO(log.entry_date);
        if (iso)
            uniqueLogDays.add(iso);
    });
    const detectedClassDays = attendanceClassDays > 0 ? attendanceClassDays : uniqueLogDays.size;
    const totalClassDays = options?.expectedClassDaysOverride ?? detectedClassDays;
    if (totalClassDays === 0) {
        return {
            detectedClassDays,
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
    const totalPagesRecited = (0, quran_data_1.calculateCoveredPagesFromLogs)(logs.filter(l => l.mode === 'New Verses'));
    const scoringClassDays = Math.max(totalClassDays, MINIMUM_SCORING_CLASS_DAYS);
    const expectedPages = scoringClassDays * 0.9;
    let newVersePoints = expectedPages > 0
        ? (totalPagesRecited / expectedPages) * HIFZ_POINT_MAX.newVerses
        : 0;
    newVersePoints = roundTo2(Math.min(newVersePoints, HIFZ_POINT_MAX.newVerses));
    // STEP 3: RECENT REVISION POINT
    const uniqueRecentDates = new Set();
    logs.filter(l => l.mode === 'Recent Revision').forEach(log => {
        const iso = safeToISO(log.entry_date);
        if (iso)
            uniqueRecentDates.add(iso);
    });
    const daysRecitedRecent = uniqueRecentDates.size;
    const expectedRecentDays = scoringClassDays * 0.7;
    let recentRevisionPoints = expectedRecentDays > 0
        ? (daysRecitedRecent / expectedRecentDays) * HIFZ_POINT_MAX.recentRevision
        : 0;
    recentRevisionPoints = roundTo2(Math.min(recentRevisionPoints, HIFZ_POINT_MAX.recentRevision));
    // STEP 4: JUZ REVISION POINT
    let totalJuzRecited = 0;
    logs.filter(l => l.mode?.startsWith('Juz Revision')).forEach(log => {
        const portion = log.juz_portion;
        if (portion === 'Full')
            totalJuzRecited += 1;
        else if (portion?.includes('Half'))
            totalJuzRecited += 0.5;
        else if (portion?.startsWith('Q'))
            totalJuzRecited += 0.25;
        else
            totalJuzRecited += 1; // Default
    });
    const expectedJuz = scoringClassDays * 0.7;
    let juzPoints = expectedJuz > 0
        ? (totalJuzRecited / expectedJuz) * HIFZ_POINT_MAX.juzRevision
        : 0;
    juzPoints = roundTo2(Math.min(juzPoints, HIFZ_POINT_MAX.juzRevision));
    // STEP 5: TOTAL & GRADE
    const totalPoints = roundTo2(newVersePoints + recentRevisionPoints + juzPoints);
    const totalPercentage = roundTo2((totalPoints / HIFZ_TOTAL_POINT_MAX) * 100);
    let grade = 'NO GRADE';
    if (totalPercentage >= 95)
        grade = 'A++';
    else if (totalPercentage >= 90)
        grade = 'A+';
    else if (totalPercentage >= 80)
        grade = 'A';
    else if (totalPercentage >= 70)
        grade = 'B+';
    else if (totalPercentage >= 60)
        grade = 'B';
    else if (totalPercentage >= 50)
        grade = 'C+';
    else if (totalPercentage >= 40)
        grade = 'C';
    else if (totalPercentage >= 35)
        grade = 'D+';
    return {
        detectedClassDays,
        totalClassDays,
        scoringClassDays,
        newVersePoints,
        recentRevisionPoints,
        juzPoints,
        totalPoints,
        percentage: totalPercentage,
        grade
    };
}
