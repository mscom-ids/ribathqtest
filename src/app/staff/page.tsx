"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search, User, BookOpen, ChevronRight, ArrowLeft } from "lucide-react"
import { format, startOfDay, endOfDay } from "date-fns"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import api from "@/lib/api"
import { StudentProfileView } from "@/components/admin/student-profile/student-profile-view"

// Extended Student Type to match StudentProfileView requirements
type Student = {
    adm_no: string
    name: string
    photo_url: string | null
    batch_year: string
    standard: string
    dob: string
    assigned_usthad: { name: string } | null
    today_stats?: {
        hifz: number // pages
        revision: number // pages
        juz: number // count
        attendance: string // 'Present', 'Absent', 'Late', etc.
    }
}

export default function StaffDashboard() {
    const [students, setStudents] = useState<Student[]>([])
    const [filteredStudents, setFilteredStudents] = useState<Student[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
    const router = useRouter()

    useEffect(() => {
        loadStudents()
    }, [router])

    useEffect(() => {
        const filtered = students.filter(s =>
            s.name.toLowerCase().includes(search.toLowerCase()) ||
            s.adm_no.toLowerCase().includes(search.toLowerCase())
        )
        setFilteredStudents(filtered)
    }, [search, students])

    async function loadStudents() {
        setLoading(true)
        try {
            // 1. Get my staff profile
            const profileRes = await api.get('/staff/me')
            if (!profileRes.data.success) {
                router.push("/login")
                return
            }
            const staffId = profileRes.data.staff.id
            const todayDate = format(new Date(), "yyyy-MM-dd")

            // 2. Get my assigned students + today's stats
            const studentsRes = await api.get('/staff/me/students', { params: { date: todayDate } })
            if (studentsRes.data.success) {
                const students: Student[] = studentsRes.data.students || []
                setStudents(students)
            }
        } catch (err) {
            console.error('Failed to load students:', err)
        }
        setLoading(false)
    }

    return (
        <div className="flex-1 flex overflow-hidden h-full">
            {/* Note: Parent layout provides flex-1 and h-full context via main */}

            {/* Left Sidebar (Student List) */}
            <div className={`
                w-full md:w-[380px] flex-shrink-0 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col
                ${selectedStudent ? 'hidden md:flex' : 'flex'}
            `}>
                {/* Search */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search students..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-slate-50 dark:bg-slate-900"
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <div className="h-6 w-6 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                        </div>
                    ) : filteredStudents.length === 0 ? (
                        <div className="text-center py-10 text-slate-500 text-sm">No students found</div>
                    ) : (
                        <div className="space-y-2">
                            {filteredStudents.map((student) => (
                                <div
                                    key={student.adm_no}
                                    className={`
                                        p-3 rounded-lg cursor-pointer transition-all border
                                        ${selectedStudent?.adm_no === student.adm_no
                                            ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                                            : "bg-white dark:bg-slate-900 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
                                        }
                                    `}
                                >
                                    <div className="flex items-center justify-between" onClick={() => setSelectedStudent(student)}>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-10 w-10">
                                                <AvatarImage src={student.photo_url || ""} />
                                                <AvatarFallback>{student.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <h3 className={`text-sm font-semibold ${selectedStudent?.adm_no === student.adm_no ? 'text-emerald-900 dark:text-emerald-300' : 'text-slate-900 dark:text-slate-200'}`}>
                                                    {student.name}
                                                </h3>
                                                <p className="text-xs text-slate-500">ID: {student.adm_no} • {student.standard || "Hifz"}</p>
                                            </div>
                                        </div>
                                        {/* Minimal Daily Status Icons */}
                                        <div className="flex flex-col items-end gap-1">
                                            {student.today_stats ? (
                                                <div
                                                    className={`w-2 h-2 rounded-full ${student.today_stats.attendance === 'Present' || student.today_stats.attendance === 'present' ? 'bg-emerald-500' :
                                                            student.today_stats.attendance === 'Absent' ? 'bg-red-500' :
                                                                student.today_stats.attendance === 'Leave' ? 'bg-yellow-500' : 'bg-slate-300'
                                                        }`}
                                                />
                                            ) : null}
                                            <ChevronRight className="h-4 w-4 text-slate-300" />
                                        </div>
                                    </div>

                                    {/* Today's Hifz Stats + Quick Action */}
                                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                        {student.today_stats ? (
                                            <div className="flex items-center gap-3 text-[11px] text-slate-500">
                                                {student.today_stats.hifz > 0 && (
                                                    <span className="flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                        {student.today_stats.hifz} new
                                                    </span>
                                                )}
                                                {student.today_stats.revision > 0 && (
                                                    <span className="flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                                        {student.today_stats.revision} pg rev
                                                    </span>
                                                )}
                                                {student.today_stats.juz > 0 && (
                                                    <span className="flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                                        {student.today_stats.juz} juz
                                                    </span>
                                                )}
                                                {student.today_stats.hifz === 0 && student.today_stats.revision === 0 && student.today_stats.juz === 0 && (
                                                    <span className="text-slate-400">No entries today</span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-[11px] text-slate-400">No entries today</span>
                                        )}
                                        <Link href={`/staff/entry/${student.adm_no}`} onClick={(e) => e.stopPropagation()}>
                                            <Button size="sm" className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                                                <BookOpen className="h-3 w-3" />
                                                Record
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel (Details) */}
            <div className={`
                flex-1 bg-slate-50 dark:bg-slate-950 overflow-y-auto
                ${selectedStudent ? 'block' : 'hidden md:block'}
            `}>
                {selectedStudent ? (
                    <div className="h-full flex flex-col">
                        {/* Mobile Header for Detail View */}
                        <div className="md:hidden p-4 border-b bg-white dark:bg-slate-900 flex items-center gap-3 sticky top-0 z-10">
                            <Button variant="ghost" size="icon" onClick={() => setSelectedStudent(null)} className="-ml-2">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                            <span className="font-semibold text-lg">{selectedStudent.name}</span>
                        </div>

                        <div className="p-4 md:p-6 pb-20 max-w-5xl mx-auto animate-in fade-in zoom-in-95 duration-300 flex-1 w-full">
                            <div className="flex justify-end mb-4">
                                <Link href={`/staff/entry/${selectedStudent.adm_no}`}>
                                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg gap-2">
                                        <div className="bg-white/20 p-1 rounded-full"><BookOpen className="h-3 w-3" /></div>
                                        Daily Entry
                                    </Button>
                                </Link>
                            </div>
                            <StudentProfileView student={selectedStudent} isAdmin={false} />
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
                        <div className="bg-slate-100 dark:bg-slate-900 p-6 rounded-full mb-4">
                            <User className="h-12 w-12 text-slate-300" />
                        </div>
                        <h2 className="text-lg font-medium text-slate-600 dark:text-slate-300">Select a student</h2>
                        <p className="text-sm">Choose a student from the list to view their profile</p>
                    </div>
                )}
            </div>

        </div>
    )
}
