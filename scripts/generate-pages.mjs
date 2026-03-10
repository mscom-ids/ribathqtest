import fs from 'fs';
import https from 'https';

console.log("Fetching Quran Meta Data for Pages...");
const url = "https://api.alquran.cloud/v1/meta";

https.get(url, (res) => {
    let body = "";
    res.on("data", (chunk) => {
        body += chunk;
    });
    res.on("end", () => {
        const data = JSON.parse(body).data;
        const pages = data.pages.references;

        let outTs = `// Auto-generated Madani Mushaf Page Map (604 Pages)
// Maps Page Number to its Starting Surah and Ayah.
export const MUSHAF_PAGES = [
`;

        for (let i = 1; i <= 604; i++) {
            const pNum = String(i);
            if (pages[pNum]) {
                const p = pages[pNum];
                outTs += `    { page: ${i}, surah: ${p.surah}, ayah: ${p.ayah} },\n`;
            }
        }

        outTs += `];

// Given a Surah and Ayah, returns the exact Madani Mushaf Page (1-604)
export function getPageForVerse(surahId: number, ayahNumber: number): number {
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
    
    let sS = startSurah, sA = startAyah;
    let eS = endSurah, eA = endAyah;
    
    // Swap if ordered wrong
    if (sS > eS || (sS === eS && sA > eA)) {
        sS = endSurah; sA = endAyah;
        eS = startSurah; eA = startAyah;
    }

    const startPage = getPageForVerse(sS, sA);
    const endPage = getPageForVerse(eS, eA);
    
    // Inclusive page difference. E.g., if read from page 2 to page 2, that's 1 page.
    return Math.max((endPage - startPage) + 1, 0);
}
`;

        fs.writeFileSync("src/lib/quran-pages.ts", outTs);
        console.log("Generated src/lib/quran-pages.ts successfully.");
    });
}).on("error", (error) => {
    console.error(error.message);
});
