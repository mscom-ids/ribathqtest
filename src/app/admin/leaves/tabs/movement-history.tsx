"use client"

import { useState, useEffect, useMemo } from "react"
import { Search, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react"
import { format } from "date-fns"

import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import api from "@/lib/api"

export function MovementHistoryTab() {
    const [leaves, setLeaves] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    useEffect(() => {
        const fetchLeaves = async () => {
            setLoading(true)
            try {
                const res = await api.get('/leaves')
                if (res.data.success) {
                    setLeaves(res.data.leaves || [])
                }
            } catch (error) {
                console.error(error)
            } finally {
                setLoading(false)
            }
        }
        fetchLeaves()
    }, [])

    const filtered = useMemo(() => {
        return leaves.filter(l => 
            l.student_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
            l.student_adm_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.school_standard?.toLowerCase().includes(searchQuery.toLowerCase())
        )
    }, [leaves, searchQuery])

    // Pagination logic
    const totalItems = filtered.length
    const totalPages = Math.ceil(totalItems / pageSize) || 1
    
    // Ensure we don't sit on an empty outer page if filters reduce data
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(1);
        }
    }, [totalPages, currentPage]);

    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * pageSize
        return filtered.slice(start, start + pageSize)
    }, [filtered, currentPage, pageSize])

    const formatDateTime = (dateStr: string | null) => {
        if (!dateStr) return "—"
        try {
            return format(new Date(dateStr), "dd-MM-yyyy - hh:mm a")
        } catch {
            return "—"
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative w-full sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                        placeholder="Search student, ID, or batch..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                    />
                </div>
            </div>

            <Card className="border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                            <TableRow>
                                <TableHead className="w-[50px]">#</TableHead>
                                <TableHead>Exit At</TableHead>
                                <TableHead>Student Name</TableHead>
                                <TableHead>Batch</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead>Due Back</TableHead>
                                <TableHead>Returned At</TableHead>
                                <TableHead>Leave Type</TableHead>
                                <TableHead className="text-right">Return Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={9} className="text-center h-32 text-slate-500">Loading...</TableCell></TableRow>
                            ) : paginatedData.length === 0 ? (
                                <TableRow><TableCell colSpan={9} className="text-center h-48 text-slate-500">
                                    <div className="flex flex-col items-center justify-center">
                                        <AlertCircle className="h-8 w-8 mb-2 opacity-20" />
                                        <p>No movement history found</p>
                                    </div>
                                </TableCell></TableRow>
                            ) : paginatedData.map((leave, index) => (
                                <TableRow key={leave.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <TableCell className="text-slate-500">
                                        {(currentPage - 1) * pageSize + index + 1}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs whitespace-nowrap">
                                        {formatDateTime(leave.actual_exit_datetime || leave.start_datetime)}
                                    </TableCell>
                                    <TableCell>
                                        <p className="font-medium text-slate-900 dark:text-slate-100">{leave.student_name}</p>
                                        <p className="text-[10px] text-slate-500">{leave.student_adm_no}</p>
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-600 dark:text-slate-400 capitalize">
                                        {leave.school_standard || "—"}
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-600 dark:text-slate-400 max-w-[150px] truncate">
                                        {leave.reason_category || "—"}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs whitespace-nowrap text-slate-500">
                                        {formatDateTime(leave.end_datetime)}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">
                                        {formatDateTime(leave.actual_return_datetime)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={`capitalize whitespace-nowrap ${
                                            leave.leave_type === 'institutional' ? 'text-purple-600 bg-purple-50 border-purple-200' :
                                            leave.leave_type === 'out-campus' || leave.leave_type === 'personal' ? 'text-orange-600 bg-orange-50 border-orange-200' :
                                            'text-blue-600 bg-blue-50 border-blue-200'
                                        }`}>
                                            {leave.leave_type.replace('-', ' ')}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {leave.status === 'returned' && leave.return_status === 'late' && (
                                            <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-300">LATE</Badge>
                                        )}
                                        {leave.status === 'returned' && leave.return_status === 'normal' && (
                                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-300">NORMAL</Badge>
                                        )}
                                        {leave.status === 'outside' && <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">Ongoing</span>}
                                        {leave.status === 'pending' && <span className="text-xs text-slate-400">—</span>}
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
                            {/* Page Size Selector */}
                            <div className="flex items-center gap-2">
                                <Select 
                                    value={pageSize.toString()} 
                                    onValueChange={(val) => {
                                        setPageSize(Number(val));
                                        setCurrentPage(1);
                                    }}
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

                            {/* Page Navigation */}
                            <div className="flex items-center gap-1">
                                <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-8 w-8 rounded-full border-slate-300 dark:border-slate-700" 
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                
                                <div className="flex items-center gap-1 px-2">
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        // Simple window showing current page and neighbors
                                        let pageNum = currentPage;
                                        if (totalPages <= 5) pageNum = i + 1;
                                        else if (currentPage <= 3) pageNum = i + 1;
                                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                        else pageNum = currentPage - 2 + i;

                                        return (
                                            <Button
                                                key={pageNum}
                                                variant={currentPage === pageNum ? "default" : "ghost"}
                                                size="sm"
                                                className={`h-8 w-8 p-0 rounded-full ${currentPage === pageNum ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-slate-600 dark:text-slate-400'}`}
                                                onClick={() => setCurrentPage(pageNum)}
                                            >
                                                {pageNum}
                                            </Button>
                                        )
                                    })}
                                    {totalPages > 5 && currentPage < totalPages - 2 && (
                                        <span className="text-slate-400 px-1">...</span>
                                    )}
                                </div>

                                <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-8 w-8 rounded-full border-slate-300 dark:border-slate-700"
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
        </div>
    )
}
