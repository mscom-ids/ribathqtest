"use client"

import { useState, useEffect, useCallback } from "react"
import api from "@/lib/api"
import { format, isPast } from "date-fns"
import {
    UserCheck, RefreshCw, Loader2, Search, Filter,
    Clock, ArrowLeftRight, Building2, MapPin, AlertTriangle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select"

interface OutsideStudent {
    leave_id: string
    student_id: string
    student_name: string
    adm_no: string
    standard: string
    photo_url: string | null
    batch_year: string | null
    leave_type: string
    reason_category: string | null
    remarks: string | null
    start_datetime: string
    end_datetime: string
    institutional_leave_name: string | null
    group_type: string | null
    group_value: string | null
    hifz_mentor_name: string | null
    school_mentor_name: string | null
    madrasa_mentor_name: string | null
    exited_recorded_by_name: string | null
    actual_exit_datetime: string | null
}

interface ReturnModalState {
    open: boolean
    leaveId: string
    studentName: string
    leaveType: string
}

function leaveTypeBadge(type: string, institutionalName?: string | null) {
    switch (type) {
        case 'institutional':
            return (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 border border-purple-200 dark:border-purple-700">
                    <Building2 className="h-2.5 w-2.5" />
                    {institutionalName ? institutionalName.slice(0, 18) : 'Institutional'}
                </span>
            )
        case 'out-campus':
        case 'personal':
            return (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 border border-orange-200 dark:border-orange-700">
                    <MapPin className="h-2.5 w-2.5" />
                    Out-Campus
                </span>
            )
        case 'on-campus':
        case 'internal':
            return (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border border-blue-200 dark:border-blue-700">
                    <ArrowLeftRight className="h-2.5 w-2.5" />
                    On-Campus
                </span>
            )
        default:
            return <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{type}</span>
    }
}

function StudentCard({ student, onRecordReturn }: { student: OutsideStudent, onRecordReturn: (s: OutsideStudent) => void }) {
    const isOverdue = student.end_datetime && isPast(new Date(student.end_datetime))
    const mentors = [
        student.hifz_mentor_name && `Hifz: ${student.hifz_mentor_name}`,
        student.school_mentor_name && `School: ${student.school_mentor_name}`,
        student.madrasa_mentor_name && `Madrasa: ${student.madrasa_mentor_name}`,
    ].filter(Boolean).join(' · ')

    const initials = student.student_name.substring(0, 2).toUpperCase()

    return (
        <div className={`relative rounded-xl border p-4 flex flex-col gap-3 transition-all hover:shadow-md ${
            isOverdue
                ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}>
            {/* Overdue warning */}
            {isOverdue && (
                <div className="absolute top-2 right-2">
                    <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-3 w-3" /> OVERDUE
                    </span>
                </div>
            )}

            {/* Student header */}
            <div className="flex items-center gap-3">
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0 ${
                    student.leave_type === 'institutional'
                        ? 'bg-gradient-to-br from-purple-500 to-indigo-600'
                        : student.leave_type === 'out-campus' || student.leave_type === 'personal'
                        ? 'bg-gradient-to-br from-orange-400 to-amber-500'
                        : 'bg-gradient-to-br from-blue-400 to-cyan-500'
                }`}>
                    {initials}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{student.student_name}</p>
                    <p className="text-[11px] text-slate-500">
                        {student.adm_no}
                        {student.standard && <> · <span className="text-blue-500 font-medium">{student.standard}</span></>}
                        {student.batch_year && <> · {student.batch_year}</>}
                    </p>
                </div>
            </div>

            {/* Leave type + reason */}
            <div className="flex flex-wrap gap-1.5 items-center">
                {leaveTypeBadge(student.leave_type, student.institutional_leave_name)}
                {student.group_type && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium capitalize">
                        {student.group_type}: {student.group_value}
                    </span>
                )}
                {(student.reason_category) && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-medium">
                        {student.reason_category}
                    </span>
                )}
            </div>

            {/* Remarks */}
            {student.remarks && (
                <p className="text-[11px] text-slate-500 italic bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-1.5 border border-slate-100 dark:border-slate-700">
                    &ldquo;{student.remarks}&rdquo;
                </p>
            )}

            {/* Time info */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
                    <p className="text-slate-400 mb-0.5">Exited</p>
                    <p className="font-medium text-slate-700 dark:text-slate-300">
                        {student.actual_exit_datetime
                            ? format(new Date(student.actual_exit_datetime), 'dd MMM, h:mm a')
                            : format(new Date(student.start_datetime), 'dd MMM, h:mm a')}
                    </p>
                    {student.exited_recorded_by_name && (
                        <p className="text-slate-400 text-[10px]">by {student.exited_recorded_by_name}</p>
                    )}
                </div>
                <div className={`rounded-lg p-2 ${isOverdue ? 'bg-red-100 dark:bg-red-900/30' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                    <p className="text-slate-400 mb-0.5">Expected Return</p>
                    <p className={`font-medium ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                        {format(new Date(student.end_datetime), 'dd MMM, h:mm a')}
                    </p>
                </div>
            </div>

            {/* Mentors */}
            {mentors && (
                <p className="text-[10px] text-slate-400 truncate">{mentors}</p>
            )}

            {/* Record Return Button */}
            <Button
                size="sm"
                onClick={() => onRecordReturn(student)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 rounded-lg"
            >
                <UserCheck className="h-4 w-4" />
                Record Return
            </Button>
        </div>
    )
}

function RecordReturnDialog({
    state,
    onClose,
    onSuccess,
}: {
    state: ReturnModalState
    onClose: () => void
    onSuccess: () => void
}) {
    const [returnDatetime, setReturnDatetime] = useState(() => {
        const now = new Date()
        now.setSeconds(0, 0)
        return now.toISOString().slice(0, 16)
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async () => {
        setLoading(true)
        setError('')
        try {
            const res = await api.post('/leaves/record-return', {
                leave_id: state.leaveId,
                return_datetime: new Date(returnDatetime).toISOString()
            })
            if (res.data.success) {
                onSuccess()
                onClose()
            } else {
                setError(res.data.error || 'Failed to record return')
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to record return')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={state.open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserCheck className="h-5 w-5 text-emerald-500" />
                        Record Return
                    </DialogTitle>
                    <DialogDescription>
                        Log <strong>{state.studentName}</strong> returning from {state.leaveType === 'institutional' ? 'institutional' : 'outside campus'} leave.
                        <br />
                        <span className="text-[11px] text-amber-600 mt-1 block">
                            ⚠ Time outside expected bounds will be flagged as LATE.
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                            Return Date &amp; Time
                        </label>
                        <input
                            type="datetime-local"
                            value={returnDatetime}
                            onChange={e => setReturnDatetime(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>
                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
                            {error}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                        Record Inbound Move
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function OutsideStudentsPanel() {
    const [students, setStudents] = useState<OutsideStudent[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [filterType, setFilterType] = useState<string>('all')
    const [returnModal, setReturnModal] = useState<ReturnModalState>({
        open: false, leaveId: '', studentName: '', leaveType: ''
    })

    const fetchOutside = useCallback(async () => {
        setLoading(true)
        try {
            const res = await api.get('/leaves/outside-students')
            if (res.data.success) {
                setStudents(res.data.students)
            }
        } catch (err) {
            console.error('Failed to fetch outside students:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchOutside() }, [fetchOutside])

    const filtered = students.filter(s => {
        const matchesSearch =
            s.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.adm_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (s.standard || '').toLowerCase().includes(searchQuery.toLowerCase())
        const matchesType =
            filterType === 'all' ||
            (filterType === 'institutional' && s.leave_type === 'institutional') ||
            (filterType === 'out-campus' && (s.leave_type === 'out-campus' || s.leave_type === 'personal')) ||
            (filterType === 'on-campus' && (s.leave_type === 'on-campus' || s.leave_type === 'internal'))
        return matchesSearch && matchesType
    })

    const counts = {
        institutional: students.filter(s => s.leave_type === 'institutional').length,
        outCampus: students.filter(s => s.leave_type === 'out-campus' || s.leave_type === 'personal').length,
        onCampus: students.filter(s => s.leave_type === 'on-campus' || s.leave_type === 'internal').length,
        overdue: students.filter(s => s.end_datetime && isPast(new Date(s.end_datetime))).length,
    }

    return (
        <div className="space-y-5">
            {/* Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900 dark:bg-slate-800 rounded-xl p-3 text-white text-center">
                    <div className="text-2xl font-bold">{students.length}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Total Outside</div>
                </div>
                <div className="bg-purple-600 rounded-xl p-3 text-white text-center">
                    <div className="text-2xl font-bold">{counts.institutional}</div>
                    <div className="text-[11px] text-purple-200 mt-0.5">Institutional</div>
                </div>
                <div className="bg-orange-500 rounded-xl p-3 text-white text-center">
                    <div className="text-2xl font-bold">{counts.outCampus}</div>
                    <div className="text-[11px] text-orange-100 mt-0.5">Out-Campus</div>
                </div>
                {counts.overdue > 0 ? (
                    <div className="bg-red-600 rounded-xl p-3 text-white text-center animate-pulse">
                        <div className="text-2xl font-bold">{counts.overdue}</div>
                        <div className="text-[11px] text-red-100 mt-0.5">⚠ Overdue</div>
                    </div>
                ) : (
                    <div className="bg-emerald-600 rounded-xl p-3 text-white text-center">
                        <div className="text-2xl font-bold">{counts.onCampus}</div>
                        <div className="text-[11px] text-emerald-100 mt-0.5">On-Campus Leave</div>
                    </div>
                )}
            </div>

            {/* Filters row */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search student name, ID, or class..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                    />
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-full sm:w-44 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                        <Filter className="h-4 w-4 mr-2 text-slate-400" />
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="institutional">Institutional</SelectItem>
                        <SelectItem value="out-campus">Out-Campus</SelectItem>
                        <SelectItem value="on-campus">On-Campus</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={fetchOutside} className="shrink-0 gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                </Button>
            </div>

            {/* Cards grid */}
            {loading ? (
                <div className="flex items-center justify-center min-h-[300px]">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[300px] text-slate-400">
                    <UserCheck className="h-12 w-12 mb-3 opacity-30 text-emerald-500" />
                    <p className="text-base font-semibold text-slate-600 dark:text-slate-300">
                        {students.length === 0 ? 'All students are on campus!' : 'No results match your filter'}
                    </p>
                    <p className="text-sm mt-1">
                        {students.length === 0
                            ? 'No one is currently recorded as outside.'
                            : 'Try clearing the search or changing the filter.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filtered.map(student => (
                        <StudentCard
                            key={student.leave_id}
                            student={student}
                            onRecordReturn={s => setReturnModal({
                                open: true,
                                leaveId: s.leave_id,
                                studentName: s.student_name,
                                leaveType: s.leave_type,
                            })}
                        />
                    ))}
                </div>
            )}

            {/* Return modal */}
            {returnModal.open && (
                <RecordReturnDialog
                    state={returnModal}
                    onClose={() => setReturnModal(p => ({ ...p, open: false }))}
                    onSuccess={fetchOutside}
                />
            )}
        </div>
    )
}
