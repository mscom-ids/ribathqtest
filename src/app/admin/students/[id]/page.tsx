"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Loader2, Plus, Pencil, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import api from "@/lib/api"

const formSchema = z.object({
    name: z.string().min(2),
    dob: z.string(),
    address: z.string().optional(),
    father_name: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    batch_year: z.string(),
    standard: z.string(),
    assigned_usthad_id: z.string().optional(),
})

type StaffOption = { id: string; name: string }

export default function EditStudentPage() {
    const router = useRouter()
    const params = useParams()
    const id = params.id as string

    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(true)
    const [staff, setStaff] = useState<StaffOption[]>([])

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            dob: "",
            address: "",
            father_name: "",
            email: "",
            batch_year: "",
            standard: "",
            assigned_usthad_id: "unassigned" // explicit string for select
        },
    })

    const [photoUploading, setPhotoUploading] = useState(false)
    const [photoUrl, setPhotoUrl] = useState<string | null>(null)

    async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (!e.target.files || e.target.files.length === 0) {
            return
        }
        const file = e.target.files[0]
        setPhotoUploading(true)

        const formData = new FormData()
        formData.append('avatar', file)

        try {
            // Note: api handles the JWT and correct base URL seamlessly
            const res = await api.post('/upload/avatar', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            })

            if (res.data.success) {
                // Return path should be accessible relative to the domain (e.g. /public/avatars/avatar-123.jpg)
                // We'll construct full URL if backend doesn't, but relative might work based on next.config
                setPhotoUrl(process.env.NEXT_PUBLIC_API_URL + res.data.filePath)
            } else {
                throw new Error(res.data.error || "Upload failed")
            }

        } catch (error: any) {
            console.error("Upload error:", error)
            alert(`Photo upload failed: ${error.message || "Unknown error"}`)
        } finally {
            setPhotoUploading(false)
        }
    }

    const [hifzLogs, setHifzLogs] = useState<any[]>([])
    // Delete Log Function
    const handleDeleteLog = async (logId: string) => {
        if (!confirm("Are you sure you want to delete this entry?")) return

        try {
            const res = await api.delete(`/hifz/logs/${logId}`)
            if (res.data.success) {
                setHifzLogs(prev => prev.filter(l => l.id !== logId))
                alert("Entry deleted successfully")
            } else {
                alert(`Failed to delete: ${res.data.error}`)
            }
        } catch (error: any) {
            alert(`Failed to delete: ${error.message}`)
        }
    }

    useEffect(() => {
        async function loadData() {
            setFetching(true)
            // 1. Load Staff (Usthads + Vice Principal)
            try {
                const staffRes = await api.get('/staff')
                if (staffRes.data.success) {
                    setStaff(staffRes.data.staff)
                }
            } catch (error) {
                console.error("Failed to load staff", error)
            }

            // 2. Load Student
            try {
                const studentRes = await api.get(`/students/${id}`)
                if (studentRes.data.success) {
                    const student = studentRes.data.student
                    form.reset({
                        name: student.name,
                        dob: student.dob || student.date_of_birth, // handle snake_case mapped fields
                        address: student.address_line || student.address || "",
                        father_name: student.father_name || student.parent_name || "",
                        email: student.email || "",
                        batch_year: student.batch_year || "",
                        standard: student.school_standard || student.hifz_standard || student.madrassa_standard || "",
                        assigned_usthad_id: student.assigned_usthad_id || "unassigned"
                    })
                    if (student.photo_url) {
                        setPhotoUrl(student.photo_url)
                    }
                } else {
                    alert("Student not found")
                    router.push("/admin/students")
                    return
                }
            } catch (error) {
                console.error("Error fetching student:", error)
                alert("Student not found")
                router.push("/admin/students")
                return
            }


            // 3. Load Hifz Logs
            try {
                const logsRes = await api.get('/hifz/logs', { params: { student_id: id } })
                if (logsRes.data.success) {
                    setHifzLogs(logsRes.data.logs)
                }
            } catch (error) {
                console.error("Failed to fetch logs", error)
            }

            setFetching(false)
        }
        loadData()
    }, [id, router, form])

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true)

        const updates = {
            name: values.name,
            dob: values.dob,
            address: values.address || null,
            father_name: values.father_name || null,
            email: values.email || null,
            batch_year: values.batch_year,
            standard: values.standard,
            assigned_usthad_id: values.assigned_usthad_id === "unassigned" ? null : values.assigned_usthad_id,
            photo_url: photoUrl
        }

        try {
            const res = await api.put(`/students/${id}`, updates)
            if (res.data.success) {
                alert("Student details updated successfully")
            } else {
                alert(`Failed to update student: ${res.data.error}`)
            }
        } catch (error: any) {
            console.error("Update Student Error:", error)
            alert(`Failed to update student: ${error.message}`)
        }
    }

    if (fetching) {
        return <div className="p-8 text-center">Loading student details...</div>
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-emerald-900 dark:text-emerald-50">Student Profile: {id}</h1>
                <Button variant="outline" onClick={() => router.push("/admin/students")}>
                    Back to List
                </Button>
            </div>

            <Tabs defaultValue="profile" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="profile">Profile & Settings</TabsTrigger>
                    <TabsTrigger value="hifz">Hifz History</TabsTrigger>
                </TabsList>

                <TabsContent value="profile">
                    <Card>
                        <CardHeader>
                            <CardTitle>Edit Profile</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                                    <div className="flex flex-col space-y-2">
                                        <FormLabel>Student Photo</FormLabel>
                                        <div className="flex items-center gap-4">
                                            {photoUrl && (
                                                <img
                                                    src={photoUrl}
                                                    alt="Preview"
                                                    className="h-16 w-16 rounded-full object-cover border"
                                                />
                                            )}
                                            <Input
                                                type="file"
                                                accept="image/*"
                                                onChange={handlePhotoUpload}
                                                disabled={photoUploading}
                                            />
                                        </div>
                                        {photoUploading && <p className="text-xs text-muted-foreground">Uploading...</p>}
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Full Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="John Doe" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="dob"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Date of Birth</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="standard"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Standard/Grade</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select Standard" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="Hifz">Hifz Only</SelectItem>
                                                            <SelectItem value="5th">5th Standard</SelectItem>
                                                            <SelectItem value="6th">6th Standard</SelectItem>
                                                            <SelectItem value="7th">7th Standard</SelectItem>
                                                            <SelectItem value="8th">8th Standard</SelectItem>
                                                            <SelectItem value="9th">9th Standard</SelectItem>
                                                            <SelectItem value="10th">10th Standard</SelectItem>
                                                            <SelectItem value="Plus One">+1 (Plus One)</SelectItem>
                                                            <SelectItem value="Plus Two">+2 (Plus Two)</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="batch_year"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Batch Year</FormLabel>
                                                <FormControl>
                                                    <Input {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="assigned_usthad_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Assign Mentor</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value || "unassigned"}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select Mentor" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="unassigned">-- Unassigned --</SelectItem>
                                                        {staff.map((s) => (
                                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="father_name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Father's Name</FormLabel>
                                                    <FormControl>
                                                        <Input {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="email"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Parent Email</FormLabel>
                                                    <FormControl>
                                                        <Input type="email" placeholder="parent@example.com" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700">
                                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Save Changes
                                    </Button>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="hifz">
                    <Card>
                        <CardHeader>
                            <CardTitle>Hifz Progress Log</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                {hifzLogs.length === 0 ? (
                                    <div className="p-4 text-center text-muted-foreground">No records found.</div>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50 border-b">
                                            <tr>
                                                <th className="p-2 text-left">Date</th>
                                                <th className="p-2 text-left">Session</th>
                                                <th className="p-2 text-left">Mode</th>
                                                <th className="p-2 text-left">Task</th>
                                                <th className="p-2 text-center">Rating</th>
                                                <th className="p-2 text-left">Mentor</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {hifzLogs.map((log) => (
                                                <tr key={log.id} className="border-b">
                                                    <td className="p-2">{log.entry_date}</td>
                                                    <td className="p-2">{log.session_type}</td>
                                                    <td className="p-2">
                                                        <span className={`px-2 py-1 rounded text-xs ${log.mode === 'New Verses' ? 'bg-blue-100 text-blue-800' :
                                                            log.mode === 'Recent Revision' ? 'bg-orange-100 text-orange-800' :
                                                                'bg-green-100 text-green-800'
                                                            }`}>
                                                            {log.mode}
                                                        </span>
                                                    </td>
                                                    <td className="p-2">
                                                        {log.surah_name ? (
                                                            <>
                                                                {log.surah_name} <span className="text-muted-foreground px-1">:</span>
                                                                v.{log.start_v}-{log.end_v}
                                                            </>
                                                        ) : log.start_page ? (
                                                            <>Pages {log.start_page}-{log.end_page}</>
                                                        ) : log.juz_number ? (
                                                            <>Juz {log.juz_number} ({log.juz_portion})</>
                                                        ) : '-'}
                                                    </td>
                                                    <td className="p-2 text-center">
                                                        <span className="font-bold">{log.rating}</span>/5
                                                    </td>
                                                    <td className="p-2 text-muted-foreground text-xs">
                                                        {log.staff?.name || "Unknown"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
