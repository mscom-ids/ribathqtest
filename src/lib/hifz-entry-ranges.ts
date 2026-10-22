import { SURAH_LIST } from './data/surah-list'

type SurahEntry = {
    surah_name?: string | null
    start_v?: number | string | null
    end_v?: number | string | null
}

const positions = new Map<string, { offset: number; verses: number }>()
let offset = 0
for (const surah of SURAH_LIST) {
    positions.set(surah.name, { offset, verses: surah.totalVerses })
    offset += surah.totalVerses
}

/** Database insertion order is not Quran order, particularly for bulk saves. */
export function groupContinuousSurahEntries<T extends SurahEntry>(entries: readonly T[]): T[][] {
    const valid: { entry: T; start: number; end: number }[] = []
    const other: T[] = []
    for (const entry of entries) {
        const surah = positions.get(entry.surah_name || '')
        const start = Number(entry.start_v)
        const end = Number(entry.end_v)
        if (!surah || !Number.isInteger(start) || !Number.isInteger(end)
            || start < 1 || end < start || end > surah.verses) {
            // Never silently drop incomplete or non-Surah records.
            other.push(entry)
            continue
        }
        valid.push({ entry, start: surah.offset + start, end: surah.offset + end })
    }
    valid.sort((a, b) => a.start - b.start || a.end - b.end)
    const groups: T[][] = []
    let previousEnd: number | null = null
    for (const item of valid) {
        if (previousEnd !== null && item.start === previousEnd + 1) {
            groups[groups.length - 1].push(item.entry)
        } else {
            groups.push([item.entry])
        }
        previousEnd = item.end
    }
    return [...groups, ...other.map(entry => [entry])]
}
