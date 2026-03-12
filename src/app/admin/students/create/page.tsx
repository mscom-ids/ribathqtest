
"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import api from "@/lib/api"

const formSchema = z.object({
    adm_no: z.string().min(1, "Admission number is required"),
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

export default function CreateStudentPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [staff, setStaff] = useState<StaffOption[]>([])
    const [suggestedId, setSuggestedId] = useState("R001")
    const [idError, setIdError] = useState("")

    useEffect(() => {
        async function loadStaff() {
            try {
                const res = await api.get("/students/staff")
                if (res.data.success) {
                    setStaff(res.data.staff)
                }
            } catch (err) { console.error(err) }
        }
        async function loadNextId() {
            try {
                const res = await api.get("/students/next-id")
                if (res.data.success) {
                    setSuggestedId(res.data.nextId)
                }
            } catch (err) { console.error(err) }
        }
        loadStaff()
        loadNextId()
    }, [])

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            adm_no: "",
            name: "",
            dob: "",
            address: "",
            father_name: "",
            email: "",
            batch_year: new Date().getFullYear().toString(),
            standard: "Hifz",
        },
    })

    const [photoUploading, setPhotoUploading] = useState(false)
    const [photoUrl, setPhotoUrl] = useState<string | null>(null)

    async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setPhotoUploading(true);

        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const res = await api.post('/upload/avatar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                // The backend returns a relative url like `/public/avatars/avatar-xxx.jpg`
                // Build the full absolute path so the NextJS image strictly loads from the active backend server
                const backendBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
                const fullUrl = backendBase + res.data.filePath;
                setPhotoUrl(fullUrl);
            } else {
                alert("Failed to upload photo: " + res.data.error);
            }
        } catch (error: any) {
            console.error("Photo upload error:", error);
            alert("Upload failed: " + (error.response?.data?.error || error.message));
        } finally {
            setPhotoUploading(false);
        }
    }

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true)
        setIdError("")

        const admNo = values.adm_no.trim()

        try {
            const response = await api.post("/students", {
                admission_number: admNo,
                full_name: values.name,
                date_of_birth: values.dob || null,
                address: values.address || null,
                parent_name: values.father_name || null,
                email: values.email || null,
                batch_year: values.batch_year,
                class: values.standard, 
                assigned_usthad_id: values.assigned_usthad_id || null,
                photo_url: photoUrl,
                status: "active"
            })

            if (response.data.success) {
               router.push("/admin/students")
            } else {
               setIdError(response.data.error || "Failed to create student")
            }
        } catch (error: any) {
            console.error("Create Student Error:", error)
            setIdError(error.response?.data?.error || "Failed to create student")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-emerald-900 dark:text-emerald-50">Add New Student</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Student Details</CardTitle>
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

                            {/* Admission Number - Manual Entry */}
                            <FormField
                                control={form.control}
                                name="adm_no"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Admission Number (ID)</FormLabel>
                                        <FormControl>
                                            <Input placeholder={suggestedId} {...field} />
                                        </FormControl>
                                        <FormDescription>
                                            Enter manually. Suggested next: <button type="button" className="text-emerald-500 hover:underline font-mono" onClick={() => form.setValue('adm_no', suggestedId)}>{suggestedId}</button> — click to use
                                        </FormDescription>
                                        {idError && <p className="text-sm text-red-500 font-medium">{idError}</p>}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

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
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Mentor" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {staff.map((s) => (
                                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormDescription>Can be assigned later if needed.</FormDescription>
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
                                            <FormDescription>Used for Parent Portal login.</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create Student
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    )
}
