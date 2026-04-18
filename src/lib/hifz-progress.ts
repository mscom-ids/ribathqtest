import quranMap from './quran_map.json';
import { SURAH_LIST } from './data/surah-list'; // Adjust path if needed

// Type Definitions
export type JuzBoundary = {
    id: number;
    start: { surah: number; verse: number };
    end: { surah: number; verse: number };
};

export type HifzLog = {
    id: string;
    student_id: string;
    mode: 'New Verses' | 'Recent Revision' | 'Juz Revision';
    surah_name?: string;
    surah_curr?: number;
    start_v?: number;
    end_v?: number;
    entry_date: string;
    session_type?: string;
    rating?: number;
    juz_number?: number;
    juz_part?: string;
    start_page?: number;
    end_page?: number;
};

// --- CONSTANTS & DATA ---

// Verse counts for all 114 Surahs (Surah 1 to 114)
export const SURAH_VERSE_COUNTS = [
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

// Pre-calculate cumulative verse counts for fast global index lookup
const GLOBAL_VERSE_OFFSETS = [0];
for (let i = 0; i < SURAH_VERSE_COUNTS.length; i++) {
    GLOBAL_VERSE_OFFSETS.push(GLOBAL_VERSE_OFFSETS[i] + SURAH_VERSE_COUNTS[i]);
}

// --- HELPER FUNCTIONS ---

export function getSurahId(name: string): number {
    if (!name) return 0;

    // 1. Try exact match from SURAH_LIST
    const found = SURAH_LIST.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;

    // 2. Try partial match
    // e.g. "Ar-Ra'd" vs "Ar-Rad" or "Al-Fatiha" vs "Al-Fatihah"
    const partial = SURAH_LIST.find(s =>
        s.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(s.name.toLowerCase())
    );
    if (partial) return partial.id;

    // 3. Fallback: Parse number if name is just a string "1", "2"
    const num = parseInt(name);
    if (!isNaN(num) && num >= 1 && num <= 114) return num;

    return 0;
}

export function toGlobalVerseIndex(surah: number, verse: number): number {
    if (surah < 1 || surah > 114) return -1;
    return GLOBAL_VERSE_OFFSETS[surah - 1] + verse;
}

// --- CORE LOGIC ---

/**
 * Calculates which Juz are fully completed by the student.
 * Returns an array of completed Juz IDs (e.g., [1, 2, 21, 30])
 */
export function getCompletedJuzList(logs: HifzLog[]): number[] {
    // 1. Convert all "New Verses" logs into Global Ranges
    const ranges: { start: number; end: number }[] = [];

    logs.forEach(log => {
        if (log.mode !== 'New Verses' || !log.surah_name || !log.start_v || !log.end_v) return;

        const surahId = getSurahId(log.surah_name);
        if (!surahId) return;

        // Verify validity of start/end
        const startGlobal = toGlobalVerseIndex(surahId, log.start_v);
        const endGlobal = toGlobalVerseIndex(surahId, log.end_v);

        if (startGlobal !== -1 && endGlobal !== -1 && endGlobal >= startGlobal) {
            ranges.push({ start: startGlobal, end: endGlobal });
        }
    });

    if (ranges.length === 0) return [];

    // 2. Merge overlapping ranges
    ranges.sort((a, b) => a.start - b.start);

    const merged: { start: number; end: number }[] = [];
    let current = ranges[0];

    for (let i = 1; i < ranges.length; i++) {
        const next = ranges[i];
        // If overlap or adjacent (next.start <= current.end + 1)
        if (next.start <= current.end + 1) {
            current.end = Math.max(current.end, next.end);
        } else {
            merged.push(current);
            current = next;
        }
    }
    merged.push(current);

    // 3. Check each Juz against merged ranges
    const completedJuz: number[] = [];
    const juzMap = quranMap as JuzBoundary[];

    juzMap.forEach(juz => {
        const juzStartGlobal = toGlobalVerseIndex(juz.start.surah, juz.start.verse);
        const juzEndGlobal = toGlobalVerseIndex(juz.end.surah, juz.end.verse);

        // Check if any single merged range fully covers this Juz
        // (A Juz must be contiguous to be counted as "complete" in this logic)
        const isCovered = merged.some(range =>
            range.start <= juzStartGlobal && range.end >= juzEndGlobal
        );

        if (isCovered) {
            completedJuz.push(juz.id);
        }
    });

    return completedJuz;
}

/**
 * Calculates total progress percentage
 */
export function calculateProgress(logs: HifzLog[]): number {
    const completed = getCompletedJuzList(logs);
    return (completed.length / 30) * 100;
}

/**
 * Legacy support / compatibility
 */
export function isJuzCompleted(juzId: number, logs: HifzLog[]): boolean {
    const list = getCompletedJuzList(logs);
    return list.includes(juzId);
}

// --- FORMATTING UTILITIES ---

export const getArabic = (name?: string) => {
    // If not found, look up SURAH_LIST or just return name
    // (Notice: SURAH_LIST does not contain name_arabic, so we rely on fallback)
    
    // Fallback dictionary
    const fallback: Record<string, string> = {
        "Al-Fatiha": "الفاتحة", "Al-Baqarah": "البقرة", "Al-Imran": "آل عمران", "An-Nisa": "النساء",
        "Al-Ma'idah": "المائدة", "Al-An'am": "الأنعام", "Al-A'raf": "الأعراف", "Al-Anfal": "الأنفال",
        "At-Tawbah": "التوبة", "Yunus": "يونس", "Hud": "هود", "Yusuf": "يوسف", "Ar-Ra'd": "الرعد",
        "Ibrahim": "إبراهيم", "Al-Hijr": "الحجر", "An-Nahl": "النحل", "Al-Isra": "الإسراء",
        "Al-Kahf": "الكهف", "Maryam": "مريم", "Ta-Ha": "طه", "Al-Anbiya": "الأنبياء",
        "Al-Hajj": "الحج", "Al-Mu'minun": "المؤمنون", "An-Nur": "النور", "Al-Furqan": "الفرقان",
        "Ash-Shu'ara": "الشعراء", "An-Naml": "النمل", "Al-Qasas": "القصص", "Al-Ankabut": "العنكبوت",
        "Ar-Rum": "الروم", "Luqman": "لقمان", "As-Sajdah": "السجدة", "Al-Ahzab": "الأحزاب",
        "Saba": "سبأ", "Fatir": "فاطر", "Ya-Sin": "يس", "As-Saffat": "الصافات", "Sad": "ص",
        "Az-Zumar": "الزمر", "Ghafir": "غافر", "Fussilat": "فصلت", "Ash-Shura": "الشورى",
        "Az-Zukhruf": "الزخرف", "Ad-Dukhan": "الدخان", "Al-Jathiyah": "الجاثية", "Al-Ahqaf": "الأحقاف",
        "Muhammad": "محمد", "Al-Fath": "الفتح", "Al-Hujurat": "الحجرات", "Qaf": "ق",
        "Ad-Dhariyat": "الذاريات", "At-Tur": "الطور", "An-Najm": "النجم", "Al-Qamar": "القمر",
        "Ar-Rahman": "الرحمن", "Al-Waqi'ah": "الواقعة", "Al-Hadid": "الحديد", "Al-Mujadila": "المجادلة",
        "Al-Hashr": "الحشر", "Al-Mumtahanah": "الممتحنة", "As-Saff": "الصف", "Al-Jumu'ah": "الجمعة",
        "Al-Munafiqun": "المنافقون", "At-Taghabun": "التغابن", "At-Talaq": "الطلاق", "At-Tahrim": "التحريم",
        "Al-Mulk": "الملك", "Al-Qalam": "القلم", "Al-Haqqah": "الحاقة", "Al-Ma'arij": "المعارج",
        "Nuh": "نوح", "Al-Jinn": "الجن", "Al-Muzzammil": "المزمل", "Al-Muddaththir": "المدثر",
        "Al-Qiyamah": "القيامة", "Al-Insan": "الإنسان", "Al-Mursalat": "المرسلات", "An-Naba": "النبأ",
        "An-Nazi'at": "النازعات", "Abasa": "عبس", "At-Takwir": "التكوير", "Al-Infitar": "الانفطار",
        "Al-Mutaffifin": "المطففين", "Al-Inshiqaq": "الانشقاق", "Al-Buruj": "البروج", "At-Tariq": "الطارق",
        "Al-A'la": "الأعلى", "Al-Ghashiyah": "الغاشية", "Al-Fajr": "الفجر", "Al-Balad": "البلد",
        "Ash-Shams": "الشمس", "Al-Layl": "الليل", "Ad-Duha": "الضحى", "Ash-Sharh": "الشرح",
        "At-Tin": "التين", "Al-Alaq": "العلق", "Al-Qadr": "القدر", "Al-Bayyinah": "البينة",
        "Az-Zalzalah": "الزلزلة", "Al-Adiyat": "العاديات", "Al-Qari'ah": "القارعة", "At-Takathur": "التكاثر",
        "Al-Asr": "العصر", "Al-Humazah": "الهمزة", "Al-Fil": "الفيل", "Quraysh": "قريش",
        "Al-Ma'un": "الماعون", "Al-Kawthar": "الكوثر", "Al-Kafirun": "الكافرون", "An-Nasr": "النصر",
        "Al-Masad": "المسد", "Al-Ikhlas": "الإخلاص", "Al-Falaq": "الفلق", "An-Nas": "الناس"
    };
    return name && fallback[name] ? fallback[name] : name || "";
};

export const toArabicNum = (num: number | string | undefined | null) => {
    if (num == null) return "?";
    return num.toString().replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
};

export function formatHifzLogLabel(log: Partial<HifzLog> | any) {
    if (log.mode?.startsWith("Juz Revision")) {
        const j = toArabicNum(log.juz_number || log.juz);
        const p = log.juz_portion || log.juz_part || "Full";
        
        if (p.toLowerCase() === "full") return `جزء ${j} الخ`;
        
        const qMatch = p.match(/q(\d)/i);
        if (qMatch) return `جزء ${j} ربع ${toArabicNum(qMatch[1])}`;

        const hMatch = p.match(/(\d)(st|nd|rd|th)? half/i);
        if (hMatch) return `جزء ${j} نصف ${toArabicNum(hMatch[1])}`;

        return `جزء ${j} ${p}`; // Fallback
    }

    // New Verses or Recent Revision
    const arabicSurah = getArabic(log.surah_name);
    if (log.start_v && log.end_v) return `${arabicSurah} (${toArabicNum(log.start_v)}–${toArabicNum(log.end_v)})`;
    if (log.start_page && log.end_page) return `${arabicSurah} ص ${toArabicNum(log.start_page)}–${toArabicNum(log.end_page)}`;
    if (log.verses) return `${arabicSurah} (${toArabicNum(log.verses)})`;
    return arabicSurah || "—";
}
