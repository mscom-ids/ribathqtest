import { SURAH_LIST } from "./data/surah-list";
import {
    formatHifzLogLabel,
    getArabic,
    getSurahId,
    SURAH_VERSE_COUNTS,
    toArabicNum,
    toGlobalVerseIndex,
} from "./hifz-progress";

type VerseRangeLog = {
    surah_name?: string;
    start_v?: number;
    end_v?: number;
};

const globalVerseOffsets = [0];
for (const verseCount of SURAH_VERSE_COUNTS) {
    globalVerseOffsets.push(globalVerseOffsets[globalVerseOffsets.length - 1] + verseCount);
}

function fromGlobalVerseIndex(index: number) {
    let low = 0;
    let high = SURAH_VERSE_COUNTS.length - 1;

    while (low <= high) {
        const mid = (low + high) >> 1;
        const start = globalVerseOffsets[mid] + 1;
        const end = globalVerseOffsets[mid + 1];
        if (index < start) high = mid - 1;
        else if (index > end) low = mid + 1;
        else return { surah: mid + 1, verse: index - globalVerseOffsets[mid] };
    }

    return null;
}

/**
 * Collapses adjacent verse logs into compact ranges. For example, Al-Fajr 1-30
 * followed by every Surah through An-Nas 1-6 becomes one display label.
 * Non-verse entries (Juz/page records) retain their normal label.
 */
export function formatCompactHifzEntries(logs: VerseRangeLog[]): string[] {
    const ranges: { start: number; end: number }[] = [];
    const fallback: string[] = [];

    for (const log of logs) {
        const surahId = getSurahId(log.surah_name || "");
        const startVerse = Number(log.start_v);
        const endVerse = Number(log.end_v);
        const verseCount = surahId ? SURAH_VERSE_COUNTS[surahId - 1] : 0;

        if (surahId && startVerse >= 1 && endVerse >= 1 && startVerse <= verseCount && endVerse <= verseCount) {
            ranges.push({
                start: toGlobalVerseIndex(surahId, Math.min(startVerse, endVerse)),
                end: toGlobalVerseIndex(surahId, Math.max(startVerse, endVerse)),
            });
        } else {
            const label = formatHifzLogLabel(log);
            if (label) fallback.push(label);
        }
    }

    if (ranges.length === 0) return fallback;

    ranges.sort((a, b) => a.start - b.start || a.end - b.end);
    const labels: string[] = [];
    let current = { ...ranges[0] };

    const appendRange = (range: { start: number; end: number }) => {
        const start = fromGlobalVerseIndex(range.start);
        const end = fromGlobalVerseIndex(range.end);
        if (!start || !end) return;

        const startName = getArabic(SURAH_LIST[start.surah - 1]?.name);
        const endName = getArabic(SURAH_LIST[end.surah - 1]?.name);
        const startVerse = toArabicNum(start.verse);
        const endVerse = toArabicNum(end.verse);
        labels.push(
            start.surah === end.surah
                ? `${startName} ${startVerse} - ${endVerse}`
                : `${startName} ${startVerse} - ${endName} ${endVerse}`,
        );
    };

    for (let index = 1; index < ranges.length; index += 1) {
        const next = ranges[index];
        if (next.start <= current.end + 1) {
            current.end = Math.max(current.end, next.end);
        } else {
            appendRange(current);
            current = { ...next };
        }
    }
    appendRange(current);

    return [...labels, ...fallback];
}
