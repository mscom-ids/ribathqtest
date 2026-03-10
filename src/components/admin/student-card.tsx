import Link from "next/link"
import { Button } from "@/components/ui/button"
import { User } from "lucide-react"

// Helper to calculate age
function getAge(dob: string) {
    if (!dob) return "N/A"
    const birthDate = new Date(dob)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const m = today.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--
    }
    return age
}

export interface Student {
    adm_no: string
    name: string
    batch_year: string
    standard: string
    photo_url: string | null
    dob: string
    assigned_usthad: { name: string } | null
    progress?: number
}

interface StudentCardProps {
    student: Student
}

export function StudentCard({ student }: StudentCardProps) {
    // Batch Calculation: 2018 is Batch 1.
    // So Batch = Year - 2017.
    const admissionYear = parseInt(student.batch_year || "2024")
    const batchNum = isNaN(admissionYear) ? "?" : Math.max(1, admissionYear - 2017)

    // Progress Calculation
    const progress = student.progress || 0
    const totalJuz = 30
    const progressPercent = Math.round((progress / totalJuz) * 100)

    return (
        <div className="group bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300 p-4 flex gap-4">

            {/* Left: Photo Section */}
            <div className="relative shrink-0 w-20 h-20 sm:w-24 sm:h-24">
                <div className="w-full h-full rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center">
                    {student.photo_url ? (
                        <img
                            src={student.photo_url}
                            alt={student.name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <User className="w-8 h-8 text-slate-300" />
                    )}
                </div>

                {/* ID Badge (Top Right of Photo) */}
                <div className="absolute -top-2 -right-2 bg-white dark:bg-slate-800 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-slate-100 dark:border-slate-700 z-10">
                    {student.adm_no}
                </div>

                {/* Age Badge (Bottom Left) */}
                <div className="absolute -bottom-2 -left-1 bg-black/70 text-white text-[9px] font-medium px-1.5 py-0.5 rounded z-10 backdrop-blur-sm">
                    {getAge(student.dob)} Yrs
                </div>
            </div>

            {/* Right: Content Section */}
            <div className="flex-1 min-w-0 flex flex-col justify-between">

                {/* Header: Name (Full Width) */}
                <div className="mb-0.5">
                    <h3 className="font-bold text-lg leading-tight text-slate-900 dark:text-slate-50 line-clamp-1 break-words" title={student.name}>
                        {student.name}
                    </h3>
                </div>

                {/* Row 2: Meta & Progress */}
                <div className="flex items-center justify-between gap-2 mt-0.5">
                    {/* Meta: Standard, Year, Batch */}
                    <div className="flex items-center gap-1.5 text-sm text-slate-500 font-medium whitespace-nowrap">
                        <span className="bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 min-w-[1.5rem] text-center text-xs">
                            {student.standard || "Hifz"}
                        </span>
                        <span className="text-xs">{student.batch_year}</span>
                        <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">
                            B{batchNum}
                        </span>
                    </div>

                    {/* Compact Progress Pill */}
                    <div className="shrink-0 bg-slate-100 dark:bg-slate-900 rounded-full py-0.5 px-2 text-[10px] font-semibold border border-slate-200 dark:border-slate-800 flex items-center gap-1.5">
                        <span className="text-slate-500 hidden sm:inline text-[9px]">Done</span>
                        <div className="w-8 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${progressPercent}%` }} />
                        </div>
                        <span className="text-slate-900 dark:text-slate-200 min-w-[2ch] mx-0.5">{progress}/30</span>
                    </div>
                </div>

                {/* Footer: Action & Usthad */}
                <div className="flex justify-between items-end mt-2">
                    <Link href={`/admin/students/${student.adm_no}`}>
                        <Button variant="outline" size="sm" className="h-7 text-xs px-3 bg-transparent hover:bg-slate-50">
                            View Profile
                        </Button>
                    </Link>

                    <div className="text-xs text-right">
                        <span className="text-slate-400 block text-[9px] uppercase tracking-wider">Mentor</span>
                        <span className="font-medium text-emerald-700 dark:text-emerald-400 truncate max-w-[100px] block">
                            {student.assigned_usthad?.name || "Unassigned"}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
