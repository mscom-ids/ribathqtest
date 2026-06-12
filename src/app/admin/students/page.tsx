"use client"

import { useEffect, useState, useMemo, useRef, Suspense, useCallback } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import {
    Plus, Search, Users, Filter, LayoutGrid, List, Eye,
    ChevronDown, ArrowUpDown, GraduationCap, UserCheck, Download
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import api from "@/lib/api"
import { cachedGet } from "@/lib/api-cache"
import { ThreeBallLoader } from "@/components/ui/three-ball-loader"

export type Student = {
    adm_no: string
    name: string
    batch_year: string
    standard: string
    photo_url: string | null
    dob: string
    hifz_mentor?: { name: string } | null
    school_mentor?: { name: string } | null
    madrasa_mentor?: { name: string } | null
    hifz_mentor_id?: string | null
    school_mentor_id?: string | null
    madrasa_mentor_id?: string | null
    assigned_usthad?: { name: string } | null
    progress?: number
    status?: string
    comprehensive_details?: {
        basic?: { gender?: string }
        admission?: { admission_date?: string }
        [key: string]: unknown
    }
    gender?: string
    date_of_join?: string
    admission_date?: string
    father_name?: string
    parent_name?: string
    phone_number?: string
}

type StudentApiRow = Partial<Student> & {
    date_of_birth?: string
}

type StudentStatusFilter = "all" | "active" | "completed" | "dropout"
type StudentSort = "name" | "adm_no" | "standard"

type StudentsPageResponse = {
    success: boolean
    students?: StudentApiRow[]
    pagination?: { limit: number; offset: number; total: number }
    error?: string
}

type StudentCounts = {
    total: number
    active: number
    completed: number
    dropout: number
    out_campus: number
    on_campus?: number
}

const DEFAULT_ROWS_PER_PAGE = 15
const VALID_STATUSES: StudentStatusFilter[] = ["all", "active", "completed", "dropout"]
const VALID_SORTS: StudentSort[] = ["name", "adm_no", "standard"]

function rememberStudentsReturnPath(path: string) {
    if (typeof window === "undefined") return
    try {
        window.sessionStorage.setItem("admin:students:return-path", path)
    } catch {}
}

function getPositiveNumber(value: string | null, fallback: number) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

type AcademicYear = {
    id: string
    name: string
    is_current?: boolean
}

function getStatusFilter(value: string | null): StudentStatusFilter {
    return VALID_STATUSES.includes(value as StudentStatusFilter) ? (value as StudentStatusFilter) : "active"
}

function getSort(value: string | null): StudentSort {
    return VALID_SORTS.includes(value as StudentSort) ? (value as StudentSort) : "name"
}

function calculateAge(dob: string) {
    if (!dob) return "N/A"
    const birthDate = new Date(dob)
    if (isNaN(birthDate.getTime())) return "N/A"
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const m = today.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
    return age
}

function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return "—"
    try {
        const normalized = String(dateStr).trim()
        const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
        const isoDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
        const d = slashMatch
            ? new Date(Number(slashMatch[3]), Number(slashMatch[2]) - 1, Number(slashMatch[1]))
            : isoDateMatch
                ? new Date(Number(isoDateMatch[1]), Number(isoDateMatch[2]) - 1, Number(isoDateMatch[3]))
                : new Date(normalized)
        if (isNaN(d.getTime())) return "—"
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return "—" }
}

// ─── STUDENT ROW for Table View ──────────────────────────────
function getJoinDate(student: Student) {
    return student.date_of_join || student.admission_date || student.comprehensive_details?.admission?.admission_date
}

function normalizeStudentRow(s: StudentApiRow): Student {
    return {
        ...s,
        adm_no: s.adm_no || "",
        name: s.name || "",
        batch_year: s.batch_year || "",
        standard: s.standard || "",
        photo_url: s.photo_url ?? null,
        dob: s.dob || s.date_of_birth || "",
        gender: s.gender || s.comprehensive_details?.basic?.gender,
        date_of_join: s.date_of_join || s.admission_date || s.comprehensive_details?.admission?.admission_date,
        progress: s.progress || 0,
    }
}

function StudentTableRow({ student, returnPath, selectedYearId }: { student: Student; returnPath: string; selectedYearId: string }) {
    const router = useRouter()
    const href = `/admin/students/${student.adm_no}?returnTo=${encodeURIComponent(returnPath)}${selectedYearId ? `&academic_year_id=${selectedYearId}` : ''}`
    const statusColor = {
        active: "bg-emerald-50 text-emerald-700 border-emerald-200",
        completed: "bg-blue-50 text-blue-700 border-blue-200",
        dropout: "bg-red-50 text-red-700 border-red-200",
    }[student.status || 'active'] || "bg-slate-50 text-slate-700 border-slate-200"

    return (
        <TableRow
            className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors group"
            onMouseEnter={() => router.prefetch(href)}
            onFocus={() => router.prefetch(href)}
            onClick={() => {
                rememberStudentsReturnPath(returnPath)
                router.push(href)
            }}
        >
            <TableCell className="font-mono text-xs text-blue-600 font-semibold">
                {student.adm_no}
            </TableCell>
            <TableCell>
                <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                        {student.photo_url ? (
                            <img
                                src={student.photo_url}
                                alt={student.name}
                                className="h-9 w-9 rounded-full object-cover ring-2 ring-white dark:ring-slate-800 shadow-sm"
                            />
                        ) : (
                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-100 to-blue-50 dark:from-indigo-900 dark:to-blue-950 flex items-center justify-center text-sm font-bold text-indigo-600 dark:text-indigo-300 ring-2 ring-white dark:ring-slate-800 shadow-sm">
                                {student.name.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
                            {student.name}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                            {student.father_name || student.parent_name ? `S/O ${student.father_name || student.parent_name}` : ""}
                        </p>
                    </div>
                </div>
            </TableCell>
            <TableCell className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {student.standard || "—"}
            </TableCell>
            <TableCell className="text-sm text-slate-500">
                {student.gender || (student.comprehensive_details?.basic?.gender) || "—"}
            </TableCell>
            <TableCell>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusColor}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                    {(student.status || 'active').charAt(0).toUpperCase() + (student.status || 'active').slice(1)}
                </span>
            </TableCell>
            <TableCell className="text-sm text-slate-500">{formatDate(getJoinDate(student))}</TableCell>
            <TableCell className="text-sm text-slate-500">{formatDate(student.dob)}</TableCell>
            <TableCell>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950 font-medium gap-1.5 text-xs"
                    onClick={(e) => {
                        e.stopPropagation()
                        rememberStudentsReturnPath(returnPath)
                        router.push(href)
                    }}
                >
                    <Eye className="h-3.5 w-3.5" />
                    View Details
                </Button>
            </TableCell>
        </TableRow>
    )
}

// ─── STUDENT CARD for Grid View ──────────────────────────────
function StudentGridCard({ student, returnPath, selectedYearId }: { student: Student; returnPath: string; selectedYearId: string }) {
    const router = useRouter()
    const href = `/admin/students/${student.adm_no}?returnTo=${encodeURIComponent(returnPath)}${selectedYearId ? `&academic_year_id=${selectedYearId}` : ''}`
    
    // Exact PreSkool colors
    const primaryBlue = "#3d5ee1"
    
    const statusStyle = {
        active: "bg-[#e6f7ec] text-[#26af48]",
        completed: "bg-[#e8ebfd] text-[#3d5ee1]",
        dropout: "bg-[#ffe2e6] text-[#f8285a]",
    }[student.status || 'active'] || "bg-slate-100 text-slate-600"

    return (
        <div
            className="bg-white dark:bg-[#1e2538] rounded-md border border-[#f1f1f1] dark:border-[#2a3348] hover:shadow-md transition-all duration-300 cursor-pointer group overflow-hidden"
            onMouseEnter={() => router.prefetch(href)}
            onFocus={() => router.prefetch(href)}
            onClick={() => {
                rememberStudentsReturnPath(returnPath)
                router.push(href)
            }}
        >
            {/* Top Bar: Adm No + Status */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <span className="text-[13px] font-medium" style={{ color: primaryBlue }}>{student.adm_no}</span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-semibold ${statusStyle}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                    {(student.status || 'active').charAt(0).toUpperCase() + (student.status || 'active').slice(1)}
                </span>
            </div>

            {/* Avatar + Name */}
            <div className="flex items-center gap-3 px-4 py-3">
                {student.photo_url ? (
                    <img
                        src={student.photo_url}
                        alt={student.name}
                        className="h-10 w-10 rounded-full object-cover shadow-sm bg-slate-50"
                    />
                ) : (
                    <div className="h-10 w-10 rounded-full flex items-center justify-center text-lg font-bold shadow-sm" style={{ backgroundColor: '#e8ebfd', color: primaryBlue }}>
                        {student.name.charAt(0)}
                    </div>
                )}
                <div className="min-w-0">
                    <h3 className="font-semibold text-[15px] text-slate-800 dark:text-white truncate transition-colors">
                        {student.name}
                    </h3>
                    <p className="text-[13px] text-slate-500">
                        {student.standard || "N/A"} Std{student.batch_year ? `, ${student.batch_year}` : ""}
                    </p>
                </div>
            </div>

            {/* Info Row (PreSkool style) */}
            <div className="grid grid-cols-3 gap-2 px-4 py-4 pt-2">
                <div>
                    <p className="text-[13px] text-slate-500 mb-0.5">Gender</p>
                    <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">
                        {student.gender || student.comprehensive_details?.basic?.gender || "—"}
                    </p>
                </div>
                <div>
                    <p className="text-[13px] text-slate-500 mb-0.5">Age</p>
                    <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">
                        {calculateAge(student.dob)}
                    </p>
                </div>
                <div>
                    <p className="text-[13px] text-slate-500 mb-0.5">Joined On</p>
                    <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">
                        {formatDate(getJoinDate(student))}
                    </p>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#f1f1f1] dark:border-slate-800 bg-white dark:bg-slate-900/30">
                <span className="text-[12px] font-medium text-slate-500">
                    {student.progress ? `${student.progress} Juz` : "0 Juz"} Completed
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="font-medium gap-1 text-[13px] h-8 px-3 rounded"
                    style={{ backgroundColor: '#e8ebfd', color: primaryBlue }}
                    onClick={(e) => {
                        e.stopPropagation()
                        rememberStudentsReturnPath(returnPath)
                        router.push(href)
                    }}
                >
                    <Eye className="h-3.5 w-3.5" />
                    View
                </Button>
            </div>
        </div>
    )
}

// ─── MAIN STUDENTS PAGE ──────────────────────────────────────
function StudentsPageContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const filterFromUrl = searchParams.get('status') || searchParams.get('filter')
    const [students, setStudents] = useState<Student[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [search, setSearch] = useState(() => searchParams.get('q') || searchParams.get('search') || "")
    const [debouncedSearch, setDebouncedSearch] = useState(search)
    const [statusFilter, setStatusFilter] = useState<StudentStatusFilter>(() => getStatusFilter(filterFromUrl))
    const [viewMode, setViewMode] = useState<"list" | "grid">("list")
    const [sortBy, setSortBy] = useState<StudentSort>(() => getSort(searchParams.get('sort')))
    const [rowsPerPage, setRowsPerPage] = useState(() => getPositiveNumber(searchParams.get('limit'), DEFAULT_ROWS_PER_PAGE))
    const [currentPage, setCurrentPage] = useState(() => getPositiveNumber(searchParams.get('page'), 1))
    const [totalRows, setTotalRows] = useState(0)
    const [refreshKey, setRefreshKey] = useState(0)
    const [exportLoading, setExportLoading] = useState(false)
    const [userRole, setUserRole] = useState("")
    const [progressMap, setProgressMap] = useState<Record<string, number>>({})
    const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
    const [selectedYearId, setSelectedYearId] = useState<string>("")
    const lastDebouncedSearch = useRef(search.trim())
    const knownStatusTotalRef = useRef(0)
    const [studentCounts, setStudentCounts] = useState<StudentCounts>({
        total: 0,
        active: 0,
        completed: 0,
        dropout: 0,
        out_campus: 0,
    })

    useEffect(() => {
        cachedGet('/auth/me', undefined, 30_000)
            .then((res) => setUserRole(res.data?.user?.role || ""))
            .catch(() => {})
        setStatusFilter(getStatusFilter(filterFromUrl))
    }, [filterFromUrl])

    // ── Load Academic Years ───────────────────────────────────
    useEffect(() => {
        let cancelled = false
        cachedGet('/classes/academic-years', undefined, 5 * 60_000)
            .then(res => {
                if (cancelled) return
                const rows = res.data?.data || []
                setAcademicYears(rows)
                if (rows.length > 0 && !selectedYearId) {
                    const current = rows.find((y: AcademicYear) => y.is_current)
                    setSelectedYearId(current ? current.id : rows[0].id)
                }
            })
            .catch(console.error)
        return () => { cancelled = true }
    }, [selectedYearId])

    const isPrincipalPortal = userRole === "principal" || userRole === "vice_principal"
    const effectiveStatusFilter = isPrincipalPortal ? "active" : statusFilter

    const getTotalForStatus = useCallback((counts: StudentCounts, filter: StudentStatusFilter) => {
        if (filter === "active") return counts.active
        if (filter === "completed") return counts.completed
        if (filter === "dropout") return counts.dropout
        return counts.total
    }, [])

    const knownStatusTotal = useMemo(
        () => getTotalForStatus(studentCounts, effectiveStatusFilter),
        [effectiveStatusFilter, getTotalForStatus, studentCounts]
    )

    useEffect(() => {
        if (isPrincipalPortal && statusFilter !== "active") setStatusFilter("active")
    }, [isPrincipalPortal, statusFilter])

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            const trimmed = search.trim()
            if (lastDebouncedSearch.current !== trimmed) {
                lastDebouncedSearch.current = trimmed
                setCurrentPage(1)
                setDebouncedSearch(trimmed)
            }
        }, 250)
        return () => window.clearTimeout(timeout)
    }, [search])

    useEffect(() => {
        knownStatusTotalRef.current = knownStatusTotal
        if (!debouncedSearch && knownStatusTotal > 0) setTotalRows(knownStatusTotal)
    }, [debouncedSearch, knownStatusTotal])

    // ── Export to Excel ───────────────────────────────────────
    async function handleExportExcel() {
        setExportLoading(true)
        try {
            const res = await api.get('/students/download-excel', { responseType: 'blob' })
            const url = window.URL.createObjectURL(new Blob([res.data]))
            const link = document.createElement('a')
            link.href = url
            link.setAttribute('download', 'students.xlsx')
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
        } catch (err) {
            console.error('Export failed:', err)
        } finally {
            setExportLoading(false)
        }
    }

    // ── Load Students ─────────────────────────────────────────
    useEffect(() => {
        let cancelled = false
        async function loadPage() {
            setLoading(true)
            setLoadError(null)
            try {
                const needsExactCount = Boolean(debouncedSearch)
                const res = await cachedGet<StudentsPageResponse>('/students', {
                    light: 'true',
                    limit: rowsPerPage,
                    offset: (currentPage - 1) * rowsPerPage,
                    search: debouncedSearch || undefined,
                    status: effectiveStatusFilter,
                    sort: sortBy,
                    count: needsExactCount ? undefined : 'false',
                    academic_year_id: selectedYearId || undefined
                }, needsExactCount ? 30_000 : 60_000)
                if (!res.data.success) throw new Error(res.data.error || 'Failed to load')
                const merged = (res.data.students || []).map(normalizeStudentRow)
                if (cancelled) return
                setStudents(merged)
                setTotalRows(res.data.pagination?.total ?? (knownStatusTotalRef.current || merged.length))
            } catch (error: unknown) {
                if (cancelled) return
                console.error('Error loading students:', error instanceof Error ? error.message : error)
                setLoadError('Could not connect to the server. Please ensure the backend is running.')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        loadPage()
        return () => { cancelled = true }
    }, [currentPage, debouncedSearch, effectiveStatusFilter, refreshKey, rowsPerPage, sortBy, selectedYearId])

    // ── Auto-poll every 3 min ───────────────────────────────────
    // Was 30s, which constantly re-pulled the full /students list (heavy
    // query) plus /leaves/outside-students every 30 seconds while the page
    // was just sitting idle. Student list rarely changes; 3 min is plenty.
    useEffect(() => {
        const interval = window.setInterval(() => setRefreshKey(k => k + 1), 300_000)
        return () => window.clearInterval(interval)
    }, [])

    // ── Filter + Sort ─────────────────────────────────────────
    useEffect(() => {
        if (viewMode !== 'grid') return

        let cancelled = false
        const timeout = window.setTimeout(() => {
            cachedGet('/hifz/progress-summary', undefined, 5 * 60_000)
                .then(progRes => {
                    if (cancelled || !progRes.data.success || !progRes.data.progressMap) return
                    setProgressMap(progRes.data.progressMap)
                })
                .catch(() => { /* hifz progress is optional */ })
        }, 300)

        return () => {
            cancelled = true
            window.clearTimeout(timeout)
        }
    }, [viewMode])

    useEffect(() => {
        let cancelled = false
        cachedGet<{ success: boolean; counts?: StudentCounts }>('/students/counts', undefined, 5 * 60_000)
            .then(res => {
                if (!cancelled && res.data.success && res.data.counts) setStudentCounts(res.data.counts)
            })
            .catch(() => {})
        return () => { cancelled = true }
    }, [refreshKey])

    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage))

    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages)
    }, [currentPage, totalPages])

    const listReturnPath = useMemo(() => {
        const params = new URLSearchParams()
        if (debouncedSearch) params.set('q', debouncedSearch)
        if (statusFilter !== 'active') params.set('status', statusFilter)
        if (currentPage !== 1) params.set('page', String(currentPage))
        if (rowsPerPage !== DEFAULT_ROWS_PER_PAGE) params.set('limit', String(rowsPerPage))
        if (sortBy !== 'name') params.set('sort', sortBy)
        const query = params.toString()
        return `/admin/students${query ? `?${query}` : ''}`
    }, [currentPage, debouncedSearch, rowsPerPage, sortBy, statusFilter])

    useEffect(() => {
        if (typeof window === "undefined") return
        const current = `${window.location.pathname}${window.location.search}`
        if (current !== listReturnPath) router.replace(listReturnPath, { scroll: false })
    }, [listReturnPath, router])

    const statusCounts = useMemo(() => ({
        all: studentCounts.total,
        active: studentCounts.active,
        on_campus: studentCounts.on_campus ?? Math.max(0, studentCounts.active - studentCounts.out_campus),
        out_campus: studentCounts.out_campus,
    }), [studentCounts])

    const studentsWithProgress = useMemo(() => {
        if (viewMode !== 'grid') return students
        return students.map(student => ({
            ...student,
            progress: progressMap[student.adm_no] || student.progress || 0,
        }))
    }, [progressMap, students, viewMode])

    useEffect(() => {
        if (loading || currentPage >= totalPages) return

        const timeout = window.setTimeout(() => {
            const needsExactCount = Boolean(debouncedSearch)
            void cachedGet<StudentsPageResponse>('/students', {
                light: 'true',
                limit: rowsPerPage,
                offset: currentPage * rowsPerPage,
                search: debouncedSearch || undefined,
                status: effectiveStatusFilter,
                sort: sortBy,
                count: needsExactCount ? undefined : 'false',
            }, needsExactCount ? 30_000 : 60_000).catch(() => null)
        }, 250)
return () => window.clearTimeout(timeout)
    }, [currentPage, debouncedSearch, effectiveStatusFilter, loading, rowsPerPage, sortBy, totalPages])

    return (
        <div className="space-y-6">
            {/* ── Page Header ──────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Students</h1>
                        {academicYears.length > 0 && (
                            <Select value={selectedYearId} onValueChange={setSelectedYearId}>
                                <SelectTrigger className="w-[180px] h-9 bg-white dark:bg-[#1e2538] border-slate-200 dark:border-slate-800 focus:ring-indigo-500 rounded-md">
                                    <SelectValue placeholder="Academic Year" />
                                </SelectTrigger>
                                <SelectContent>
                                    {academicYears.map(year => (
                                        <SelectItem key={year.id} value={year.id}>
                                            {year.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        Dashboard / Peoples / Students Grid
                    </p>
                </div>
                {!isPrincipalPortal && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportExcel}
                            disabled={exportLoading}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors shadow-sm"
                        >
                            <Download className="h-4 w-4" />
                            {exportLoading ? 'Exporting...' : 'Export Students'}
                        </button>
                        <Link href="/admin/students/create">
                            <Button className="bg-[#3d5ee1] hover:bg-[#3d5ee1]/90 shadow-sm font-semibold gap-2">
                                <Plus className="h-4 w-4" /> Add Student
                            </Button>
                        </Link>
                    </div>
                )}
            </div>

            {/* ── Backend Error Banner ─────────────────────────── */}
            {loadError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
                    <span className="font-medium">Error:</span> {loadError}
                </div>
            )}

            {/* ── Stat Summary Cards ───────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Active */}
                <div
                    className={`flex items-center gap-3 bg-white dark:bg-[#1e2538] rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer ${statusFilter === 'active' ? 'border-emerald-300 shadow-sm ring-1 ring-emerald-100' : 'border-[#e8ede9] dark:border-[#2a3348]'}`}
                    onClick={() => {
                        setStatusFilter('active')
                        setCurrentPage(1)
                    }}
                >
                    <div className="h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                        <UserCheck className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active</p>
                        <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{loading ? '—' : statusCounts.active}</p>
                    </div>
                </div>

                {/* On Campus */}
                <div className="flex items-center gap-3 bg-white dark:bg-[#1e2538] rounded-xl border border-[#e8ede9] dark:border-[#2a3348] p-4 hover:shadow-md transition-all">
                    <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
                        <GraduationCap className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">On Campus</p>
                        <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{loading ? '—' : statusCounts.on_campus}</p>
                    </div>
                </div>

                {/* Out Campus */}
                <div className="flex items-center gap-3 bg-white dark:bg-[#1e2538] rounded-xl border border-[#e8ede9] dark:border-[#2a3348] p-4 hover:shadow-md transition-all">
                    <div className="h-10 w-10 rounded-full bg-orange-50 dark:bg-orange-950 flex items-center justify-center shrink-0">
                        <Users className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Out Campus</p>
                        <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{loading ? '—' : statusCounts.out_campus}</p>
                    </div>
                </div>

                {/* Total */}
                <div
                    className={`flex items-center gap-3 bg-white dark:bg-[#1e2538] rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer ${statusFilter === 'all' ? 'border-indigo-300 shadow-sm ring-1 ring-indigo-100' : 'border-[#e8ede9] dark:border-[#2a3348]'}`}
                    onClick={() => {
                        if (isPrincipalPortal) return
                        setStatusFilter('all')
                        setCurrentPage(1)
                    }}
                >
                    <div className="h-10 w-10 rounded-full bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center shrink-0">
                        <LayoutGrid className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</p>
                        <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{loading ? '—' : statusCounts.all}</p>
                    </div>
                </div>
            </div>

            {/* ── Students List Card ───────────────────────────── */}
            <div className="bg-white dark:bg-[#1e2538] rounded-xl border border-slate-200 dark:border-[#2a3348] shadow-sm overflow-hidden">

                {/* Card Header — Title + Toolbar */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white">Students List</h2>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* View Toggle */}
                        <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <button
                                className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-[#3d5ee1] text-white' : 'bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-700'}`}
                                onClick={() => setViewMode('list')}
                                title="List View"
                            >
                                <List className="h-4 w-4" />
                            </button>
                            <button
                                className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-[#3d5ee1] text-white' : 'bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-700'}`}
                                onClick={() => setViewMode('grid')}
                                title="Grid View"
                            >
                                <LayoutGrid className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Filter */}
                        {!isPrincipalPortal && (
                            <Select value={statusFilter} onValueChange={(v) => {
                                setStatusFilter(v as "all" | "active" | "completed" | "dropout")
                                setCurrentPage(1)
                            }}>
                                <SelectTrigger className="w-[130px] h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                                    <Filter className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                                    <SelectValue placeholder="Filter" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Students</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="dropout">Dropout</SelectItem>
                                </SelectContent>
                            </Select>
                        )}

                        {/* Sort */}
                        <Select value={sortBy} onValueChange={(v) => {
                            setSortBy(v as "name" | "adm_no" | "standard")
                            setCurrentPage(1)
                        }}>
                            <SelectTrigger className="w-[140px] h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                                <SelectValue placeholder="Sort By" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="name">Sort by A-Z</SelectItem>
                                <SelectItem value="adm_no">Sort by Adm No</SelectItem>
                                <SelectItem value="standard">Sort by Standard</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Sub Header: Rows Per Page + Search */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>Row Per Page</span>
                        <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1) }}>
                            <SelectTrigger className="h-7 w-16 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="15">15</SelectItem>
                                <SelectItem value="25">25</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                            </SelectContent>
                        </Select>
                        <span>Entries</span>
                        <span className="ml-2 text-slate-400">•</span>
                        <span className="ml-2">Showing {students.length} of {totalRows}</span>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                            placeholder="Search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8 h-8 w-48 text-xs bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                        />
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="py-20">
                        <ThreeBallLoader label="Loading students..." />
                    </div>
                ) : students.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Users className="h-10 w-10 text-slate-300 mb-3" />
                        <p className="font-medium text-slate-500">No students found</p>
                        <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filter</p>
                    </div>
                ) : viewMode === 'list' ? (
                    /* ── TABLE VIEW ─────────────────────────────── */
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/80 dark:bg-slate-900/50 hover:bg-slate-50/80">
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[120px]">Admission No</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider">Name</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[100px]">Class</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[80px]">Gender</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[100px]">Status</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[120px]">Date of Join</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[120px]">DOB</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[120px]">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {students.map((student) => (
                                    <StudentTableRow key={student.adm_no} student={student} returnPath={listReturnPath} selectedYearId={selectedYearId} />
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    /* ── GRID VIEW ─────────────────────────────── */
                    <div className="p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {studentsWithProgress.map((student) => (
                                <StudentGridCard key={student.adm_no} student={student} returnPath={listReturnPath} selectedYearId={selectedYearId} />
                            ))}
                        </div>
                    </div>
                )}

                {!loading && students.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
                        <p className="text-xs text-slate-500">
                            Page {currentPage} of {totalPages}
                        </p>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            >
                                Previous
                            </Button>
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum: number
                                if (totalPages <= 5) {
                                    pageNum = i + 1
                                } else if (currentPage <= 3) {
                                    pageNum = i + 1
                                } else if (currentPage >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i
                                } else {
                                    pageNum = currentPage - 2 + i
                                }
                                return (
                                    <Button
                                        key={pageNum}
                                        variant={currentPage === pageNum ? "default" : "outline"}
                                        size="sm"
                                        className={`h-7 w-7 text-xs p-0 ${currentPage === pageNum ? 'bg-indigo-600' : ''}`}
                                        onClick={() => setCurrentPage(pageNum)}
                                    >
                                        {pageNum}
                                    </Button>
                                )
                            })}
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default function StudentsPage() {
    return (
        <Suspense fallback={
            <div className="h-full flex items-center justify-center">
                <ThreeBallLoader label="Loading page..." />
            </div>
        }>
            <StudentsPageContent />
        </Suspense>
    )
}
