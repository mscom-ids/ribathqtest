"use client"

import { useState, useEffect, useMemo } from "react"
import { Search, Plus, MapPin, CalendarClock, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import api from "@/lib/api"
import { PersonalLeaveModal } from "../personal-modal"
import { RecordReturnModal } from "../record-return-modal"

export function OnCampusLeavesTab() {
    const [leaves, setLeaves] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [activeTab, setActiveTab] = useState("ongoing")
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [leaveForRecord, setLeaveForRecord] = useState<{ id: string, type: 'personal' } | null>(null)

    const fetchLeaves = async () => {
        setLoading(true)
        try {
            const res = await api.get('/leaves/personal?type=on-campus')
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
        return leaves.filter(l => {
            // First apply search
            const matchesSearch = 
                l.student?.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                l.student?.adm_no.toLowerCase().includes(searchQuery.toLowerCase())
            
            if (!matchesSearch) return false;

            // Then apply tab filter
            if (activeTab === "ongoing") {
                return l.status === "outside" || l.status === "pending"
            } else {
                return l.status === "returned" || l.status === "completed" || l.status === "cancelled"
            }
        })
    }, [leaves, searchQuery, activeTab])

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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setCurrentPage(1) }} className="w-full sm:w-auto">
                    <TabsList className="bg-transparent border-b-2 border-slate-200 rounded-none h-12 w-full justify-start space-x-4">
                        <TabsTrigger 
                            value="ongoing" 
                            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent px-2"
                        >
                            Ongoing
                        </TabsTrigger>
                        <TabsTrigger 
                            value="ended" 
                            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent px-2"
                        >
                            Ended Leaves
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                
                <Button onClick={() => setIsModalOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto shrink-0">
                    <Plus className="mr-2 h-4 w-4" />
                    New Request
                </Button>
            </div>

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
            </div>

            <Card className="border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                            <TableRow>
                                <TableHead className="w-[50px]">#</TableHead>
                                <TableHead>Student</TableHead>
                                <TableHead>Batch</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead>From</TableHead>
                                <TableHead>To</TableHead>
                                {activeTab === "ended" && <TableHead>Ended By</TableHead>}
                                <TableHead className="text-center">Status</TableHead>
                                {activeTab === "ongoing" && <TableHead className="text-right">Action</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={activeTab === "ended" ? 8 : 7} className="text-center h-32">Loading...</TableCell></TableRow>
                            ) : paginatedData.length === 0 ? (
                                <TableRow><TableCell colSpan={activeTab === "ended" ? 8 : 7} className="text-center h-48 text-slate-500">
                                    <div className="flex flex-col items-center justify-center">
                                        <AlertCircle className="h-8 w-8 mb-2 opacity-20" />
                                        <p>No {activeTab} leaves found</p>
                                    </div>
                                </TableCell></TableRow>
                            ) : paginatedData.map((leave, index) => (
                                <TableRow key={leave.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <TableCell className="text-slate-500">
                                        {(currentPage - 1) * pageSize + index + 1}
                                    </TableCell>
                                    <TableCell>
                                        <p className="font-medium text-slate-900 dark:text-slate-100">{leave.student?.name}</p>
                                        <p className="text-xs text-slate-500">{leave.student?.adm_no}</p>
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-600">
                                        {leave.student?.standard || "—"}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1 text-sm text-slate-600">
                                            <MapPin className="h-3 w-3 text-slate-400" />
                                            {leave.reason_category || leave.reason || "Internal"}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono whitespace-nowrap">
                                            {format(new Date(leave.start_datetime), "dd MMM, h:mm a")}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono whitespace-nowrap">
                                            {leave.actual_return_datetime 
                                                ? format(new Date(leave.actual_return_datetime), "dd MMM, h:mm a")
                                                : format(new Date(leave.end_datetime), "dd MMM, h:mm a")
                                            }
                                        </div>
                                    </TableCell>
                                    {activeTab === "ended" && (
                                        <TableCell className="text-sm text-slate-600 uppercase">
                                            {/* Note: In a real app we might fetch the specific staff name who matched this movement update */}
                                            SYSTEM
                                        </TableCell>
                                    )}
                                    <TableCell className="text-center">
                                        {activeTab === "ongoing" ? (
                                            <Badge className="bg-purple-100 text-purple-700 border-purple-300">INSIDE CAMPUS (LEAVE)</Badge>
                                        ) : (
                                            <Badge className="bg-slate-100 text-slate-700 border-slate-300">COMPLETED</Badge>
                                        )}
                                    </TableCell>
                                    {activeTab === "ongoing" && (
                                        <TableCell className="text-right">
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={() => setLeaveForRecord({ id: leave.id, type: 'personal' })}
                                                className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                            >
                                                Mark Returned
                                            </Button>
                                        </TableCell>
                                    )}
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

            <PersonalLeaveModal type="on-campus" open={isModalOpen} onOpenChange={setIsModalOpen} onSuccess={fetchLeaves} />

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
