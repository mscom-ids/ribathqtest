"use client"

import { useEffect, useState } from "react"
import { Users, CheckCircle2, XCircle, Clock, AlertCircle, Bookmark, UserSearch, History, LayoutGrid, Trash2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import api from "@/lib/api"
import { toast } from "sonner"
import { format } from "date-fns"

type DelegationRequest = {
    id: string
    from_staff_id: string
    to_staff_id: string
    from_mentor_name: string
    from_mentor_photo: string | null
    to_mentor_name: string
    to_mentor_photo: string | null
    reason: string | null
    student_name: string | null
    status: 'pending' | 'approved' | 'rejected' | 'terminated'
    created_at: string
    updated_at: string
    approved_at: string | null
    terminated_at: string | null
}

export default function AdminDelegationsPage() {
    const [requests, setRequests] = useState<DelegationRequest[]>([])
    const [loading, setLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)

    const getPhotoUrl = (url: string | null | undefined) => {
        if (!url) return undefined;
        return url.startsWith('http') ? url : `http://localhost:5000${url}`;
    }

    useEffect(() => {
        loadRequests()
    }, [])

    const loadRequests = async () => {
        setLoading(true)
        try {
            const res = await api.get('/delegations/admin/all')
            if (res.data.success) {
                setRequests(res.data.requests)
            }
        } catch (e) {
            console.error("Error loading pending requests:", e)
            toast.error("Failed to load requests")
        } finally {
            setLoading(false)
        }
    }

    const handleAction = async (id: string, status: 'approved' | 'rejected') => {
        if (processingId) return
        setProcessingId(id)
        try {
            const res = await api.put(`/delegations/admin/${id}/status`, { status })
            if (res.data.success) {
                toast.success(`Request ${status} successfully`)
                loadRequests() // Reload all once updated
            } else {
                toast.error(res.data.error || `Failed to update request`)
            }
        } catch (e: any) {
            toast.error(e.response?.data?.error || `Failed to update request`)
        } finally {
            setProcessingId(null)
        }
    }

    const handleRevoke = async (id: string) => {
        if (processingId) return
        if (!confirm("Are you sure you want to terminate this active student assignment? This will immediately return students to their original mentors.")) return
        
        setProcessingId(id)
        try {
            const res = await api.delete(`/delegations/admin/${id}`)
            if (res.data.success) {
                toast.success("Assignment terminated successfully")
                loadRequests()
            }
        } catch (e: any) {
            toast.error(e.response?.data?.error || "Failed to terminate")
        } finally {
            setProcessingId(null)
        }
    }

    const pending = requests.filter(r => r.status === 'pending')
    const active = requests.filter(r => r.status === 'approved')
    const history = requests.filter(r => r.status === 'rejected' || r.status === 'terminated')

    if (loading) {
        return (
            <div className="p-8 flex justify-center items-center h-[60vh]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white">Mentor Student Reassignment</h1>
                    <p className="text-slate-500 font-medium">Review and manage mentor student delegations.</p>
                </div>
            </div>

            <Tabs defaultValue="pending" className="w-full">
                <TabsList className="grid w-full grid-cols-3 md:w-fit bg-slate-100 dark:bg-slate-800 border p-1 rounded-xl">
                    <TabsTrigger value="pending" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow">
                        <Clock className="h-4 w-4" />
                        Pending
                        {pending.length > 0 && <Badge className="ml-1 bg-red-500">{pending.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="active" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow">
                        <CheckCircle2 className="h-4 w-4" />
                        Active
                        {active.length > 0 && <Badge className="ml-1 bg-blue-500">{active.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="history" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow">
                        <History className="h-4 w-4" />
                        History
                    </TabsTrigger>
                </TabsList>

                <div className="mt-8">
                    <TabsContent value="pending" className="space-y-6">
                        {pending.length === 0 ? (
                            <NoRequests variant="pending" />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {pending.map(r => (
                                    <RequestCard key={r.id} request={r} onAction={handleAction} onRevoke={handleRevoke} isProcessing={processingId === r.id} />
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="active" className="space-y-6">
                        {active.length === 0 ? (
                            <NoRequests variant="active" />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {active.map(r => (
                                    <RequestCard key={r.id} request={r} onAction={handleAction} onRevoke={handleRevoke} isProcessing={processingId === r.id} />
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="history" className="space-y-6">
                        {history.length === 0 ? (
                            <NoRequests variant="history" />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-80">
                                {history.map(r => (
                                    <RequestCard key={r.id} request={r} onAction={handleAction} onRevoke={handleRevoke} isProcessing={processingId === r.id} />
                                ))}
                            </div>
                        )}
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    )
}

function NoRequests({ variant }: { variant: string }) {
    return (
        <Card className="border-dashed border-2 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center mb-6">
                <CheckCircle2 className="h-8 w-8 text-slate-400" />
            </div>
            <CardTitle className="text-xl font-bold">No {variant} assignments</CardTitle>
            <CardDescription className="text-sm mt-2 max-w-[300px]">
                {variant === 'pending' ? "Hooray! No pending mentor reassignment requests at the moment." : 
                 variant === 'active' ? "There are currently no active assignments." : 
                 "No assignment history found."}
            </CardDescription>
        </Card>
    )
}

function RequestCard({ request, onAction, onRevoke, isProcessing }: { request: DelegationRequest, onAction: (id: string, s: 'approved' | 'rejected') => void, onRevoke: (id: string) => void, isProcessing: boolean }) {
    const getPhotoUrl = (url: string | null | undefined) => {
        if (!url) return undefined;
        return url.startsWith('http') ? url : `http://localhost:5000${url}`;
    }

    const getDurationText = () => {
        if (request.status !== 'terminated' || !request.approved_at || !request.terminated_at) return null;
        const start = new Date(request.approved_at);
        const end = new Date(request.terminated_at);
        const diffMs = end.getTime() - start.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays > 0) return `Active for ${diffDays} day${diffDays > 1 ? 's' : ''}`;
        if (diffHours > 0) return `Active for ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
        return `Active for ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
    }

    return (
        <Card className="overflow-hidden border-slate-200 dark:border-slate-700 hover:shadow-xl transition-all duration-300 group">
            <CardHeader className="border-b bg-slate-50/50 dark:bg-slate-800/20 px-6 py-4">
                <div className="flex justify-between items-start mb-2">
                    <Badge variant="outline" className={`
                        uppercase tracking-widest text-[10px] py-0.5
                        ${request.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                          request.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                          request.status === 'terminated' ? 'bg-slate-50 text-slate-700 border-slate-200' :
                          'bg-red-50 text-red-700 border-red-200'}
                    `}>
                        {request.status}
                    </Badge>
                    <span className="text-[11px] font-bold text-slate-400">
                        {format(new Date(request.created_at), 'MMM dd, yyyy')}
                    </span>
                </div>
                {request.student_name ? (
                    <div className="flex items-center gap-2 mt-2">
                         <Users className="h-3.5 w-3.5 text-blue-500" />
                         <span className="text-sm font-bold text-slate-800 dark:text-white truncate">
                            {request.student_name}
                         </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 mt-2">
                         <LayoutGrid className="h-3.5 w-3.5 text-indigo-500" />
                         <span className="text-sm font-bold text-slate-800 dark:text-white">Whole Class</span>
                    </div>
                )}
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                {/* Flow Visualization */}
                <div className="flex items-center justify-between gap-2 relative py-2">
                    <div className="flex flex-col items-center gap-2 z-10 w-[100px]">
                        <Avatar className="h-14 w-14 ring-4 ring-white dark:ring-slate-900 shadow-md">
                            <AvatarImage src={getPhotoUrl(request.from_mentor_photo)} className="object-cover" />
                            <AvatarFallback className="bg-blue-600 text-white font-bold">{request.from_mentor_name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 text-center line-clamp-1">{request.from_mentor_name}</span>
                        <span className="text-[10px] font-medium text-slate-400 uppercase">Original</span>
                    </div>

                    <div className="flex-1 border-t-2 border-dashed border-slate-200 dark:border-slate-700 relative h-0">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 px-1">
                            <Bookmark className="h-4 w-4 text-blue-500 fill-blue-500/10" />
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-2 z-10 w-[100px]">
                        <Avatar className="h-14 w-14 ring-4 ring-white dark:ring-slate-900 shadow-md">
                            <AvatarImage src={getPhotoUrl(request.to_mentor_photo)} className="object-cover" />
                            <AvatarFallback className="bg-indigo-600 text-white font-bold">{request.to_mentor_name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 text-center line-clamp-1">{request.to_mentor_name}</span>
                        <span className="text-[10px] font-medium text-slate-400 uppercase">Receiver</span>
                    </div>
                </div>

                {request.status === 'terminated' && request.terminated_at && (
                    <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700 rounded-xl p-3 text-center">
                        <p className="text-xs font-bold text-slate-500 mb-1 flex items-center justify-center gap-1">
                            <Clock className="h-3 w-3" />
                            {getDurationText()}
                        </p>
                        <p className="text-[10px] text-slate-400">
                            Ended: {format(new Date(request.terminated_at), 'MMM dd, HH:mm')}
                        </p>
                    </div>
                )}

                {request.reason && (
                    <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700 rounded-xl p-4 flex gap-3">
                        <AlertCircle className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                        <div>
                            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Reason</h4>
                            <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed italic line-clamp-2" title={request.reason}>{request.reason}</p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                    {request.status === 'pending' ? (
                        <>
                            <Button
                                variant="outline"
                                className="h-11 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl font-bold"
                                onClick={() => onAction(request.id, 'rejected')}
                                disabled={isProcessing}
                            >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                            </Button>
                            <Button
                                className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl"
                                onClick={() => onAction(request.id, 'approved')}
                                disabled={isProcessing}
                            >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Approve
                            </Button>
                        </>
                    ) : request.status === 'approved' ? (
                        <Button
                            variant="destructive"
                            className="h-11 col-span-2 rounded-xl font-bold gap-2"
                            onClick={() => onRevoke(request.id)}
                            disabled={isProcessing}
                        >
                            <Trash2 className="h-4 w-4" />
                            Terminate Assignment
                        </Button>
                    ) : null}
                </div>
            </CardContent>
        </Card>
    )
}
