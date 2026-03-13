"use client"

import { useEffect, useState, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Plus, Search, MoreHorizontal, LayoutGrid, List, GraduationCap, Users, Filter, ChevronLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import api from "@/lib/api"
import { StudentCard } from "@/components/admin/student-card"
import { StudentProfileView } from "@/components/admin/student-profile/student-profile-view"
import { getActiveStudents } from "../financeActions"

export type Student = {
    adm_no: string
    name: string
    batch_year: string
    standard: string
    photo_url: string | null
    dob: string
    assigned_usthad: { name: string } | null
    progress?: number
    status?: string
    comprehensive_details?: any
}

function calculateAge(dob: string) {
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

function StudentsPageContent() {
    const searchParams = useSearchParams()
    const filterFromUrl = searchParams.get('filter') as "all" | "active" | "completed" | "dropout" | null
    const [students, setStudents] = useState<Student[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed" | "dropout">(filterFromUrl || "active")
    const [isMobileView, setIsMobileView] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        if (filterFromUrl) setStatusFilter(filterFromUrl)
    }, [filterFromUrl])

    // Handle screen resize to track mobile view
    useEffect(() => {
        setMounted(true)
        const handleResize = () => {
            setIsMobileView(window.innerWidth < 1024)
        }

        // Initial check
        handleResize()

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    // ── Shared refresh function ─────────────────────────────────────────────
    const refreshStudents = async (showLoading = false) => {
        if (showLoading) setLoading(true)
        try {
            const res = await getActiveStudents()
            if (!res.success || !res.data) return

            const merged = (res.data as any).map((s: any) => ({
                ...s,
                dob: s.dob || s.date_of_birth,
                progress: 0
            }))

            // Preserve existing hifz progress values
            merged.forEach((s: any) => {
                const existing = students.find(st => st.adm_no === s.adm_no)
                if (existing) s.progress = existing.progress || 0
            })

            setStudents(merged)

            // Keep selected student in sync — deselect if transferred away
            setSelectedStudent(prev => {
                if (!prev) return null
                const still = merged.find((s: any) => s.adm_no === prev.adm_no)
                return still ?? null
            })
        } catch (err: any) {
            console.error('Error refreshing students:', err.message || err)
        } finally {
            if (showLoading) setLoading(false)
        }
    }

    // ── Initial load (with hifz progress) ────────────────────────────────────
    useEffect(() => {
        async function initialLoad() {
            setLoading(true)
            try {
                const res = await getActiveStudents()
                if (!res.success || !res.data) throw new Error(res.error || 'Failed to load')
                const merged = (res.data as any).map((s: any) => ({
                    ...s,
                    dob: s.dob || s.date_of_birth,
                    progress: 0
                }))

                try {
                    const progRes = await api.get('/hifz/progress-summary')
                    if (progRes.data.success && progRes.data.progressMap) {
                        const pMap = progRes.data.progressMap
                        merged.forEach((s: any) => { s.progress = pMap[s.adm_no] || 0 })
                    }
                } catch (_) { /* hifz progress is optional */ }

                setStudents(merged)
            } catch (error: any) {
                console.error('Error loading students:', error.message || error)
            } finally {
                setLoading(false)
            }
        }
        initialLoad()
    }, [])

    // ── Auto-poll every 30 s to sync across devices/browsers ─────────────────
    useEffect(() => {
        const interval = setInterval(() => { refreshStudents() }, 30_000)
        return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [students])

    // ── Filter students by search and status ─────────────────────────────────
    const filtered = students.filter(s => {
        const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
            s.adm_no.toLowerCase().includes(search.toLowerCase())
        // Treat null/undefined status as 'active'
        const effectiveStatus = s.status || 'active'
        const matchStatus = statusFilter === 'all' || effectiveStatus === statusFilter
        return matchSearch && matchStatus
    })

    // Status change handler
    const updateStudentStatus = async (admNo: string, newStatus: string) => {
        try {
            const res = await api.put(`/students/${admNo}`, { status: newStatus })
            if (res.data.success) {
                setStudents(prev => prev.map(s => s.adm_no === admNo ? { ...s, status: newStatus } : s))
                if (selectedStudent?.adm_no === admNo) {
                    setSelectedStudent(prev => prev ? { ...prev, status: newStatus } : null)
                }
            }
        } catch (error) {
            console.error("Failed to update status", error)
        }
    }

    const statusCounts = {
        all: students.length,
        active: students.filter(s => (s.status || 'active') === 'active').length,
        completed: students.filter(s => s.status === 'completed').length,
        dropout: students.filter(s => s.status === 'dropout').length,
    }

    // Effect to select first student on load if none selected (optional, or leave empty)
    useEffect(() => {
        if (!selectedStudent && filtered.length > 0 && !loading) {
            // Optional: Auto-select first? Let's keep it null to show "Select a student" prompt
        }
    }, [loading, filtered])


    return (
        <div className="h-full flex flex-col gap-4 overflow-hidden">
            {/* Header — hidden on mobile when a student profile is active */}
            <div className={`flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-shrink-0 ${mounted && isMobileView && selectedStudent ? 'hidden' : 'flex'}`}>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Students</h1>
                    <p className="text-slate-500 dark:text-slate-400">Manage student records and assignments.</p>
                </div>
                <Link href="/admin/students/create">
                    <Button className="bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20">
                        <Plus className="mr-2 h-4 w-4" /> Add Student
                    </Button>
                </Link>
            </div>

            {/* Main Content Area - Split View */}
            {/* On mobile, render only the list OR only the profile — not both side by side */}
            <div className={`flex-1 overflow-hidden min-h-0 relative ${mounted && isMobileView ? 'flex flex-col' : 'flex gap-6'
                }`}>

                {/* Left Panel - Student List: hidden on mobile when a student is selected */}
                <div className={`
                    lg:w-[380px] flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm flex-shrink-0
                    ${mounted && isMobileView && selectedStudent ? 'hidden' : 'flex w-full h-full overflow-hidden'}
                `}>

                    {/* Search & Filter */}
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search students..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus-visible:ring-emerald-500"
                            />
                        </div>
                        {/* Status filters migrated to Alumni section */}
                        <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>Showing {filtered.length} students</span>
                        </div>
                    </div>

                    {/* Scrollable List */}
                    <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-40 space-y-2">
                                <div className="h-6 w-6 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                                <p className="text-xs text-slate-500">Loading students...</p>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-center p-4">
                                <Users className="h-8 w-8 text-slate-300 mb-2" />
                                <p className="text-sm text-slate-500 font-medium">No students found</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {filtered.map((student) => (
                                    <div
                                        key={student.adm_no}
                                        onClick={() => setSelectedStudent(student)}
                                        className={`
                                            group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 border border-transparent
                                            ${selectedStudent?.adm_no === student.adm_no
                                                ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 shadow-sm"
                                                : "hover:bg-slate-50 dark:hover:bg-slate-900 border-transparent hover:border-slate-100 dark:hover:border-slate-800"
                                            }
                                        `}
                                    >
                                        <div className="relative flex-shrink-0">
                                            {student.photo_url ? (
                                                <img
                                                    src={student.photo_url}
                                                    alt={student.name}
                                                    className="h-10 w-10 rounded-full object-cover ring-2 ring-white dark:ring-slate-900 shadow-sm"
                                                />
                                            ) : (
                                                <div className={`
                                                    h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ring-2 ring-white dark:ring-slate-900
                                                    ${selectedStudent?.adm_no === student.adm_no
                                                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300"
                                                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 group-hover:bg-white dark:group-hover:bg-slate-700"
                                                    }
                                                `}>
                                                    {student.name.charAt(0)}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-0.5">
                                                <h3 className={`font-semibold text-sm truncate ${selectedStudent?.adm_no === student.adm_no ? "text-emerald-900 dark:text-emerald-100" : "text-slate-900 dark:text-slate-200"}`}>
                                                    {student.name}
                                                </h3>
                                                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                                    {student.adm_no}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
                                                <span>{student.standard || "N/A"} Std</span>
                                                <span className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
                                                <span className="truncate">{student.batch_year ? `Batch ${student.batch_year}` : "No Batch"}</span>
                                            </div>
                                        </div>

                                        {/* Status Indicator Only */}
                                        <div className="ml-auto flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${(student.status || 'active') === 'active' ? 'bg-emerald-500' :
                                                student.status === 'completed' ? 'bg-blue-500' :
                                                    student.status === 'dropout' ? 'bg-red-500' : 'bg-slate-500'
                                                }`} title={`Status: ${student.status || 'active'}`} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Side - Student Details & Tabs */}
                {/* On mobile, completely hide if NO student is selected. Otherwise, take full width */}
                <div className={`
                    flex-1 min-w-0 min-h-0 overflow-y-auto scrollbar-hide flex-col transition-all duration-300
                    ${mounted && isMobileView && !selectedStudent ? 'hidden' : 'flex'}
                `}>
                    {/* Mobile Back Button */}
                    {mounted && isMobileView && selectedStudent && (
                        <div className="mb-4">
                            <Button
                                variant="ghost"
                                className="pl-0 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                                onClick={() => setSelectedStudent(null)}
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Back to Students
                            </Button>
                        </div>
                    )}

                    {/* Student Profile View */}
                    <StudentProfileView student={selectedStudent} onStudentUpdated={async (newStatus?: string) => {
                        // Optimistic update: instantly reflect the change in local state
                        if (newStatus && selectedStudent) {
                            // Update local status immediately
                            setStudents(prev => prev.map(s =>
                                s.adm_no === selectedStudent.adm_no ? { ...s, status: newStatus } : s
                            ))
                            setSelectedStudent(prev => prev ? { ...prev, status: newStatus } : null)
                        }

                        // Full server sync (cache: no-store ensures fresh data)
                        await refreshStudents()
                    }} />
                </div>
            </div>
        </div>
    )
}

export default function StudentsPage() {
    return (
        <Suspense fallback={
            <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
        }>
            <StudentsPageContent />
        </Suspense>
    )
}


