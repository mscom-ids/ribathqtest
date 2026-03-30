"use client"

import { useEffect, useState, useMemo, Suspense } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import {
    Plus, Search, Users, Filter, LayoutGrid, List, Eye,
    ChevronDown, ArrowUpDown, GraduationCap, UserCheck
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
import { getActiveStudents } from "../financeActions"

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
    comprehensive_details?: any
    gender?: string
    date_of_join?: string
    admission_date?: string
    father_name?: string
    parent_name?: string
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
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return "—"
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return "—" }
}

// ─── STUDENT ROW for Table View ──────────────────────────────
function StudentTableRow({ student }: { student: Student }) {
    const router = useRouter()
    const statusColor = {
        active: "bg-emerald-50 text-emerald-700 border-emerald-200",
        completed: "bg-blue-50 text-blue-700 border-blue-200",
        dropout: "bg-red-50 text-red-700 border-red-200",
    }[student.status || 'active'] || "bg-slate-50 text-slate-700 border-slate-200"

    return (
        <TableRow
            className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors group"
            onClick={() => router.push(`/admin/students/${student.adm_no}`)}
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
            <TableCell className="text-sm text-slate-500">{formatDate(student.admission_date || student.date_of_join)}</TableCell>
            <TableCell className="text-sm text-slate-500">{formatDate(student.dob)}</TableCell>
            <TableCell>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950 font-medium gap-1.5 text-xs"
                    onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/admin/students/${student.adm_no}`)
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
function StudentGridCard({ student }: { student: Student }) {
    const router = useRouter()
    
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
            onClick={() => router.push(`/admin/students/${student.adm_no}`)}
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
                        {formatDate(student.admission_date || student.date_of_join)}
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
                        router.push(`/admin/students/${student.adm_no}`)
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
    const filterFromUrl = searchParams.get('filter') as "all" | "active" | "completed" | "dropout" | null
    const [students, setStudents] = useState<Student[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed" | "dropout">(filterFromUrl || "active")
    const [viewMode, setViewMode] = useState<"list" | "grid">("list")
    const [sortBy, setSortBy] = useState<"name" | "adm_no" | "standard">("name")
    const [rowsPerPage, setRowsPerPage] = useState(15)
    const [currentPage, setCurrentPage] = useState(1)

    useEffect(() => {
        if (filterFromUrl) setStatusFilter(filterFromUrl)
    }, [filterFromUrl])

    // ── Load Students ─────────────────────────────────────────
    useEffect(() => {
        async function initialLoad() {
            setLoading(true)
            try {
                const res = await getActiveStudents()
                if (!res.success || !res.data) throw new Error(res.error || 'Failed to load')
                const merged = (res.data as any).map((s: any) => ({
                    ...s,
                    dob: s.dob || s.date_of_birth,
                    gender: s.gender || s.comprehensive_details?.basic?.gender,
                    date_of_join: s.date_of_join || s.admission_date || s.comprehensive_details?.admission?.admission_date,
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
                setLoadError('Could not connect to the server. Please ensure the backend is running.')
            } finally {
                setLoading(false)
            }
        }
        initialLoad()
    }, [])

    // ── Auto-poll every 30s ───────────────────────────────────
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await getActiveStudents()
                if (res.success && res.data) {
                    const merged = (res.data as any).map((s: any) => ({
                        ...s,
                        dob: s.dob || s.date_of_birth,
                        gender: s.gender || s.comprehensive_details?.basic?.gender,
                        date_of_join: s.date_of_join || s.admission_date || s.comprehensive_details?.admission?.admission_date,
                        progress: 0
                    }))
                    setStudents(prev => {
                        // Preserve progress
                        merged.forEach((s: any) => {
                            const existing = prev.find(st => st.adm_no === s.adm_no)
                            if (existing) s.progress = existing.progress || 0
                        })
                        return merged
                    })
                }
            } catch (_) {}
        }, 30_000)
        return () => clearInterval(interval)
    }, [])

    // ── Filter + Sort ─────────────────────────────────────────
    const filtered = useMemo(() => {
        let result = students.filter(s => {
            const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
                s.adm_no.toLowerCase().includes(search.toLowerCase())
            const effectiveStatus = s.status || 'active'
            const matchStatus = statusFilter === 'all' || effectiveStatus === statusFilter
            return matchSearch && matchStatus
        })

        result.sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name)
            if (sortBy === 'adm_no') return a.adm_no.localeCompare(b.adm_no, undefined, { numeric: true })
            if (sortBy === 'standard') return (a.standard || '').localeCompare(b.standard || '')
            return 0
        })

        return result
    }, [students, search, statusFilter, sortBy])

    // Reset page when filter changes
    useEffect(() => { setCurrentPage(1) }, [search, statusFilter, sortBy])

    const totalPages = Math.ceil(filtered.length / rowsPerPage)
    const paginatedStudents = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

    const statusCounts = {
        all: students.length,
        active: students.filter(s => (s.status || 'active') === 'active').length,
        completed: students.filter(s => s.status === 'completed').length,
        dropout: students.filter(s => s.status === 'dropout').length,
    }

    return (
        <div className="space-y-6">
            {/* ── Page Header ──────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Students</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        Dashboard / Peoples / Students Grid
                    </p>
                </div>
                <Link href="/admin/students/create">
                    <Button className="bg-[#3d5ee1] hover:bg-[#3d5ee1]/90 shadow-sm font-semibold gap-2">
                        <Plus className="h-4 w-4" /> Add Student
                    </Button>
                </Link>
            </div>

            {/* ── Backend Error Banner ─────────────────────────── */}
            {loadError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
                    <span className="font-medium">Error:</span> {loadError}
                </div>
            )}

            {/* ── Stat Summary Cards ───────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div
                    className={`flex items-center gap-3 bg-white dark:bg-[#1e2538] rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer ${statusFilter === 'active' ? 'border-emerald-300 shadow-sm ring-1 ring-emerald-100' : 'border-[#e8ede9] dark:border-[#2a3348]'}`}
                    onClick={() => setStatusFilter('active')}
                >
                    <div className="h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                        <UserCheck className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active</p>
                        <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{loading ? '—' : statusCounts.active}</p>
                    </div>
                </div>
                <div
                    className={`flex items-center gap-3 bg-white dark:bg-[#1e2538] rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer ${statusFilter === 'completed' ? 'border-blue-300 shadow-sm ring-1 ring-blue-100' : 'border-[#e8ede9] dark:border-[#2a3348]'}`}
                    onClick={() => setStatusFilter('completed')}
                >
                    <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
                        <GraduationCap className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Completed</p>
                        <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{loading ? '—' : statusCounts.completed}</p>
                    </div>
                </div>
                <div
                    className={`flex items-center gap-3 bg-white dark:bg-[#1e2538] rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer ${statusFilter === 'dropout' ? 'border-red-300 shadow-sm ring-1 ring-red-100' : 'border-[#e8ede9] dark:border-[#2a3348]'}`}
                    onClick={() => setStatusFilter('dropout')}
                >
                    <div className="h-10 w-10 rounded-full bg-red-50 dark:bg-red-950 flex items-center justify-center shrink-0">
                        <Users className="h-5 w-5 text-red-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dropout</p>
                        <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{loading ? '—' : statusCounts.dropout}</p>
                    </div>
                </div>
                <div
                    className={`flex items-center gap-3 bg-white dark:bg-[#1e2538] rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer ${statusFilter === 'all' ? 'border-indigo-300 shadow-sm ring-1 ring-indigo-100' : 'border-[#e8ede9] dark:border-[#2a3348]'}`}
                    onClick={() => setStatusFilter('all')}
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
                        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
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

                        {/* Sort */}
                        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
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
                        <span className="ml-2">Showing {paginatedStudents.length} of {filtered.length}</span>
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
                    <div className="flex flex-col items-center justify-center py-20 space-y-3">
                        <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                        <p className="text-sm text-slate-500">Loading students...</p>
                    </div>
                ) : filtered.length === 0 ? (
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
                                {paginatedStudents.map((student) => (
                                    <StudentTableRow key={student.adm_no} student={student} />
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    /* ── GRID VIEW ─────────────────────────────── */
                    <div className="p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {paginatedStudents.map((student) => (
                                <StudentGridCard key={student.adm_no} student={student} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
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
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
        }>
            <StudentsPageContent />
        </Suspense>
    )
}
