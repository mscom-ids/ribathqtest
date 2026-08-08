"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import {
    BadgeCheck,
    ThumbsDown,
    Landmark,
    Search,
    Printer,
    FileDown,
    UserPlus,
    FileSearch,
    Users,
    Filter,
    ArrowUpDown,
    GraduationCap,
    FileCheck,
} from "lucide-react"
import api from "@/lib/api"
import { cachedGet, invalidateCache } from "@/lib/api-cache"
import { resolveBackendUrl } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { ThreeBallLoader } from "@/components/ui/three-ball-loader"

type AlumniStatus = "all" | "completed" | "dropout" | "higher_education"
type AlumniSort = "name" | "adm_no" | "recent"

const DEFAULT_ROWS_PER_PAGE = 15

export default function AlumniPage() {
    const [alumni, setAlumni] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [statusFilter, setStatusFilter] = useState<AlumniStatus>("all")
    const [sortBy, setSortBy] = useState<AlumniSort>("name")
    const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE)
    const [currentPage, setCurrentPage] = useState(1)
    const { toast } = useToast()

    const [tcModalOpen, setTcModalOpen] = useState(false)
    const [tcTargetStudent, setTcTargetStudent] = useState<any>(null)
    const [tcFiles, setTcFiles] = useState<File[]>([])
    const [uploadingTC, setUploadingTC] = useState(false)

    useEffect(() => { fetchAlumni() }, [])

    const fetchAlumni = async () => {
        try {
            setLoading(true)
            const res = await cachedGet('/students', {
                status: 'alumni',
                light: 'true',
                limit: 500,
                count: 'false',
                sort: 'name',
            }, 60_000)
            if (res.data.success) setAlumni(res.data.students || [])
        } catch (error) {
            console.error(error)
            toast({ title: "Error", description: "Failed to fetch alumni", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const handleRejoin = async (studentId: string) => {
        if (!confirm("Reactivate this student? They will reappear in the main Students list.")) return
        try {
            const res = await api.put(`/students/${studentId}`, { status: 'active' })
            if (res.data.success) {
                toast({ title: "Reactivated", description: "Student is now active." })
                invalidateCache('/students')
                fetchAlumni()
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to reactivate student.", variant: "destructive" })
        }
    }

    const openTcModal = (student: any) => {
        setTcTargetStudent(student)
        setTcFiles([])
        setTcModalOpen(true)
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setTcFiles(Array.from(e.target.files).slice(0, 2))
    }

    const handleIssueTC = async () => {
        if (!tcTargetStudent) return
        setUploadingTC(true)
        try {
            const uploadedUrls: string[] = []
            for (const file of tcFiles) {
                const formData = new FormData()
                formData.append('avatar', file)
                const res = await api.post('/upload/avatar', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                })
                if (res.data.success) uploadedUrls.push(res.data.filePath)
            }
            const comprehensive_details = {
                ...(tcTargetStudent.comprehensive_details || {}),
                tc_issued: true,
                tc_photos: uploadedUrls.length > 0
                    ? uploadedUrls
                    : (tcTargetStudent.comprehensive_details?.tc_photos || [])
            }
            const res = await api.put(`/students/${tcTargetStudent.adm_no}`, { comprehensive_details })
            if (res.data.success) {
                toast({ title: "Success", description: "TC marked as issued successfully." })
                fetchAlumni()
                setTcModalOpen(false)
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to issue TC.", variant: "destructive" })
        } finally {
            setUploadingTC(false)
        }
    }

    // ─── Filter + Sort ──────────────────────────────────
    const filteredAlumni = useMemo(() => {
        let list = alumni.filter(s => ['completed', 'dropout', 'higher_education'].includes(s.status))
        if (statusFilter !== 'all') list = list.filter(s => s.status === statusFilter)
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            list = list.filter(s =>
                s.name?.toLowerCase().includes(q) ||
                s.adm_no?.toLowerCase().includes(q) ||
                (s.address && s.address.toLowerCase().includes(q))
            )
        }
        list = [...list].sort((a, b) => {
            if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '')
            if (sortBy === 'adm_no') return (a.adm_no || '').localeCompare(b.adm_no || '')
            if (sortBy === 'recent') {
                const aDate = a.exit_date || a.comprehensive_details?.leaving_date || ''
                const bDate = b.exit_date || b.comprehensive_details?.leaving_date || ''
                return bDate.localeCompare(aDate)
            }
            return 0
        })
        return list
    }, [alumni, statusFilter, searchQuery, sortBy])

    // ─── Pagination ─────────────────────────────────────
    const totalRows = filteredAlumni.length
    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage))
    useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages) }, [currentPage, totalPages])
    useEffect(() => { setCurrentPage(1) }, [searchQuery, statusFilter, sortBy, rowsPerPage])

    const pageStart = (currentPage - 1) * rowsPerPage
    const pagedAlumni = filteredAlumni.slice(pageStart, pageStart + rowsPerPage)

    // ─── Stats ──────────────────────────────────────────
    const stats = useMemo(() => ({
        completed: alumni.filter(s => s.status === 'completed').length,
        dropout: alumni.filter(s => s.status === 'dropout').length,
        higher_education: alumni.filter(s => s.status === 'higher_education').length,
        total: alumni.filter(s => ['completed', 'dropout', 'higher_education'].includes(s.status)).length,
    }), [alumni])

    // ─── Export CSV (client-side) ───────────────────────
    const exportCsv = () => {
        const rows = [
            ['#', 'Name', 'Place', 'Student ID', 'Status', 'Reason', 'Leaving Date', 'TC Status'],
            ...filteredAlumni.map((s, i) => [
                i + 1,
                s.name || '',
                s.address || s.comprehensive_details?.address?.city || '',
                s.adm_no,
                (s.status || '').replace('_', ' '),
                s.comprehensive_details?.reason_for_leaving || '',
                (s.exit_date || s.comprehensive_details?.leaving_date) || '',
                s.comprehensive_details?.tc_issued ? 'Issued' : 'Pending',
            ]),
        ]
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'alumni.csv'
        a.click()
        URL.revokeObjectURL(url)
    }

    const statusBadge = (status: string) => {
        const s = (status || '').toLowerCase()
        if (s === 'completed') return 'border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:bg-blue-950'
        if (s === 'higher_education') return 'border-orange-200 text-orange-700 bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:bg-orange-950'
        if (s === 'dropout') return 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950'
        return 'border-slate-200 text-slate-600 bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:bg-slate-800'
    }

    return (
        <div className="space-y-6">
            {/* ── Page Header ─────────────────────────── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Alumni</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        Dashboard / Peoples / Alumni Records
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-semibold transition-colors shadow-sm"
                    >
                        <Printer className="h-4 w-4" /> Print
                    </button>
                    <button
                        onClick={exportCsv}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
                    >
                        <FileDown className="h-4 w-4" /> Export
                    </button>
                </div>
            </div>

            {/* ── Stat Cards (clickable filters) ────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Completed */}
                <button
                    onClick={() => setStatusFilter('completed')}
                    className={`flex items-center gap-3 bg-white dark:bg-[#1e2538] rounded-xl border p-4 hover:shadow-md transition-all text-left ${statusFilter === 'completed' ? 'border-blue-300 shadow-sm ring-1 ring-blue-100 dark:ring-blue-900' : 'border-[#e8ede9] dark:border-[#2a3348]'}`}
                >
                    <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
                        <BadgeCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Completed</p>
                        <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{loading ? '—' : stats.completed}</p>
                    </div>
                </button>

                {/* Dropout */}
                <button
                    onClick={() => setStatusFilter('dropout')}
                    className={`flex items-center gap-3 bg-white dark:bg-[#1e2538] rounded-xl border p-4 hover:shadow-md transition-all text-left ${statusFilter === 'dropout' ? 'border-emerald-300 shadow-sm ring-1 ring-emerald-100 dark:ring-emerald-900' : 'border-[#e8ede9] dark:border-[#2a3348]'}`}
                >
                    <div className="h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                        <ThumbsDown className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dropout</p>
                        <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{loading ? '—' : stats.dropout}</p>
                    </div>
                </button>

                {/* Higher Education */}
                <button
                    onClick={() => setStatusFilter('higher_education')}
                    className={`flex items-center gap-3 bg-white dark:bg-[#1e2538] rounded-xl border p-4 hover:shadow-md transition-all text-left ${statusFilter === 'higher_education' ? 'border-orange-300 shadow-sm ring-1 ring-orange-100 dark:ring-orange-900' : 'border-[#e8ede9] dark:border-[#2a3348]'}`}
                >
                    <div className="h-10 w-10 rounded-full bg-orange-50 dark:bg-orange-950 flex items-center justify-center shrink-0">
                        <Landmark className="h-5 w-5 text-orange-500 dark:text-orange-400" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Higher Ed</p>
                        <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{loading ? '—' : stats.higher_education}</p>
                    </div>
                </button>

                {/* Total */}
                <button
                    onClick={() => setStatusFilter('all')}
                    className={`flex items-center gap-3 bg-white dark:bg-[#1e2538] rounded-xl border p-4 hover:shadow-md transition-all text-left ${statusFilter === 'all' ? 'border-indigo-300 shadow-sm ring-1 ring-indigo-100 dark:ring-indigo-900' : 'border-[#e8ede9] dark:border-[#2a3348]'}`}
                >
                    <div className="h-10 w-10 rounded-full bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center shrink-0">
                        <GraduationCap className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</p>
                        <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{loading ? '—' : stats.total}</p>
                    </div>
                </button>
            </div>

            {/* ── Alumni List Card ─────────────────────── */}
            <div className="bg-white dark:bg-[#1e2538] rounded-xl border border-slate-200 dark:border-[#2a3348] shadow-sm overflow-hidden">
                {/* Toolbar */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white">Alumni List</h2>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AlumniStatus)}>
                            <SelectTrigger className="w-[150px] h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                                <Filter className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                                <SelectValue placeholder="Filter" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Alumni</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="dropout">Dropout</SelectItem>
                                <SelectItem value="higher_education">Higher Education</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={sortBy} onValueChange={(v) => setSortBy(v as AlumniSort)}>
                            <SelectTrigger className="w-[150px] h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="name">Sort by A-Z</SelectItem>
                                <SelectItem value="adm_no">Sort by Adm No</SelectItem>
                                <SelectItem value="recent">Most Recent</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Row Per Page + Search */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>Row Per Page</span>
                        <Select value={String(rowsPerPage)} onValueChange={(v) => setRowsPerPage(Number(v))}>
                            <SelectTrigger className="h-7 w-16 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="15">15</SelectItem>
                                <SelectItem value="25">25</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                            </SelectContent>
                        </Select>
                        <span>Entries</span>
                        <span className="ml-2 text-slate-400">•</span>
                        <span className="ml-2">Showing {pagedAlumni.length} of {totalRows}</span>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                            placeholder="Search alumni"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-8 w-52 text-xs bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                        />
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="py-20"><ThreeBallLoader label="Loading alumni..." /></div>
                ) : pagedAlumni.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Users className="h-10 w-10 text-slate-300 mb-3" />
                        <p className="font-medium text-slate-500">No alumni found</p>
                        <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filter</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/80 dark:bg-slate-900/50 hover:bg-slate-50/80">
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[60px]">#</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider">Name</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[120px]">Adm No</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[140px]">Place</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[130px]">Status</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reason</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[120px]">Leaving Date</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[110px]">TC Status</TableHead>
                                    <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[110px] text-center">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pagedAlumni.map((student, idx) => {
                                    const leavingDate = student.exit_date || student.comprehensive_details?.leaving_date
                                    const tcIssued = student.comprehensive_details?.tc_issued
                                    return (
                                        <TableRow key={student.adm_no} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                            <TableCell className="text-slate-400 text-xs font-medium">{pageStart + idx + 1}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center text-xs font-bold uppercase shrink-0">
                                                        {(student.name || '?').charAt(0)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 uppercase truncate">{student.name}</p>
                                                        {student.father_name && (
                                                            <p className="text-[11px] text-slate-500 truncate">S/O {student.father_name}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Link
                                                    href={`/admin/students/${student.adm_no}`}
                                                    className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                                                >
                                                    {student.adm_no}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-600 dark:text-slate-300 uppercase">
                                                {student.address || student.comprehensive_details?.address?.city || '—'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={`font-medium capitalize text-xs ${statusBadge(student.status)}`}>
                                                    {(student.status || '').replace('_', ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-600 dark:text-slate-300 max-w-[240px] truncate" title={student.comprehensive_details?.reason_for_leaving || ''}>
                                                {student.comprehensive_details?.reason_for_leaving || '—'}
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-600 dark:text-slate-300">
                                                {leavingDate ? new Date(leavingDate).toLocaleDateString('en-IN') : '—'}
                                            </TableCell>
                                            <TableCell>
                                                {tcIssued ? (
                                                    <button
                                                        onClick={() => openTcModal(student)}
                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
                                                    >
                                                        <FileCheck className="h-3 w-3" /> Issued
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => openTcModal(student)}
                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                                    >
                                                        Issue TC
                                                    </button>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center justify-center gap-3">
                                                    <button
                                                        title="Rejoin as active student"
                                                        onClick={() => handleRejoin(student.adm_no)}
                                                        className="p-1.5 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition-colors"
                                                    >
                                                        <UserPlus className="h-4 w-4" />
                                                    </button>
                                                    <Link
                                                        href={`/admin/students/${student.adm_no}`}
                                                        title="View details"
                                                        className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                                                    >
                                                        <FileSearch className="h-4 w-4" />
                                                    </Link>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {/* Pagination */}
                {!loading && totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                        <span>Page {currentPage} of {totalPages}</span>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── TC Issue Modal ─────────────────────── */}
            <Dialog open={tcModalOpen} onOpenChange={setTcModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {tcTargetStudent?.comprehensive_details?.tc_issued ? "Update TC Photos" : "Issue Transfer Certificate"}
                        </DialogTitle>
                        <DialogDescription>
                            {tcTargetStudent?.comprehensive_details?.tc_issued
                                ? "This student's TC has already been issued. You can attach additional photos if needed."
                                : `Confirm TC issuance for ${tcTargetStudent?.name}. You can optionally attach up to 2 photos of the TC.`}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Upload TC Photos (Optional, max 2)</Label>
                            <Input type="file" accept="image/*" multiple onChange={handleFileChange} />
                            {tcFiles.length > 0 && (
                                <p className="text-xs text-slate-500 mt-1">{tcFiles.length} file(s) selected</p>
                            )}
                        </div>

                        {tcTargetStudent?.comprehensive_details?.tc_photos?.length > 0 && (
                            <div className="space-y-2 mt-4">
                                <Label>Previously uploaded</Label>
                                <div className="flex gap-2 flex-wrap">
                                    {tcTargetStudent.comprehensive_details.tc_photos.map((photo: string, i: number) => (
                                        <a key={i} href={resolveBackendUrl(photo)} target="_blank" rel="noreferrer">
                                            <img src={resolveBackendUrl(photo)} alt="TC" className="h-16 w-16 object-cover rounded-md border border-slate-200 dark:border-slate-700" />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTcModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleIssueTC} disabled={uploadingTC} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {uploadingTC ? "Processing…" : (tcTargetStudent?.comprehensive_details?.tc_issued ? "Update Photos" : "Confirm Issue")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
