import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { type Student } from "@/app/admin/students/page"
import { supabase } from "@/lib/auth"
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
        recentRevisionPages: 0,
        juzRevisionJuz: 0,
        totalJuz: 0,
        grade: "NO GRADE",
        attendance: "0/0" // Placeholder
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

            // Fetch last 60 days of logs (to cover current month + some context)
            const [logsRes, attendRes] = await Promise.all([
                supabase
                    .from("hifz_logs")
                    .select("*") // fetching all columns for better calculation
                    .eq("student_id", student.adm_no)
                    .gte("entry_date", subDays(today, 60).toISOString())
                    .order("entry_date", { ascending: true }),
                supabase
                    .from("attendance")
                    .select("date, session_id, status, department")
                    .eq("student_id", student.adm_no)
                    .gte("date", monthStartStr)
                    .lte("date", monthEndStr),
            ])

            const logs = logsRes.data || []
            setAllLogs(logs.filter(l => {
                const d = new Date(l.entry_date)
                return d >= startOfCurrentMonth && d <= endOfCurrentMonth
            }))
            setAttendanceRecords(attendRes.data || [])

            if (logs.length > 0) {
                // 1. Process Chart Data (Last 30 Days)
                const last30Days = logs.filter(l => new Date(l.entry_date) >= subDays(today, 30))
                const processed = last30Days.map(log => ({
                    date: format(new Date(log.entry_date), 'dd/MM'),
                    rating: log.rating,
                    mode: log.mode,
                    details: log.mode === 'New Verses'
                        ? `${getArabic(log.surah_name)} ${log.start_v ? `(${log.start_v}-${log.end_v})` : log.verses ? `(${log.verses})` : ''}`
                        : log.mode === 'Recent Revision'
                            ? `${getArabic(log.surah_name)}`
                            : `Juz ${log.juz} (Pg ${log.page_start}-${log.page_end})`
                }))
                setData(processed)

                // 2. Calculate Monthly Stats
                const currentMonthLogs = logs.filter(l =>
                    isWithinInterval(new Date(l.entry_date), { start: startOfCurrentMonth, end: endOfCurrentMonth })
                )

                let hifzPages = 0
                let recentRevisionPages = 0
                let juzRevisionPages = 0
                let totalRatings = 0
                let ratingCount = 0

                // Find max juz ever recorded (approximation for Total Hifz)
                // We'll scan ALL logs passed (60 days) + maybe check student record if available?
                // For now, let's use the max juz seen in the logs we have. Ideally we'd query `max(juz)` from DB.
                // Or better, let's fetch the max juz separately to be accurate.

                currentMonthLogs.forEach(log => {
                    const pages = (log.page_end - log.page_start + 1) || 0

                    if (log.mode === 'New Verses') {
                        const surahId = getSurahId(log.surah_name || "");
                        if (surahId && log.start_v && log.end_v) {
                            hifzPages += calculatePages(surahId, log.start_v, surahId, log.end_v);
                        } else {
                            hifzPages += (log.page_start === log.page_end) ? 0.5 : pages;
                        }
                    } else if (log.mode === 'Recent Revision') {
                        recentRevisionPages += pages
                    } else if (log.mode === 'Juz Revision') {
                        juzRevisionPages += pages
                    }

                    if (log.rating) {
                        totalRatings += log.rating
                        ratingCount++
                    }
                })

                // Grade Calculation
                const avgRating = ratingCount > 0 ? (totalRatings / ratingCount).toFixed(1) : "NO GRADE"

                setMonthlyStats(prev => ({
                    ...prev,
                    hifzPages: parseFloat(hifzPages.toFixed(2)),
                    recentRevisionPages,
                    juzRevisionJuz: parseFloat((juzRevisionPages / 20).toFixed(2)), // 20 pages = 1 Juz
                    grade: avgRating.toString()
                }))
            }

            // Fetch Total Juz (Max Juz)
            const { data: maxJuzData } = await supabase
                .from("hifz_logs")
                .select("juz")
                .eq("student_id", student.adm_no)
                .order("juz", { ascending: false })
                .limit(1)

            if (maxJuzData && maxJuzData.length > 0) {
                setMonthlyStats(prev => ({ ...prev, totalJuz: maxJuzData[0].juz }))
            }

            setLoading(false)
        }
        loadHifzData()
    }, [student.adm_no, reportMonth])

    // Generate weekly report data
    const weeklyReport = useMemo(() => {
        const monthStart = startOfMonth(reportMonth)
        const monthEnd = endOfMonth(reportMonth)
        const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

        // Group days into weeks (Sun-Thu = active, Fri-Sat = off for some)
        const weeks: { days: Date[]; weekNum: number }[] = []
        let currentWeek: Date[] = []
        let weekNum = 1

        allDays.forEach((day, i) => {
            currentWeek.push(day)
            // End of week on Thursday (4) or last day of month
            if (getDay(day) === 4 || i === allDays.length - 1) {
                weeks.push({ days: [...currentWeek], weekNum })
                currentWeek = []
                weekNum++
            }
        })

        // Process each week
        return weeks.map(week => {
            const dayRows = week.days.map(day => {
                const dateStr = format(day, "yyyy-MM-dd")
                const dayOfWeek = getDay(day)

                // Get attendance for this day (any Hifz session)
                const hifzAttendance = attendanceRecords.filter(
                    r => r.date === dateStr && r.department === "hifz"
                )
                const isPresent = hifzAttendance.some(r => r.status === "Present")
                const isAbsent = hifzAttendance.some(r => r.status === "Absent")

                // Get hifz logs for this day
                const dayLogs = allLogs.filter(l => format(new Date(l.entry_date), "yyyy-MM-dd") === dateStr)

                const newVerses = dayLogs.filter(l => l.mode === "New Verses")
                const recentRev = dayLogs.filter(l => l.mode === "Recent Revision")
                const juzRev = dayLogs.filter(l => l.mode === "Juz Revision")

                const newVersesText = newVerses.map(l =>
                    `${getArabic(l.surah_name)} ${l.start_v ? `(${l.start_v}-${l.end_v})` : l.verses ? `(${l.verses})` : l.page_start ? `P${l.page_start}-${l.page_end}` : ''}`
                ).join(", ")

                const recentRevText = recentRev.map(l =>
                    `${getArabic(l.surah_name)} ${l.page_start ? `P${l.page_start}-${l.page_end}` : ""}`
                ).join(", ")

                const juzRevText = juzRev.map(l =>
                    `J${l.juz || "?"} P${l.page_start}-${l.page_end}`
                ).join(", ")

                const rating = dayLogs.length > 0
                    ? (dayLogs.reduce((sum: number, l: any) => sum + (l.rating || 0), 0) / dayLogs.length).toFixed(1)
                    : null

                return {
                    date: day,
                    dateStr,
                    dayName: format(day, "EEEE"),
                    dayNum: format(day, "d"),
                    isFriday: dayOfWeek === 5,
                    isWeekend: dayOfWeek === 6,
                    attendance: isPresent ? "P" : isAbsent ? "A" : (dayOfWeek === 5 ? "—" : ""),
                    newVersesText,
                    recentRevText,
                    juzRevText,
                    rating,
                    hasLogs: dayLogs.length > 0,
                }
            })

            // Weekly summary
            const presentDays = dayRows.filter(d => d.attendance === "P").length
            const totalNew = dayRows.filter(d => d.newVersesText).length
            const totalRecent = dayRows.filter(d => d.recentRevText).length
            const totalJuz = dayRows.filter(d => d.juzRevText).length

            return { weekNum: week.weekNum, days: dayRows, summary: { presentDays, totalNew, totalRecent, totalJuz } }
        })
    }, [allLogs, attendanceRecords, reportMonth])

    return (
        <div className="space-y-6">
            {/* ======== WEEKLY HIFZ REPORT (Arabic Report Card Style) ======== */}
            <Card className="border-none shadow-sm bg-slate-900/50 border border-slate-800">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base text-slate-100">Weekly Hifz Report</CardTitle>
                            <CardDescription className="text-slate-400">Monthly breakdown by week — Arabic report card style</CardDescription>
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
                                <div key={week.weekNum} className="border border-slate-700 rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-800/60">
                                                <th className="text-left py-2 px-3 text-emerald-400 font-semibold text-xs" colSpan={6}>
                                                    Week {week.weekNum}
                                                </th>
                                            </tr>
                                            <tr className="bg-slate-800/30 text-xs text-slate-400">
                                                <th className="py-1.5 px-3 text-left font-medium w-[80px]">Date</th>
                                                <th className="py-1.5 px-2 text-left font-medium">حفظ يومي (New Hifz)</th>
                                                <th className="py-1.5 px-2 text-left font-medium">تسميع (Revision)</th>
                                                <th className="py-1.5 px-2 text-left font-medium">مراجعة (Juz Rev)</th>
                                                <th className="py-1.5 px-2 text-center font-medium w-[40px]">⭐</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {week.days.map((day) => (
                                                <tr key={day.dateStr} className={cn(
                                                    "border-t border-slate-800/50 transition-colors",
                                                    day.isFriday && "bg-orange-950/10",
                                                    day.isWeekend && "bg-purple-950/10",
                                                    day.hasLogs && "bg-emerald-950/5"
                                                )}>
                                                    <td className="py-1.5 px-3">
                                                        <div className="text-xs">
                                                            <span className="font-medium text-white/80">{day.dayNum}</span>
                                                            <span className="text-slate-500 ml-1">{format(day.date, "EEE")}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-1.5 px-2 text-xs text-blue-300 max-w-[150px] truncate" title={day.newVersesText}>
                                                        {day.newVersesText || <span className="text-slate-600">—</span>}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-xs text-orange-300 max-w-[150px] truncate" title={day.recentRevText}>
                                                        {day.recentRevText || <span className="text-slate-600">—</span>}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-xs text-emerald-300 max-w-[150px] truncate" title={day.juzRevText}>
                                                        {day.juzRevText || <span className="text-slate-600">—</span>}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-center">
                                                        {day.rating ? (
                                                            <span className={cn(
                                                                "text-xs font-bold",
                                                                Number(day.rating) >= 4 ? "text-emerald-400" :
                                                                    Number(day.rating) >= 3 ? "text-yellow-400" : "text-red-400"
                                                            )}>
                                                                {day.rating}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-600 text-xs">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {/* Weekly Summary Row */}
                                            <tr className="bg-slate-800/40 border-t border-slate-600 font-medium text-xs">
                                                <td className="py-2 px-3 text-slate-300">Summary</td>
                                                <td className="py-2 px-2 text-blue-400">{week.summary.totalNew} entries</td>
                                                <td className="py-2 px-2 text-orange-400">{week.summary.totalRecent} entries</td>
                                                <td className="py-2 px-2 text-emerald-400">{week.summary.totalJuz} entries</td>
                                                <td className="py-2 px-2"></td>
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
            <Card className="border-none shadow-sm bg-slate-900/50 border border-slate-800">
                <CardHeader>
                    <CardTitle className="text-base text-slate-100">Monthly Status ({format(reportMonth, 'MMMM yyyy')})</CardTitle>
                    <CardDescription className="text-slate-400">Track record for the current month</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                            <p className="text-sm text-slate-400 mb-1">Hifz (Pages)</p>
                            <p className="text-2xl font-bold text-blue-400">{monthlyStats.hifzPages}</p>
                            <p className="text-xs text-slate-500 mt-1">ഹിഫ്ളാക്കിയ പേജ്</p>
                        </div>
                        <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                            <p className="text-sm text-slate-400 mb-1">Recent Revision (Pages)</p>
                            <p className="text-2xl font-bold text-orange-400">{monthlyStats.recentRevisionPages}</p>
                            <p className="text-xs text-slate-500 mt-1">പഴയ പാഠം</p>
                        </div>
                        <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                            <p className="text-sm text-slate-400 mb-1">Juz Revision (Juz)</p>
                            <p className="text-2xl font-bold text-emerald-400">{monthlyStats.juzRevisionJuz}</p>
                            <p className="text-xs text-slate-500 mt-1">ആവർത്തനം</p>
                        </div>
                        <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                            <p className="text-sm text-slate-400 mb-1">Total Hifz (Juz)</p>
                            <p className="text-2xl font-bold text-purple-400">{monthlyStats.totalJuz}</p>
                            <p className="text-xs text-slate-500 mt-1">ആകെ ഹിഫ്ളാക്കിയ ജുസ്അ്</p>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center">
                        <div className="text-sm text-slate-400">
                            Attendance: <span className="text-slate-200 font-medium">{monthlyStats.attendance}</span>
                        </div>
                        <div className="text-sm text-slate-400">
                            Grade: <span className={`font-bold ${monthlyStats.grade === 'NO GRADE' ? 'text-slate-500' : Number(monthlyStats.grade) >= 4 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                                {monthlyStats.grade}
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-none shadow-sm bg-slate-900/50 border border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-base text-slate-100">Performance Trend (Last 30 Days)</CardTitle>
                        <CardDescription className="text-slate-400">Daily proficiency ratings</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[250px] w-full">
                            {loading ? (
                                <div className="h-full flex items-center justify-center text-slate-400">Loading...</div>
                            ) : data.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-slate-400">No data available</div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={data}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                        <XAxis
                                            dataKey="date"
                                            stroke="#94a3b8"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <YAxis
                                            stroke="#94a3b8"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            domain={[0, 5]}
                                            ticks={[1, 2, 3, 4, 5]}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', color: '#f8fafc' }}
                                            itemStyle={{ color: '#1eb182' }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="rating"
                                            stroke="#10b981"
                                            strokeWidth={2}
                                            dot={{ fill: '#10b981', r: 4 }}
                                            activeDot={{ r: 6 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-slate-900/50 border border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-base text-slate-100">Recent Activity</CardTitle>
                        <CardDescription className="text-slate-400">Latest Hifz entries</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {loading ? (
                                <div className="text-center text-slate-400">Loading...</div>
                            ) : data.length === 0 ? (
                                <div className="text-center text-slate-400">No recent activity</div>
                            ) : (
                                // Use slice on a reversed copy to show newest first, limiting to 5
                                [...data].reverse().slice(0, 5).map((item, i) => (
                                    <div key={i} className="flex items-center justify-between text-sm p-2 hover:bg-slate-800/30 rounded-lg transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`h-2 w-2 rounded-full flex-shrink-0 ${item.mode === 'New Verses' ? 'bg-blue-500' :
                                                item.mode === 'Recent Revision' ? 'bg-orange-500' : 'bg-emerald-500'
                                                }`} />
                                            <div>
                                                <span className="text-slate-200 font-medium block">{item.mode}</span>
                                                <span className="text-slate-400 text-xs block mt-0.5">{item.details}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className={`font-bold ${item.rating >= 4 ? 'text-emerald-500' : item.rating >= 3 ? 'text-yellow-500' : 'text-red-500'}`}>
                                                {item.rating}/5
                                            </span>
                                            <span className="text-slate-500 text-[10px]">{item.date}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
