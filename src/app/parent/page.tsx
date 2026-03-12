
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ProgressRing } from "@/components/parent/progress-ring"
import api from "@/lib/api"
import { calculateProgress, HifzLog } from "@/lib/hifz-progress"
import { LeaveRequestModal } from "./leave-request-modal"

type StudentProfile = {
    adm_no: string
    name: string
    photo_url?: string
    batch_year: string
    standard: string
}

type ExtendedHifzLog = HifzLog & {
    surah_name?: string
}

export default function ParentDashboard() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [children, setChildren] = useState<StudentProfile[]>([])
    const [selectedChildId, setSelectedChildId] = useState<string>("")
    const [logs, setLogs] = useState<ExtendedHifzLog[]>([])
    const [progress, setProgress] = useState(0)
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)

    // 1. Load Parent & Children
    useEffect(() => {
        async function loadFamily() {
            try {
                const res = await api.get('/parent/children')
                if (!res.data.success) {
                    router.push("/login")
                    return
                }
                const students = res.data.students || []
                if (students.length > 0) {
                    setChildren(students)
                    setSelectedChildId(students[0].adm_no)
                } else {
                    setChildren([])
                }
            } catch (e) {
                router.push("/login")
            }
            setLoading(false)
        }
        loadFamily()
    }, [router])

    // 2. Load Logs & Calculate Progress when child selected
    useEffect(() => {
        if (!selectedChildId) return

        async function fetchProgress() {
            try {
                const res = await api.get('/hifz/logs', { params: { student_id: selectedChildId } })
                if (res.data.success) {
                    const hifzLogs = res.data.logs as ExtendedHifzLog[]
                    setLogs(hifzLogs)
                    const progressVal = calculateProgress(hifzLogs)
                    setProgress(progressVal)
                }
            } catch (e) { console.error(e) }
        }

        fetchProgress()
    }, [selectedChildId])

    const handleLogout = async () => {
        try { await api.post('/auth/logout') } catch (e) { /* ignore */ }
        document.cookie = 'auth_token=; Max-Age=0; path=/'
        router.push("/login")
    }

    if (loading) return <div className="flex h-screen items-center justify-center">Loading family data...</div>

    if (children.length === 0) {
        return (
            <div className="flex h-screen flex-col items-center justify-center p-4">
                <h2 className="text-xl font-bold text-red-600">No Students Found</h2>
                <p className="text-muted-foreground text-center mt-2">
                    Your account does not seem to be linked to any enrolled students.
                    Please contact the administration.
                </p>
                <Button onClick={handleLogout} variant="outline" className="mt-6">Logout</Button>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-emerald-50/50 dark:bg-slate-950 p-4 pb-20">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-emerald-900 dark:text-emerald-400">Parent Portal</h1>
                    <p className="text-sm text-muted-foreground">Monitoring Progress</p>
                </div>
                <Button size="icon" variant="ghost" onClick={handleLogout}>
                    <LogOut className="w-5 h-5 text-red-500" />
                </Button>
            </header>

            <Tabs defaultValue={selectedChildId} onValueChange={setSelectedChildId} className="space-y-6">
                {children.length > 1 && (
                    <TabsList className="w-full grid grid-cols-2 lg:grid-cols-4">
                        {children.map(child => (
                            <TabsTrigger key={child.adm_no} value={child.adm_no}>{child.name}</TabsTrigger>
                        ))}
                    </TabsList>
                )}

                <TabsContent value={selectedChildId} className="space-y-6 animation-none">
                    {/* 1. Progress Overview */}
                    <Card className="border-emerald-100 shadow-lg dark:border-emerald-900">
                        <CardContent className="pt-6 flex flex-col items-center">
                            <ProgressRing percentage={progress} size={160} strokeWidth={12} />
                            <div className="mt-4 text-center">
                                <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">Hifz Completion</h3>
                                <p className="text-sm text-muted-foreground">Based on completed Juz</p>
                            </div>
                            <Button 
                                variant="outline" 
                                className="mt-6 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
                                onClick={() => setIsLeaveModalOpen(true)}
                            >
                                Request Leave
                            </Button>
                        </CardContent>
                    </Card>

                    {/* 2. Recent Activity */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Recent Logs</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[300px] pr-4">
                                <div className="space-y-4">
                                    {logs.slice(0, 10).map((log) => (
                                        <div key={log.id} className="flex items-start space-x-4 p-3 rounded-lg bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800">
                                            <div className={`p-2 rounded-full ${log.mode === 'New Verses' ? 'bg-emerald-100 text-emerald-600' :
                                                log.mode === 'Recent Revision' ? 'bg-blue-100 text-blue-600' :
                                                    'bg-amber-100 text-amber-600'
                                                }`}>
                                                <span className="text-xs font-bold block w-8 text-center">{log.rating} ★</span>
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center">
                                                    <h4 className="font-semibold text-sm">{log.mode}</h4>
                                                    <span className="text-xs text-muted-foreground">{log.entry_date}</span>
                                                </div>
                                                <p className="text-sm mt-1">
                                                    {log.mode === 'New Verses' || log.mode === 'Recent Revision' 
                                                        ? (log.surah_name ? `Surah ${log.surah_name}: ${log.start_v} - ${log.end_v}` : `Pages ${log.start_page}-${log.end_page}`)
                                                        : log.mode === 'Juz Revision' ? `Juz ${log.juz_number || '?'} ${(log as any).juz_portion || log.juz_part || ''}` 
                                                        : 'Revision Session'}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1 capitalize">{log.session_type}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {logs.length === 0 && (
                                        <p className="text-center text-muted-foreground py-4">No recent activity recorded.</p>
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
            
            <LeaveRequestModal
                open={isLeaveModalOpen}
                onOpenChange={setIsLeaveModalOpen}
                studentId={selectedChildId}
                studentName={children.find(c => c.adm_no === selectedChildId)?.name || ""}
            />
        </div>
    )
}
