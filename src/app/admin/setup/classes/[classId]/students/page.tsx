"use client"

import { useState, useEffect, use } from "react"
import { usePathname } from "next/navigation"
import { Plus, Trash2, ArrowLeft, Loader2, UserMinus, CheckCircle2, BadgeAlert, Users, Search } from "lucide-react"
import api from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export default function ClassEnrollmentsPage({ params }: { params: Promise<{ classId: string }> }) {
    const { classId } = use(params)
    const [enrollments, setEnrollments] = useState<any[]>([])
    const [classData, setClassData] = useState<any>(null)
    const [students, setStudents] = useState<any[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [loading, setLoading] = useState(true)
    const { toast } = useToast()

    const [open, setOpen] = useState(false)

    useEffect(() => {
        fetchData()
    }, [classId])

    const fetchData = async () => {
        try {
            setLoading(true)
            // Need class details (for academic_year_id), enrollments, and all students
            const [enrollRes, classRes, studentRes] = await Promise.all([
                api.get(`/classes/enrollments?class_id=${classId}`),
                api.get(`/classes`),
                api.get('/students')
            ])
            
            if (enrollRes.data.success) {
                setEnrollments(enrollRes.data.data)
            }
            if (classRes.data.success) {
                const currentClass = classRes.data.data.find((c: any) => c.id === classId)
                setClassData(currentClass)
            }
            if (studentRes.data.success) {
                setStudents(studentRes.data.students || [])
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Error", description: "Failed to fetch data", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const handleEnroll = async (student_id: string) => {
        if (!classData?.academic_year_id) return
        
        try {
            const payload = { 
                class_id: classId,
                student_id: student_id,
                academic_year_id: classData.academic_year_id
            }
            const res = await api.post('/classes/enrollments', payload)
            if (res.data.success) {
                toast({ title: "Success", description: "Student enrolled successfully" })
                fetchData()
                setOpen(false)
            }
        } catch (error: any) {
            toast({ 
                title: "Error", 
                description: error.response?.data?.error || "Failed to enroll student", 
                variant: "destructive" 
            })
        }
    }

    const handleRemove = async (id: string) => {
        if (!confirm("Are you sure you want to remove this student from the class?")) return
        try {
            const res = await api.delete(`/classes/enrollments/${id}`)
            if (res.data.success) {
                toast({ title: "Removed", description: "Student removed successfully" })
                fetchData()
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to remove student", variant: "destructive" })
        }
    }

    const enrolledStudentIds = enrollments.map(e => e.student_id)
    const availableStudents = students.filter(s => {
        if (enrolledStudentIds.includes(s.adm_no)) return false;
        
        if (classData?.standard && classData.standard !== 'Hifz Only' && classData.standard !== 'Other') {
            const validStandards = classData.standard.split(',').map((s: string) => s.trim());
            if (!validStandards.includes(s.standard)) return false;
        }

        const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              s.adm_no.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesSearch;
    })

    const handleEnrollAll = async () => {
        if (!classData?.academic_year_id || availableStudents.length === 0) return;
        if (!confirm(`Are you sure you want to enroll all ${availableStudents.length} students?`)) return;
        
        try {
            const promises = availableStudents.map(student => 
                api.post('/classes/enrollments', { 
                    class_id: classId,
                    student_id: student.adm_no,
                    academic_year_id: classData.academic_year_id
                })
            );
            await Promise.all(promises);
            toast({ title: "Success", description: `Enrolled ${availableStudents.length} students` });
            fetchData();
            setOpen(false);
        } catch (error: any) {
            toast({ title: "Error", description: "Failed to enroll some students", variant: "destructive" });
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild className="rounded-full">
                    <Link href="/admin/setup/classes">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Class Enrolled Students</h1>
                    <p className="text-sm text-slate-500">
                        {classData ? `${classData.type} - Std ${classData.standard} ${classData.name}` : "Loading..."}
                    </p>
                </div>
            </div>

            <div className="flex justify-between items-center bg-white p-4 border rounded-xl shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Users className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-slate-500">Total Enrolled</div>
                        <div className="text-2xl font-bold text-slate-800">{enrollments.length}</div>
                    </div>
                </div>

                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#4f46e5] hover:bg-[#4338ca]">
                            <Plus className="h-4 w-4 mr-2" /> Add Student
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-xl">
                        <DialogHeader>
                            <DialogTitle>Enroll New Student</DialogTitle>
                        </DialogHeader>
                        
                        <div className="relative my-4">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input 
                                placeholder="Search by name or admission number..." 
                                className="pl-9"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {availableStudents.length > 0 && typeof classData?.standard === 'string' && classData.standard !== 'Hifz Only' && classData.standard !== 'Other' && (
                            <div className="mb-4 flex items-center justify-between bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                                <div className="text-sm text-blue-800">
                                    <span className="font-semibold">{availableStudents.length}</span> students found matching <b>{classData.standard}</b>
                                </div>
                                <Button size="sm" onClick={handleEnrollAll} className="bg-blue-600 hover:bg-blue-700 h-8">
                                    Enroll All
                                </Button>
                            </div>
                        )}

                        <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
                            {availableStudents.length > 0 ? (
                                availableStudents.map(student => (
                                    <div key={student.adm_no} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-10 w-10">
                                                <AvatarImage src={student.photo_url || ''} />
                                                <AvatarFallback>{student.name.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="font-semibold text-slate-800">{student.name}</div>
                                                <div className="text-xs text-slate-500">Adm No: {student.adm_no} • {student.type}</div>
                                            </div>
                                        </div>
                                        <Button size="sm" onClick={() => handleEnroll(student.adm_no)} className="bg-emerald-600 hover:bg-emerald-700">
                                            Enroll
                                        </Button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-slate-400">
                                    No available students found matching your search.
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {loading ? (
                <div className="h-40 flex items-center justify-center text-slate-400">Loading...</div>
            ) : (
                <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                    {enrollments.length > 0 ? (
                        <div className="divide-y divide-slate-100">
                            {enrollments.map(enrollment => (
                                <div key={enrollment.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                                            <AvatarImage src={enrollment.photo_url || ''} />
                                            <AvatarFallback className="bg-[#4f46e5]/10 text-[#4f46e5] font-semibold">
                                                {enrollment.student_name?.charAt(0) || 'U'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="font-semibold text-slate-800 text-lg">
                                                {enrollment.student_name}
                                            </div>
                                            <div className="text-sm font-medium text-slate-500 flex items-center gap-2">
                                                Adm No: {enrollment.student_id}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 self-end sm:self-auto">
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                                            onClick={() => handleRemove(enrollment.id)}
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" /> Remove
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-12 text-center text-slate-500">
                            <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                <Users className="h-8 w-8 text-slate-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-700 mb-1">No Students Enrolled</h3>
                            <p className="text-sm text-slate-400">Add students to this class to start tracking their attendance.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
