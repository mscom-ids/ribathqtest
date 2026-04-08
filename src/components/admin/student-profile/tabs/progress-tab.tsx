import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { type Student } from "@/app/admin/students/page"
import api from "@/lib/api"
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { format, subDays, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, startOfWeek, addDays, getDay } from "date-fns"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { calculatePages } from "@/lib/quran-pages"
import { getSurahId } from "@/lib/hifz-progress"

const arabicSurahs: Record<string, string> = {
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
const getArabic = (name?: string) => name && arabicSurahs[name] ? arabicSurahs[name] : name || "";

export function ProgressTab({ student }: { student: Student }) {
    const [data, setData] = useState<any[]>([])
    const [monthlyStats, setMonthlyStats] = useState({
        hifzPages: 0,
        recentRevisionDays: 0,
        juzRevisionJuz: 0,
        totalJuz: 0,
        attendance: "0/0"
    })
    const [loading, setLoading] = useState(true)
    const [allLogs, setAllLogs] = useState<any[]>([])
    const [attendanceRecords, setAttendanceRecords] = useState<any[]>([])
    const [reportMonth, setReportMonth] = useState(new Date())

    useEffect(() => {
        async function loadHifzData() {
            setLoading(true)

            const today = new Date()
            const startOfCurrentMonth = startOfMonth(reportMonth)
            const endOfCurrentMonth = endOfMonth(reportMonth)
            const monthStartStr = format(startOfCurrentMonth, "yyyy-MM-dd")
            const monthEndStr = format(endOfCurrentMonth, "yyyy-MM-dd")

            const [logsRes, attendRes, lifetimeLogsRes] = await Promise.all([
                api.get("/hifz/logs", {
                    params: {
                        student_id: student.adm_no,
                        start_date: subDays(today, 60).toISOString(),
                        end_date: today.toISOString()
                    }
                }),
                api.get("/academics/attendance", {
                    params: {
                        student_id: student.adm_no,
                        start_date: monthStartStr,
                        end_date: monthEndStr,
                        department: 'Hifz'
                    }
                }),
                api.get("/hifz/logs", {
                    params: {
                        student_id: student.adm_no,
                        mode: 'New Verses'
                    }
                })
            ])

            const logs = logsRes.data?.logs || []
            setAllLogs(logs.filter((l: any) => {
                const d = new Date(l.entry_date)
                return d >= startOfCurrentMonth && d <= endOfCurrentMonth
            }))
            setAttendanceRecords(attendRes.data?.data || [])

            let lifetimePages = 0;
            const lifetimeLogs = lifetimeLogsRes.data?.logs || [];
            lifetimeLogs.forEach((log: any) => {
                const sId = getSurahId(log.surah_name || "");
                if (sId && log.start_v && log.end_v) {
                    lifetimePages += calculatePages(sId, log.start_v, sId, log.end_v);
                } else if (log.start_page && log.end_page) {
                    lifetimePages += (log.end_page - log.start_page + 1);
                }
            });
            const calcTotalJuz = Math.floor(lifetimePages / 20);

            if (logs.length > 0) {
                const last30Days = logs.filter((l: any) => new Date(l.entry_date) >= subDays(today, 30))
                const processed = last30Days.map((log: any) => ({
                    date: format(new Date(log.entry_date), 'dd/MM'),
                    mode: log.mode,
                    details: log.mode === 'New Verses' || log.mode === 'Recent Revision'
                        ? (log.surah_name
                            ? `${getArabic(log.surah_name)} ${log.start_v ? `(${log.start_v}-${log.end_v})` : ''}`
                            : `Pages ${log.start_page}-${log.end_page}`)
                        : `Juz ${log.juz_number || '?'} (${log.juz_portion || 'Full'})`,
                    recorded_by_name: log.recorded_by_name
                }))
                setData(processed)

                const currentMonthLogs = logs.filter((l: any) =>
                    isWithinInterval(new Date(l.entry_date), { start: startOfCurrentMonth, end: endOfCurrentMonth })
                )

                let hifzPages = 0
                const recentRevisionDates = new Set<string>()
                let juzRevisionTotal = 0

                currentMonthLogs.forEach((log: any) => {
                    const pages = (log.page_end - log.page_start + 1) || 0
                    if (log.mode === 'New Verses' || log.mode === 'Recent Revision') {
                        if (log.mode === 'Recent Revision') {
                            recentRevisionDates.add(format(new Date(log.entry_date), 'yyyy-MM-dd'))
                            return; // Don't add to pages count
                        }
                        
                        const surahId = getSurahId(log.surah_name || "");
                        let calculated = 0;
                        if (surahId && log.start_v && log.end_v) {
                            calculated = calculatePages(surahId, log.start_v, surahId, log.end_v);
                        } else {
                            calculated = (log.start_page === log.end_page) ? 0.5 : pages;
                        }
                        
                        if (log.mode === 'New Verses') {
                            hifzPages += calculated;
                        }
                    } else if (log.mode === 'Juz Revision') {
                        const portion = log.juz_portion;
                        if (portion === 'Full') juzRevisionTotal += 1;
                        else if (portion?.includes('Half')) juzRevisionTotal += 0.5;
                        else if (portion?.startsWith('Q')) juzRevisionTotal += 0.25;
                        else juzRevisionTotal += 1; // Default to 1 if not specified
                    }
                })

                setMonthlyStats(prev => ({
                    ...prev,
                    hifzPages: parseFloat(hifzPages.toFixed(2)),
                    recentRevisionDays: recentRevisionDates.size,
                    juzRevisionJuz: parseFloat(juzRevisionTotal.toFixed(2)),
                    totalJuz: calcTotalJuz
                }))
            } else {
                setMonthlyStats(prev => ({
                    ...prev,
                    totalJuz: calcTotalJuz
                }))
            }

            setLoading(false)
        }
        loadHifzData()
    }, [student.adm_no, reportMonth])

    const weeklyReport = useMemo(() => {
        const monthStart = startOfMonth(reportMonth)
        const monthEnd = endOfMonth(reportMonth)
        const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

        const weeks: { days: Date[]; weekNum: number }[] = []
        let currentWeek: Date[] = []
        let weekNum = 1

        allDays.forEach((day, i) => {
            currentWeek.push(day)
            if (getDay(day) === 4 || i === allDays.length - 1) {
                weeks.push({ days: [...currentWeek], weekNum })
                currentWeek = []
                weekNum++
            }
        })

        return weeks.map(week => {
            const dayRows = week.days.map(day => {
                const dateStr = format(day, "yyyy-MM-dd")
                const dayOfWeek = getDay(day)

                const hifzAttendance = attendanceRecords.filter(
                    (r: any) => format(new Date(r.date), "yyyy-MM-dd") === dateStr && r.department?.toLowerCase() === "hifz"
                )
                const isPresent = hifzAttendance.some((r: any) => r.status === "Present")
                const isAbsent = hifzAttendance.some((r: any) => r.status === "Absent")

                const dayLogs = allLogs.filter((l: any) => format(new Date(l.entry_date), "yyyy-MM-dd") === dateStr)
                const newVerses = dayLogs.filter((l: any) => l.mode === "New Verses")
                const recentRev = dayLogs.filter((l: any) => l.mode === "Recent Revision")
                const juzRev = dayLogs.filter((l: any) => l.mode === "Juz Revision")

                const newVersesEntries = newVerses.map((l: any) =>
                    `${getArabic(l.surah_name)} ${l.start_v ? `(${l.start_v}-${l.end_v})` : l.verses ? `(${l.verses})` : l.page_start ? `P${l.page_start}-${l.page_end}` : ''}`
                ).filter(Boolean)

                const recentRevEntries = recentRev.map((l: any) =>
                    `${getArabic(l.surah_name)} ${l.page_start ? `P${l.page_start}-${l.page_end}` : ""}`
                ).filter(Boolean)

                const juzRevEntries = juzRev.map((l: any) =>
                    `J${l.juz || "?"} P${l.page_start}-${l.page_end}`
                ).filter(Boolean)

                return {
                    date: day,
                    dateStr,
                    dayName: format(day, "EEEE"),
                    dayNum: format(day, "d"),
                    isFriday: dayOfWeek === 5,
                    isWeekend: dayOfWeek === 6,
                    attendance: isPresent ? "P" : isAbsent ? "A" : (dayOfWeek === 5 ? "—" : ""),
                    newVersesEntries,
                    recentRevEntries,
                    juzRevEntries,
                    hasLogs: dayLogs.length > 0,
                }
            })

            const presentDays = dayRows.filter(d => d.attendance === "P").length
            const totalNew = dayRows.filter(d => d.newVersesEntries.length > 0).length
            const totalRecent = dayRows.filter(d => d.recentRevEntries.length > 0).length
            const totalJuz = dayRows.filter(d => d.juzRevEntries.length > 0).length

            return { weekNum: week.weekNum, days: dayRows, summary: { presentDays, totalNew, totalRecent, totalJuz } }
        })
    }, [allLogs, attendanceRecords, reportMonth])

    return (
        <div className="space-y-6">
            {/* ======== WEEKLY HIFZ REPORT ======== */}
            <Card className="border-none shadow-sm bg-white border border-slate-100">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base text-slate-800">Weekly Hifz Report</CardTitle>
                            <CardDescription className="text-slate-500">Monthly breakdown by week — Arabic report card style</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button size="icon" variant="outline" className="h-7 w-7"
                                onClick={() => setReportMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
                                <ChevronLeft size={14} />
                            </Button>
                            <span className="text-sm font-medium min-w-[110px] text-center">
                                {format(reportMonth, "MMMM yyyy")}
                            </span>
                            <Button size="icon" variant="outline" className="h-7 w-7"
                                onClick={() => setReportMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
                                <ChevronRight size={14} />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {loading ? (
                        <div className="text-center py-8 text-slate-400">Loading...</div>
                    ) : (
                        <div className="space-y-4">
                            {weeklyReport.map((week) => (
                                <div key={week.weekNum} className="border border-slate-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-indigo-50 dark:bg-indigo-900/40">
                                                <th className="text-left py-2 px-3 text-indigo-600 dark:text-indigo-300 font-bold text-xs" colSpan={4}>
                                                    Week {week.weekNum}
                                                </th>
                                            </tr>
                                            <tr className="bg-slate-100 dark:bg-[#1a2035] text-xs text-slate-500 dark:text-slate-400">
                                                <th className="py-1.5 px-3 text-left font-semibold w-[80px]">Date</th>
                                                <th className="py-1.5 px-2 text-left font-semibold">حفظ يومي (New Hifz)</th>
                                                <th className="py-1.5 px-2 text-left font-semibold">تسميع (Revision)</th>
                                                <th className="py-1.5 px-2 text-left font-semibold">مراجعة (Juz Rev)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {week.days.map((day) => (
                                                <tr key={day.dateStr} className={cn(
                                                    "border-t border-slate-100 dark:border-slate-700/50 transition-colors",
                                                    day.isFriday && "bg-orange-50/50 dark:bg-orange-900/10",
                                                    day.isWeekend && "bg-purple-50/50 dark:bg-purple-900/10",
                                                    day.hasLogs && "bg-emerald-50/30 dark:bg-emerald-900/10"
                                                )}>
                                                    <td className="py-1.5 px-3">
                                                        <div className="text-xs">
                                                            <span className="font-bold text-slate-800 dark:text-slate-200">{day.dayNum}</span>
                                                            <span className="text-slate-400 dark:text-slate-500 ml-1">{format(day.date, "EEE")}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-1.5 px-2 align-top">
                                                        {day.newVersesEntries.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {day.newVersesEntries.map((txt: string, idx: number) => (
                                                                    <span key={idx} className="inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 text-[10px] sm:text-xs font-medium border border-blue-100 dark:border-blue-800 break-words whitespace-normal leading-tight">
                                                                        {txt}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                                                    </td>
                                                    <td className="py-1.5 px-2 align-top">
                                                        {day.recentRevEntries.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {day.recentRevEntries.map((txt: string, idx: number) => (
                                                                    <span key={idx} className="inline-block px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400 text-[10px] sm:text-xs font-medium border border-orange-100 dark:border-orange-800 break-words whitespace-normal leading-tight">
                                                                        {txt}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                                                    </td>
                                                    <td className="py-1.5 px-2 align-top">
                                                        {day.juzRevEntries.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {day.juzRevEntries.map((txt: string, idx: number) => (
                                                                    <span key={idx} className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-[10px] sm:text-xs font-medium border border-emerald-100 dark:border-emerald-800 break-words whitespace-normal leading-tight">
                                                                        {txt}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="bg-slate-100 dark:bg-[#1a2035] border-t border-slate-200 dark:border-slate-700 font-semibold text-xs">
                                                <td className="py-2 px-3 text-slate-600 dark:text-slate-400">Summary</td>
                                                <td className="py-2 px-2 text-blue-600 dark:text-blue-400">{week.summary.totalNew} entries</td>
                                                <td className="py-2 px-2 text-orange-600 dark:text-orange-400">{week.summary.totalRecent} entries</td>
                                                <td className="py-2 px-2 text-emerald-600 dark:text-emerald-400">{week.summary.totalJuz} entries</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Monthly Status Card */}
            <Card className="border-none shadow-sm bg-white border border-slate-100">
                <CardHeader>
                    <CardTitle className="text-base text-slate-800">Monthly Status ({format(reportMonth, 'MMMM yyyy')})</CardTitle>
                    <CardDescription className="text-slate-500">Track record for the current month</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                            <p className="text-sm text-slate-500 mb-1">Hifz (Pages)</p>
                            <p className="text-2xl font-black text-blue-600">{monthlyStats.hifzPages}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-orange-50 border border-orange-100">
                            <p className="text-sm text-slate-500 mb-1">Recent Revision (Days)</p>
                            <p className="text-2xl font-black text-orange-600">{monthlyStats.recentRevisionDays}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                            <p className="text-sm text-slate-500 mb-1">Juz Revision (Juz)</p>
                            <p className="text-2xl font-black text-emerald-600">{monthlyStats.juzRevisionJuz}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-purple-50 border border-purple-100">
                            <p className="text-sm text-slate-500 mb-1">Total Hifz (Juz)</p>
                            <p className="text-2xl font-black text-purple-600">{monthlyStats.totalJuz}</p>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
                        <div className="text-sm text-slate-500">
                            Attendance: <span className="text-slate-800 font-bold">{monthlyStats.attendance}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white border border-slate-100">
                    <CardHeader>
                        <CardTitle className="text-base text-slate-800">Recent Activity</CardTitle>
                        <CardDescription className="text-slate-500">Latest Hifz entries</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {loading ? (
                                <div className="text-center text-slate-400">Loading...</div>
                            ) : data.length === 0 ? (
                                <div className="text-center text-slate-400">No recent activity</div>
                            ) : (
                                [...data].reverse().slice(0, 5).map((item, i) => (
                                    <div key={i} className="flex items-center justify-between text-sm p-3 bg-slate-50 hover:bg-indigo-50 rounded-xl transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${item.mode === 'New Verses' ? 'bg-blue-500' : item.mode === 'Recent Revision' ? 'bg-orange-500' : 'bg-emerald-500'}`} />
                                            <div>
                                                <span className="text-slate-800 font-semibold block">{item.mode}</span>
                                                <span className="text-slate-500 text-xs block mt-0.5 break-words whitespace-normal">{item.details}</span>
                                                {item.recorded_by_name && (
                                                    <span className="text-[10px] text-slate-400 italic block mt-0.5">Recorded by: <span className="font-medium text-slate-500 not-italic">{item.recorded_by_name}</span></span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className={`font-bold text-sm ${item.rating >= 4 ? 'text-emerald-600' : item.rating >= 3 ? 'text-yellow-600' : 'text-red-500'}`}>
                                                {item.rating}/5
                                            </span>
                                            <span className="text-slate-400 text-[10px]">{item.date}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
        </div>
    )
}
