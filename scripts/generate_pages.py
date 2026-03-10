import json
import urllib.request
import os

print("Fetching Quran Meta Data for Pages...")
url = "https://api.alquran.cloud/v1/meta"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode())['data']

surahs = data['surahs']['references']
pages = data['pages']['references'] # These are the page boundaries

# pages is an object with keys "1" to "604"
# Each page looks like: "1": {"surah": 1, "ayah": 1}

out_ts = """// Auto-generated Madani Mushaf Page Map (604 Pages)
// Maps Page Number to its Starting Surah and Ayah.
export const MUSHAF_PAGES = [
"""

for i in range(1, 605):
    p_num = str(i)
    if p_num in pages:
        p = pages[p_num]
        out_ts += f"    {{ page: {i}, surah: {p['surah']}, ayah: {p['ayah']} }},\n"

out_ts += "];\n\n"

out_ts += """
// Given a Surah and Ayah, returns the exact Madani Mushaf Page (1-604)
export function getPageForVerse(surahId: number, ayahNumber: number): number {
    // Binary search or linear search
    // Since array is 604 items, linear search from the end is fast enough
    for (let i = MUSHAF_PAGES.length - 1; i >= 0; i--) {
        const p = MUSHAF_PAGES[i];
        if (surahId > p.surah || (surahId === p.surah && ayahNumber >= p.ayah)) {
            return p.page;
        }
    }
    return 1;
}

// Calculates how many pages a range of verses spans
export function calculatePages(startSurah: number, startAyah: number, endSurah: number, endAyah: number): number {
    if (!startSurah || !startAyah || !endSurah || !endAyah) return 0;
    
    // Safety check, swap if ordered wrong
    if (startSurah > endSurah || (startSurah === endSurah && startAyah > endAyah)) {
        let tempS = startSurah, tempA = startAyah;
        startSurah = endSurah; startAyah = endAyah;
        endSurah = tempS; endAyah = tempA;
    }

    const startPage = getPageForVerse(startSurah, startAyah);
    const endPage = getPageForVerse(endSurah, endAyah);
    
    // Calculate fractional or whole pages. For now, we can just return the number of distinct pages spanned.
    // If they memorize from Page 2 to Page 2, that's 1 page distinct. Maybe a fraction if few ayahs?
    // Let's use exact difference. But Page 9 to Page 10 is 2 pages covered.
    return (endPage - startPage) + 1;
}
"""

with open("src/lib/quran-pages.ts", "w") as f:
    f.write(out_ts)

print("Generated src/lib/quran-pages.ts successfully.")
