"use client"

import { useState, useEffect } from "react"
import { 
    BadgeCheck, 
    ThumbsDown, 
    Landmark, 
    Ban, 
    Search,
    Printer,
    FileDown,
    UserPlus,
    FileSearch,
    AlertCircle,
    FileCheck,
    Upload,
    Users
} from "lucide-react"
import api from "@/lib/api"
import { resolveBackendUrl } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

export default function AlumniPage() {
    const [alumni, setAlumni] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [statusFilter, setStatusFilter] = useState("all")
    const { toast } = useToast()

    const [tcModalOpen, setTcModalOpen] = useState(false)
    const [tcTargetStudent, setTcTargetStudent] = useState<any>(null)
    const [tcFiles, setTcFiles] = useState<File[]>([])
    const [uploadingTC, setUploadingTC] = useState(false)

    useEffect(() => {
        fetchAlumni()
    }, [])

    const fetchAlumni = async () => {
        try {
            setLoading(true)
            const res = await api.get('/students?status=alumni')
            if (res.data.success) {
                setAlumni(res.data.students || [])
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Error", description: "Failed to fetch alumni", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const handleRejoin = async (studentId: string) => {
        if (!confirm("Are you sure you want to mark this student as active? They will reappear in the main Students list.")) return;
        
        try {
            const res = await api.put(`/students/${studentId}`, { status: 'active' })
            if (res.data.success) {
                toast({ title: "Success", description: "Student has been reactivated successfully." })
                fetchAlumni() // Refresh list
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
        if (e.target.files) {
            const files = Array.from(e.target.files).slice(0, 2) // Max 2 files
            setTcFiles(files)
        }
    }

    const handleIssueTC = async () => {
        if (!tcTargetStudent) return
        setUploadingTC(true)

        try {
            const uploadedUrls: string[] = []

            for (const file of tcFiles) {
                const formData = new FormData()
                formData.append('avatar', file) // Reusing avatar upload endpoint as generic image upload
                const res = await api.post('/upload/avatar', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                })
                if (res.data.success) {
                    uploadedUrls.push(res.data.filePath)
                }
            }

            const comprehensive_details = {
                ...(tcTargetStudent.comprehensive_details || {}),
                tc_issued: true,
                tc_photos: uploadedUrls.length > 0 ? uploadedUrls : (tcTargetStudent.comprehensive_details?.tc_photos || [])
            }

            const res = await api.put(`/students/${tcTargetStudent.adm_no}`, { comprehensive_details })
            if (res.data.success) {
                toast({ title: "Success", description: "TC marked as issued successfully." })
                fetchAlumni()
                setTcModalOpen(false)
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to issue TC. Please try again.", variant: "destructive" })
        } finally {
            setUploadingTC(false)
        }
    }

    const filteredAlumni = alumni.filter(student => {
        if (statusFilter !== "all" && student.status !== statusFilter) return false;
        if (searchQuery) {
            const query = searchQuery.toLowerCase()
            return student.name.toLowerCase().includes(query) || 
                   student.adm_no.toLowerCase().includes(query) ||
                   (student.address && student.address.toLowerCase().includes(query))
        }
        return true;
    })

    const stats = {
        completed: alumni.filter(s => s.status === 'completed').length,
        dropout: alumni.filter(s => s.status === 'dropout').length,
        higher_education: alumni.filter(s => s.status === 'higher_education').length,
        total: alumni.filter(s => ['completed', 'dropout', 'higher_education'].includes(s.status)).length,
    }

    return (
        <div className="space-y-6">
            {/* Top Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-[#1e2538] border border-slate-200 dark:border-[#2a3348] rounded-xl p-4 flex items-center gap-4 shadow-sm">
                    <div className="h-12 w-12 rounded-lg bg-[#0066ff] text-white flex items-center justify-center flex-shrink-0">
                        <BadgeCheck className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Completed</div>
                        <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.completed}</div>
                    </div>
                </div>

                <div className="bg-white dark:bg-[#1e2538] border border-slate-200 dark:border-[#2a3348] rounded-xl p-4 flex items-center gap-4 shadow-sm">
                    <div className="h-12 w-12 rounded-lg bg-[#008f6b] text-white flex items-center justify-center flex-shrink-0">
                        <ThumbsDown className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dropout</div>
                        <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.dropout}</div>
                    </div>
                </div>

                <div className="bg-white dark:bg-[#1e2538] border border-slate-200 dark:border-[#2a3348] rounded-xl p-4 flex items-center gap-4 shadow-sm">
                    <div className="h-12 w-12 rounded-lg bg-[#ff9800] text-white flex items-center justify-center flex-shrink-0">
                        <Landmark className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Higher Education</div>
                        <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.higher_education}</div>
                    </div>
                </div>

                <div className="bg-white dark:bg-[#1e2538] border border-slate-200 dark:border-[#2a3348] rounded-xl p-4 flex items-center gap-4 shadow-sm">
                    <div className="h-12 w-12 rounded-lg bg-[#4f46e5] text-white flex items-center justify-center flex-shrink-0">
                        <Users className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Alumni</div>
                        <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.total}</div>
                    </div>
                </div>
            </div>

            {/* Header Controls */}
            <div className="bg-white dark:bg-[#1e2538] border border-slate-200 dark:border-[#2a3348] rounded-xl p-4 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <h1 className="text-xl font-bold text-slate-800 dark:text-white w-full sm:w-auto">Alumni</h1>
                    <div className="flex w-full sm:w-auto bg-slate-50 dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-[#2a3348]">
                        <Button variant="ghost" size="sm" className="h-8 gap-2 flex-1 hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
                            <Printer className="h-4 w-4" /> Print
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 gap-2 flex-1 hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
                            <FileDown className="h-4 w-4" /> Export
                        </Button>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-center justify-end pt-2">
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-full sm:w-[180px] bg-white dark:bg-[#1a1f2e] border-slate-200 dark:border-[#2a3348] text-slate-800 dark:text-slate-200 h-10">
                                <SelectValue placeholder="Select Status" />
                            </SelectTrigger>
                            <SelectContent className="bg-white dark:bg-[#1a1f2e] border-slate-200 dark:border-[#2a3348] text-slate-800 dark:text-slate-200">
                                <SelectItem value="all">Select Status (All)</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="dropout">Dropout</SelectItem>
                                <SelectItem value="higher_education">Higher Education</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input 
                                placeholder="Search alumni" 
                                className="pl-9 h-10 bg-white dark:bg-[#1a1f2e] border-slate-200 dark:border-[#2a3348] text-slate-800 dark:text-slate-200"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white dark:bg-[#1e2538] border border-slate-200 dark:border-[#2a3348] rounded-xl shadow-sm overflow-hidden auto-cols-auto">
                <div className="overflow-x-auto min-w-full">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-[#f8fafc] dark:bg-[#232838] text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-[#2a3348]">
                            <tr>
                                <th className="px-6 py-4">#</th>
                                <th className="px-6 py-4">Name</th>
                                <th className="px-6 py-4">Place</th>
                                <th className="px-6 py-4">Student ID</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Reason</th>
                                <th className="px-6 py-4">Leaving Date</th>
                                <th className="px-6 py-4">TC Status</th>
                                <th className="px-6 py-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#2a3348]">
                            {loading ? (
                                <tr><td colSpan={9} className="px-6 py-10 text-center text-slate-500 dark:text-slate-400 hover:bg-transparent">Loading alumni records...</td></tr>
                            ) : filteredAlumni.length === 0 ? (
                                <tr><td colSpan={9} className="px-6 py-10 text-center text-slate-500 dark:text-slate-400 hover:bg-transparent">No records found.</td></tr>
                            ) : (
                                filteredAlumni.map((student, idx) => (
                                    <tr key={student.adm_no} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 text-slate-500">{idx + 1}</td>
                                        <td className="px-6 py-4 font-semibold text-slate-800 uppercase">{student.name}</td>
                                        <td className="px-6 py-4 text-slate-600 uppercase">
                                            {student.address || student.comprehensive_details?.address?.city || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{student.adm_no}</td>
                                        <td className="px-6 py-4">
                                            <Badge variant="outline" className={`font-normal tracking-wide capitalize ${
                                                student.status === 'completed' ? 'border-[#0066ff] text-[#0066ff]' :
                                                student.status === 'dropout' ? 'border-[#008f6b] text-[#008f6b]' :
                                                student.status === 'stopped' ? 'border-[#e3242b] text-[#e3242b]' :
                                                'border-[#ff9800] text-[#ff9800]'
                                            }`}>
                                                {student.status.replace('_', ' ')}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {student.comprehensive_details?.reason_for_leaving || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {student.comprehensive_details?.leaving_date ? new Date(student.comprehensive_details.leaving_date).toLocaleDateString('en-IN') : '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {student.comprehensive_details?.tc_issued ? (
                                                <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 cursor-pointer" onClick={() => openTcModal(student)}>
                                                    Issued ✓
                                                </Badge>
                                            ) : (
                                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openTcModal(student)}>
                                                    Issue TC
                                                </Button>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-4">
                                                <button 
                                                    title="Rejoin" 
                                                    onClick={() => handleRejoin(student.adm_no)}
                                                    className="text-slate-400 hover:text-[#0066ff] transition-colors"
                                                >
                                                    <UserPlus className="h-5 w-5" />
                                                </button>
                                                <Link 
                                                    href={`/admin/students/${student.adm_no}`}
                                                    title="View Details" 
                                                    className="text-slate-400 hover:text-slate-800 transition-colors"
                                                >
                                                    <FileSearch className="h-5 w-5" />
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* TC Issue Modal */}
            <Dialog open={tcModalOpen} onOpenChange={setTcModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{tcTargetStudent?.comprehensive_details?.tc_issued ? "Update TC Photos" : "Issue Transfer Certificate"}</DialogTitle>
                        <DialogDescription>
                            {tcTargetStudent?.comprehensive_details?.tc_issued 
                                ? "This student's TC has already been issued. You can attach additional photos if needed."
                                : `Confirm TC issuance for ${tcTargetStudent?.name}. You can optionally attach up to 2 photos of the TC.`}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Upload TC Photos (Optional, Max 2)</Label>
                            <Input 
                                type="file" 
                                accept="image/*" 
                                multiple 
                                onChange={handleFileChange} 
                            />
                            {tcFiles.length > 0 && (
                                <p className="text-xs text-slate-500 mt-1">{tcFiles.length} file(s) selected</p>
                            )}
                        </div>

                        {tcTargetStudent?.comprehensive_details?.tc_photos?.length > 0 && (
                            <div className="space-y-2 mt-4">
                                <Label>Previously Uploaded</Label>
                                <div className="flex gap-2">
                                    {tcTargetStudent.comprehensive_details.tc_photos.map((photo: string, i: number) => (
                                        <a key={i} href={photo} target="_blank" rel="noreferrer">
                                            <img src={resolveBackendUrl(photo)} alt="TC" className="h-16 w-16 object-cover rounded-md border" />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTcModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleIssueTC} disabled={uploadingTC} className="bg-[#0066ff] hover:bg-blue-700">
                            {uploadingTC ? "Processing..." : (tcTargetStudent?.comprehensive_details?.tc_issued ? "Update Photos" : "Confirm Issue")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
