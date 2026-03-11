"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Plus, Trash2, Clock, Calendar, Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import api from "@/lib/api"
import { Checkbox } from "@/components/ui/checkbox"

// Schema
const sessionSchema = z.object({
    name: z.string().min(2, "Name is required"),
    type: z.enum(["Hifz", "School", "Madrassa"]),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    days: z.array(z.number()).optional(), // 0-6
    standards: z.array(z.string()).optional(),
})

type Session = {
    id: string
    name: string
    type: "Hifz" | "School" | "Madrassa"
    start_time: string | null
    end_time: string | null
    days_of_week: number[] | null
    standards: string[] | null
    is_active: boolean
}

const DAYS = [
    { label: "Sun", value: 0 },
    { label: "Mon", value: 1 },
    { label: "Tue", value: 2 },
    { label: "Wed", value: 3 },
    { label: "Thu", value: 4 },
    { label: "Fri", value: 5 },
    { label: "Sat", value: 6 },
]

export default function AcademicsPage() {
    const [sessions, setSessions] = useState<Session[]>([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingSession, setEditingSession] = useState<Session | null>(null)

    const form = useForm<z.infer<typeof sessionSchema>>({
        resolver: zodResolver(sessionSchema),
        defaultValues: {
            name: "",
            type: "Hifz",
            start_time: "",
            end_time: "",
            days: [0, 1, 2, 3, 4, 5, 6], // Default all days
            standards: [],
        },
    })

    async function loadSessions() {
        setLoading(true)
        try {
            const res = await api.get('/academics/sessions')
            if (res.data.success) setSessions(res.data.sessions || [])
            else alert('Failed to load sessions')
        } catch (err) {
            console.error('Error loading sessions:', err)
        }
        setLoading(false)
    }

    useEffect(() => {
        loadSessions()
    }, [])

    function handleEdit(session: Session) {
        setEditingSession(session)
        form.reset({
            name: session.name,
            type: session.type,
            start_time: session.start_time || "",
            end_time: session.end_time || "",
            days: session.days_of_week || [0, 1, 2, 3, 4, 5, 6],
            standards: session.standards || [],
        })
        setDialogOpen(true)
    }

    function handleAddNew() {
        setEditingSession(null)
        form.reset({
            name: "",
            type: "Hifz",
            start_time: "",
            end_time: "",
            days: [0, 1, 2, 3, 4, 5, 6],
            standards: [],
        })
        setDialogOpen(true)
    }

    async function onSubmit(values: z.infer<typeof sessionSchema>) {
        const payload = {
            name: values.name,
            type: values.type,
            start_time: values.start_time || null,
            end_time: values.end_time || null,
            days_of_week: values.days && values.days.length > 0 ? values.days : null,
            is_active: true,
            standards: values.standards && values.standards.length > 0 ? values.standards : null
        }

        try {
            let res
            if (editingSession) {
                res = await api.put(`/academics/sessions/${editingSession.id}`, payload)
            } else {
                res = await api.post('/academics/sessions', payload)
            }

            if (res.data.success) {
                setDialogOpen(false)
                setEditingSession(null)
                form.reset({ name: "", type: "Hifz", start_time: "", end_time: "", days: [0, 1, 2, 3, 4, 5, 6] })
                loadSessions()
            } else {
                alert('Failed to save session: ' + res.data.error)
            }
        } catch (err: any) {
            console.error(err)
            alert('Failed to save session: ' + err.message)
        }
    }

    async function deleteSession(id: string) {
        if (!confirm("Are you sure? This will delete the session definition.")) return

        try {
            const res = await api.delete(`/academics/sessions/${id}`)
            if (res.data.success) setSessions(sessions.filter(s => s.id !== id))
            else alert("Failed to delete session")
        } catch {
            alert("Failed to delete session")
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-emerald-900 dark:text-emerald-50">Academics</h1>
                    <p className="text-muted-foreground">Manage academic sessions and class timings.</p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddNew}>
                            <Plus className="mr-2 h-4 w-4" /> Add Session
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>{editingSession ? "Edit Session" : "Add Academic Session"}</DialogTitle>
                        </DialogHeader>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Session Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. Subh Hifz" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="type"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Type</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select Type" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="Hifz">Hifz</SelectItem>
                                                    <SelectItem value="School">School</SelectItem>
                                                    <SelectItem value="Madrassa">Madrassa</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="start_time"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Start Time</FormLabel>
                                                <FormControl>
                                                    <Input type="time" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="end_time"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>End Time</FormLabel>
                                                <FormControl>
                                                    <Input type="time" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Hidden Fields: Defaults to All Days & All Standards (Managed via Calendar Rules) */}
                                {/* 
                                <FormField
                                    control={form.control}
                                    name="days"
                                    render={() => (
                                        <FormItem>
                                            <div className="mb-4">
                                                <FormLabel>Active Days</FormLabel>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {DAYS.map((day) => (
                                                    <FormField
                                                        key={day.value}
                                                        control={form.control}
                                                        name="days"
                                                        // ...
                                                    />
                                                ))}
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                
                                <FormField
                                    control={form.control}
                                    name="standards"
                                    render={() => (
                                       // ...
                                    )}
                                /> 
                                */}
                                <p className="text-xs text-muted-foreground italic">
                                    Use Calendar Rules to configure specific days and class restrictions.
                                </p>

                                <Button type="submit" className="w-full">
                                    {editingSession ? "Update Session" : "Create Session"}
                                </Button>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <p>Loading sessions...</p>
                ) : sessions.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-muted-foreground border rounded-md border-dashed">
                        No sessions defined. Add one to get started.
                    </div>
                ) : (
                    sessions.map((session) => (
                        <Card key={session.id}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-lg font-bold">
                                    {session.name}
                                </CardTitle>
                                {session.type === "Hifz" ? (
                                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Hifz</span>
                                ) : session.type === "School" ? (
                                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">School</span>
                                ) : (
                                    <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10">Madrassa</span>
                                )}
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm text-slate-500 mb-2 flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    {session.start_time?.slice(0, 5) || "N/A"} - {session.end_time?.slice(0, 5) || "N/A"}
                                </div>
                                {/* Standards and Days hidden as per user request (managed by Calendar) */}
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => handleEdit(session)}
                                    >
                                        <Pencil className="h-4 w-4 mr-2" /> Edit
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => deleteSession(session.id)}
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    )
}
