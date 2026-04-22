"use strict";
// ── Quran Juz completion helper (mirrors frontend hifz-progress.ts) ──────────
// Self-contained: no external imports needed.
Object.defineProperty(exports, "__esModule", { value: true });
exports.countCompletedJuz = countCompletedJuz;
// Verse counts for surahs 1–114
const SURAH_VERSE_COUNTS = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
    123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
    112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
    34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
    54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
    60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14,
    11, 11, 18, 12, 12, 30, 52, 52, 44, 28,
    28, 20, 56, 40, 31, 50, 40, 46, 42, 29,
    19, 36, 25, 22, 17, 19, 26, 30, 20, 15,
    21, 11, 8, 8, 19, 5, 8, 8, 11, 11,
    8, 3, 9, 5, 4, 7, 3, 6, 3, 5,
    4, 5, 6
];
// Surah name → ID mapping (lowercase for case-insensitive lookup)
const SURAH_NAME_MAP = {
    'al-fatiha': 1, 'al-baqarah': 2, 'al-imran': 3, "an-nisa": 4,
    "al-ma'idah": 5, "al-an'am": 6, "al-a'raf": 7, 'al-anfal': 8,
    'at-tawbah': 9, 'yunus': 10, 'hud': 11, 'yusuf': 12,
    "ar-ra'd": 13, 'ibrahim': 14, 'al-hijr': 15, 'an-nahl': 16,
    'al-isra': 17, 'al-kahf': 18, 'maryam': 19, 'ta-ha': 20,
    'al-anbiya': 21, 'al-hajj': 22, "al-mu'minun": 23, 'an-nur': 24,
    'al-furqan': 25, "ash-shu'ara": 26, 'an-naml': 27, 'al-qasas': 28,
    'al-ankabut': 29, 'ar-rum': 30, 'luqman': 31, 'as-sajdah': 32,
    'al-ahzab': 33, 'saba': 34, 'fatir': 35, 'ya-sin': 36,
    'as-saffat': 37, 'sad': 38, 'az-zumar': 39, 'ghafir': 40,
    'fussilat': 41, 'ash-shura': 42, 'az-zukhruf': 43, 'ad-dukhan': 44,
    'al-jathiyah': 45, 'al-ahqaf': 46, 'muhammad': 47, 'al-fath': 48,
    'al-hujurat': 49, 'qaf': 50, 'ad-dhariyat': 51, 'at-tur': 52,
    'an-najm': 53, 'al-qamar': 54, 'ar-rahman': 55, "al-waqi'ah": 56,
    'al-hadid': 57, 'al-mujadila': 58, 'al-hashr': 59, 'al-mumtahanah': 60,
    'as-saff': 61, "al-jumu'ah": 62, 'al-munafiqun': 63, 'at-taghabun': 64,
    'at-talaq': 65, 'at-tahrim': 66, 'al-mulk': 67, 'al-qalam': 68,
    'al-haqqah': 69, "al-ma'arij": 70, 'nuh': 71, 'al-jinn': 72,
    'al-muzzammil': 73, 'al-muddaththir': 74, 'al-qiyamah': 75, 'al-insan': 76,
    'al-mursalat': 77, 'an-naba': 78, "an-nazi'at": 79, 'abasa': 80,
    'at-takwir': 81, 'al-infitar': 82, 'al-mutaffifin': 83, 'al-inshiqaq': 84,
    'al-buruj': 85, 'at-tariq': 86, "al-a'la": 87, 'al-ghashiyah': 88,
    'al-fajr': 89, 'al-balad': 90, 'ash-shams': 91, 'al-layl': 92,
    'ad-duha': 93, 'ash-sharh': 94, 'at-tin': 95, 'al-alaq': 96,
    'al-qadr': 97, 'al-bayyinah': 98, 'az-zalzalah': 99, 'al-adiyat': 100,
    "al-qari'ah": 101, 'at-takathur': 102, 'al-asr': 103, 'al-humazah': 104,
    'al-fil': 105, 'quraysh': 106, "al-ma'un": 107, 'al-kawthar': 108,
    'al-kafirun': 109, 'an-nasr': 110, 'al-masad': 111, 'al-ikhlas': 112,
    'al-falaq': 113, 'an-nas': 114
};
// Juz boundaries (from quran_map.json)
const JUZ_BOUNDARIES = [
    { id: 1, startSurah: 1, startVerse: 1, endSurah: 2, endVerse: 141 },
    { id: 2, startSurah: 2, startVerse: 142, endSurah: 2, endVerse: 252 },
    { id: 3, startSurah: 2, startVerse: 253, endSurah: 3, endVerse: 92 },
    { id: 4, startSurah: 3, startVerse: 93, endSurah: 4, endVerse: 23 },
    { id: 5, startSurah: 4, startVerse: 24, endSurah: 4, endVerse: 147 },
    { id: 6, startSurah: 4, startVerse: 148, endSurah: 5, endVerse: 81 },
    { id: 7, startSurah: 5, startVerse: 82, endSurah: 6, endVerse: 110 },
    { id: 8, startSurah: 6, startVerse: 111, endSurah: 7, endVerse: 87 },
    { id: 9, startSurah: 7, startVerse: 88, endSurah: 8, endVerse: 40 },
    { id: 10, startSurah: 8, startVerse: 41, endSurah: 9, endVerse: 92 },
    { id: 11, startSurah: 9, startVerse: 93, endSurah: 11, endVerse: 5 },
    { id: 12, startSurah: 11, startVerse: 6, endSurah: 12, endVerse: 52 },
    { id: 13, startSurah: 12, startVerse: 53, endSurah: 14, endVerse: 52 },
    { id: 14, startSurah: 15, startVerse: 1, endSurah: 16, endVerse: 128 },
    { id: 15, startSurah: 17, startVerse: 1, endSurah: 18, endVerse: 74 },
    { id: 16, startSurah: 18, startVerse: 75, endSurah: 20, endVerse: 135 },
    { id: 17, startSurah: 21, startVerse: 1, endSurah: 22, endVerse: 78 },
    { id: 18, startSurah: 23, startVerse: 1, endSurah: 25, endVerse: 20 },
    { id: 19, startSurah: 25, startVerse: 21, endSurah: 27, endVerse: 55 },
    { id: 20, startSurah: 27, startVerse: 56, endSurah: 29, endVerse: 45 },
    { id: 21, startSurah: 29, startVerse: 46, endSurah: 33, endVerse: 30 },
    { id: 22, startSurah: 33, startVerse: 31, endSurah: 36, endVerse: 27 },
    { id: 23, startSurah: 36, startVerse: 28, endSurah: 39, endVerse: 31 },
    { id: 24, startSurah: 39, startVerse: 32, endSurah: 41, endVerse: 46 },
    { id: 25, startSurah: 41, startVerse: 47, endSurah: 45, endVerse: 37 },
    { id: 26, startSurah: 46, startVerse: 1, endSurah: 51, endVerse: 30 },
    { id: 27, startSurah: 51, startVerse: 31, endSurah: 57, endVerse: 29 },
    { id: 28, startSurah: 58, startVerse: 1, endSurah: 66, endVerse: 12 },
    { id: 29, startSurah: 67, startVerse: 1, endSurah: 77, endVerse: 50 },
    { id: 30, startSurah: 78, startVerse: 1, endSurah: 114, endVerse: 6 },
];
// Pre-compute cumulative verse offsets
const GLOBAL_OFFSETS = [0];
for (let i = 0; i < SURAH_VERSE_COUNTS.length; i++) {
    GLOBAL_OFFSETS.push(GLOBAL_OFFSETS[i] + SURAH_VERSE_COUNTS[i]);
}
function toGlobal(surah, verse) {
    if (surah < 1 || surah > 114)
        return -1;
    return GLOBAL_OFFSETS[surah - 1] + verse;
}
function getSurahId(name) {
    if (!name)
        return 0;
    const key = name.toLowerCase().trim();
    if (SURAH_NAME_MAP[key])
        return SURAH_NAME_MAP[key];
    // Try partial match
    for (const [k, v] of Object.entries(SURAH_NAME_MAP)) {
        if (k.includes(key) || key.includes(k))
            return v;
    }
    const n = parseInt(name);
    if (!isNaN(n) && n >= 1 && n <= 114)
        return n;
    return 0;
}
/**
 * Given all New Verses hifz_logs rows for a student,
 * returns the count of fully completed Juz.
 */
function countCompletedJuz(logs) {
    const ranges = [];
    for (const log of logs) {
        if (!log.surah_name || !log.start_v || !log.end_v)
            continue;
        const sid = getSurahId(log.surah_name);
        if (!sid)
            continue;
        const s = toGlobal(sid, log.start_v);
        const e = toGlobal(sid, log.end_v);
        if (s >= 0 && e >= s)
            ranges.push({ start: s, end: e });
    }
    if (ranges.length === 0)
        return 0;
    ranges.sort((a, b) => a.start - b.start);
    const merged = [{ ...ranges[0] }];
    for (let i = 1; i < ranges.length; i++) {
        const cur = merged[merged.length - 1];
        const nxt = ranges[i];
        if (nxt.start <= cur.end + 1) {
            cur.end = Math.max(cur.end, nxt.end);
        }
        else {
            merged.push({ ...nxt });
        }
    }
    let count = 0;
    for (const juz of JUZ_BOUNDARIES) {
        const jStart = toGlobal(juz.startSurah, juz.startVerse);
        const jEnd = toGlobal(juz.endSurah, juz.endVerse);
        const covered = merged.some(r => r.start <= jStart && r.end >= jEnd);
        if (covered)
            count++;
    }
    return count;
}
