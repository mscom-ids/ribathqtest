"use client"

import { useState, useEffect, useMemo } from "react"
import { Search, Plus, MapPin, CalendarClock, Activity, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import api from "@/lib/api"
import { OutCampusModal } from "../out-campus-modal"
import { RecordReturnModal } from "../record-return-modal"

export function OutCampusLeavesTab() {
    const [leaves, setLeaves] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [leaveForRecord, setLeaveForRecord] = useState<{ id: string, type: 'personal' | 'group' } | null>(null)

    const fetchLeaves = async () => {
        setLoading(true)
        try {
            const res = await api.get('/leaves/personal?type=out-campus')
            if (res.data.success) {
                setLeaves(res.data.leaves)
            }
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchLeaves() }, [])

    const filtered = useMemo(() => {
        return leaves.filter(l => 
            l.student?.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            l.student?.adm_no.toLowerCase().includes(searchQuery.toLowerCase())
        )
    }, [leaves, searchQuery])

    // Pagination logic
    const totalItems = filtered.length
    const totalPages = Math.ceil(totalItems / pageSize) || 1
    
    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(1);
    }, [totalPages, currentPage]);

    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * pageSize
        return filtered.slice(start, start + pageSize)
    }, [filtered, currentPage, pageSize])

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                        placeholder="Search student name or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                    />
                </div>
                <Button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto shrink-0">
                    <Plus className="mr-2 h-4 w-4" />
                    New Request
                </Button>
            </div>

            <Card className="border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                            <TableRow>
                                <TableHead className="w-[50px]">#</TableHead>
                                <TableHead>Student</TableHead>
                                <TableHead>Reason & Remarks</TableHead>
                                <TableHead>Going With</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={7} className="text-center h-32">Loading...</TableCell></TableRow>
                            ) : paginatedData.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="text-center h-48 text-slate-500">
                                    <div className="flex flex-col items-center justify-center">
                                        <AlertCircle className="h-8 w-8 mb-2 opacity-20" />
                                        <p>No out-campus leaves found</p>
                                    </div>
                                </TableCell></TableRow>
                            ) : paginatedData.map((leave, index) => (
                                <TableRow key={leave.id || leave.group_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <TableCell className="text-slate-500">
                                        {(currentPage - 1) * pageSize + index + 1}
                                    </TableCell>
                                    <TableCell>
                                        <p className="font-medium text-slate-900 dark:text-slate-100">{leave.student?.name}</p>
                                        <p className="text-xs text-slate-500">
                                            {leave.is_group ? `${leave.count} Students Released` : `${leave.student?.adm_no} • ${leave.student?.standard}`}
                                        </p>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                <Activity className="h-3 w-3 text-indigo-500" />
                                                {leave.reason_category || "Personal"}
                                            </div>
                                            {leave.remarks && (
                                                <div className="text-[11px] text-slate-500 italic bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded border border-slate-100 dark:border-slate-800">
                                                    "{leave.remarks}"
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5 text-sm">
                                            <span className="font-medium text-slate-800 dark:text-slate-200">{leave.companion_name || "-"}</span>
                                            <span className="text-xs text-slate-500">{leave.companion_relationship || "-"}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono whitespace-nowrap">
                                            <CalendarClock className="h-3 w-3" />
                                            {format(new Date(leave.start_datetime), "MMM d, h:mm a")} - {format(new Date(leave.end_datetime), "MMM d, h:mm a")}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {leave.status === 'outside' && <Badge className="bg-blue-100 text-blue-700 border-blue-300">OUTSIDE</Badge>}
                                        {leave.status === 'returned' && <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">RETURNED</Badge>}
                                        {leave.status === 'pending' && <Badge variant="outline" className="text-amber-600 border-amber-300">PENDING</Badge>}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {leave.status === 'outside' && (
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={() => setLeaveForRecord({ id: leave.is_group ? leave.group_id : leave.id, type: leave.is_group ? 'group' : 'personal' })}
                                                className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                            >
                                                <Activity className="h-4 w-4 mr-1.5" />
                                                {leave.is_group ? "Manage Returns" : "Record Return"}
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination Controls */}
                {!loading && filtered.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-slate-500 dark:text-slate-400">
                                {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalItems)} of {totalItems} items
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <Select 
                                    value={pageSize.toString()} 
                                    onValueChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}
                                >
                                    <SelectTrigger className="h-8 w-[100px] bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="10">10 / page</SelectItem>
                                        <SelectItem value="25">25 / page</SelectItem>
                                        <SelectItem value="50">50 / page</SelectItem>
                                        <SelectItem value="100">100 / page</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center gap-1">
                                <Button 
                                    variant="outline" size="icon" className="h-8 w-8 rounded-full" 
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="flex items-center gap-1 px-2">
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum = currentPage;
                                        if (totalPages <= 5) pageNum = i + 1;
                                        else if (currentPage <= 3) pageNum = i + 1;
                                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                        else pageNum = currentPage - 2 + i;
                                        return (
                                            <Button
                                                key={pageNum} variant={currentPage === pageNum ? "default" : "ghost"} size="sm"
                                                className={`h-8 w-8 p-0 rounded-full ${currentPage === pageNum ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
                                                onClick={() => setCurrentPage(pageNum)}
                                            >
                                                {pageNum}
                                            </Button>
                                        )
                                    })}
                                    {totalPages > 5 && currentPage < totalPages - 2 && <span className="text-slate-400 px-1">...</span>}
                                </div>
                                <Button 
                                    variant="outline" size="icon" className="h-8 w-8 rounded-full"
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </Card>

            <OutCampusModal open={isModalOpen} onOpenChange={setIsModalOpen} onSuccess={fetchLeaves} />

            {leaveForRecord && (
                <RecordReturnModal
                    leaveId={leaveForRecord.id} type={leaveForRecord.type}
                    open={!!leaveForRecord} onOpenChange={(op: boolean) => !op && setLeaveForRecord(null)}
                    onSuccess={fetchLeaves}
                />
            )}
        </div>
    )
}
