import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProfileHeader } from "./profile-header"
import { type Student } from "@/app/admin/students/page"
import { Calendar, Book, AlertCircle, History } from "lucide-react"

import { DisciplinaryTab } from "./tabs/disciplinary-tab"
import { ProgressTab } from "./tabs/progress-tab"
import { AttendanceTab } from "./tabs/attendance-tab"
import { ExamsTab } from "./tabs/exams-tab"

interface StudentProfileViewProps {
    student: Student | null
    onStudentUpdated?: () => void
    isAdmin?: boolean
}

export function StudentProfileView({ student, onStudentUpdated, isAdmin = true }: StudentProfileViewProps) {
    if (!student) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 min-h-[400px]">
                <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Book className="h-8 w-8 opacity-50" />
                </div>
                <p className="font-medium">Select a student to view details</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <ProfileHeader student={student} onMentorChanged={onStudentUpdated} isAdmin={isAdmin} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Basic Details Card */}
                <Card className="lg:col-span-3 border-none shadow-sm bg-slate-900/50 border border-slate-800">
                    <CardHeader className="pb-3 border-b border-slate-800/50">
                        <CardTitle className="text-base font-medium text-slate-400 uppercase tracking-wider">Basic Details</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div>
                                <label className="text-xs text-slate-500 block mb-1 uppercase tracking-wider">Date of Birth</label>
                                <p className="font-medium text-slate-200">{student.dob || "N/A"}</p>
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1 uppercase tracking-wider">Gender</label>
                                <p className="font-medium text-slate-200">Male</p>
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1 uppercase tracking-wider">Blood Group</label>
                                <p className="font-medium text-slate-200">N/A</p>
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1 uppercase tracking-wider">Religion</label>
                                <p className="font-medium text-slate-200">Islam</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Tabs Section */}
                <div className="lg:col-span-3">
                    <Tabs defaultValue="progress" className="w-full">
                        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent flex flex-wrap gap-x-2 md:gap-x-6 gap-y-1">
                            <TabsTrigger
                                value="progress"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-4 py-3"
                            >
                                <Book className="w-4 h-4 mr-2" />
                                Progress
                            </TabsTrigger>
                            <TabsTrigger
                                value="attendance"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-4 py-3"
                            >
                                <Calendar className="w-4 h-4 mr-2" />
                                Attendance
                            </TabsTrigger>
                            <TabsTrigger
                                value="exams"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-4 py-3"
                            >
                                <History className="w-4 h-4 mr-2" />
                                Exam Marks
                            </TabsTrigger>
                            <TabsTrigger
                                value="disciplinary"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-red-500 data-[state=active]:text-red-500 data-[state=active]:bg-transparent px-4 py-3 hover:text-red-500/80"
                            >
                                <AlertCircle className="w-4 h-4 mr-2" />
                                Disciplinary
                            </TabsTrigger>
                        </TabsList>

                        <div className="mt-6">
                            <TabsContent value="progress" className="m-0">
                                <ProgressTab student={student} />
                            </TabsContent>
                            <TabsContent value="attendance" className="m-0">
                                <AttendanceTab student={student} />
                            </TabsContent>
                            <TabsContent value="exams" className="m-0">
                                <ExamsTab student={student} />
                            </TabsContent>
                            <TabsContent value="disciplinary" className="m-0">
                                <DisciplinaryTab student={student} />
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </div>
        </div>
    )
}
