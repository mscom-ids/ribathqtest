"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Loader2, Plus, Pencil, Trash2 } from "lucide-react"

import AdmissionDetailsTab from "./AdmissionDetailsTab"
import ReligiousEducationTab from "./ReligiousEducationTab"

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

const INDIAN_STATES = [
    "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", 
    "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli", "Daman and Diu", "Delhi", "Goa", 
    "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Lakshadweep", 
    "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", 
    "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", 
    "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const DISTRICTS_BY_STATE: Record<string, string[]> = {
  "Kerala": [ "Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad" ],
  "Karnataka": [ "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", "Bidar", "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga", "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayapura", "Yadgir", "Vijayanagara" ],
  "Tamil Nadu": [ "Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kanchipuram", "Kanyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli", "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore", "Viluppuram", "Virudhunagar" ],
  "Maharashtra": [ "Ahmednagar", "Akola", "Amravati", "Aurangabad", "Beed", "Bhandara", "Buldhana", "Chandrapur", "Dhule", "Gadchiroli", "Gondia", "Hingoli", "Jalgaon", "Jalna", "Kolhapur", "Latur", "Mumbai City", "Mumbai Suburban", "Nagpur", "Nanded", "Nandurbar", "Nashik", "Osmanabad", "Palghar", "Parbhani", "Pune", "Raigad", "Ratnagiri", "Sangli", "Satara", "Sindhudurg", "Solapur", "Thane", "Wardha", "Washim", "Yavatmal" ]
};

const formSchema = z.object({
    name: z.string().min(2),
    dob: z.string().optional(),
    address: z.string().optional(),
    father_name: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    batch_year: z.string().optional(),
    standard: z.string().optional(),
    assigned_usthad_id: z.string().optional(),
    local_body: z.string().optional(),
    pincode: z.string().optional(),
    id_mark: z.string().optional(),
    district: z.string().optional(),
    nationality: z.string().optional(),
    country: z.string().optional(),
    place: z.string().optional(),
    state: z.string().optional(),
    gender: z.string().optional(),
    aadhar: z.string().optional(),
})

type StaffOption = { id: string; name: string }

export default function EditStudentPage() {
    const router = useRouter()
    const params = useParams()
    const id = params.id as string

    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(true)
    const [editing, setEditing] = useState(false)
    const [staff, setStaff] = useState<StaffOption[]>([])
    const [studentData, setStudentData] = useState<any>(null)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            dob: "",
            address: "",
            father_name: "",
            email: "",
            batch_year: "",
            standard: "Hifz",
            assigned_usthad_id: "unassigned",
            local_body: "",
            pincode: "",
            id_mark: "",
            district: "",
            nationality: "Indian",
            country: "",
            place: "",
            state: "",
            gender: "Male",
            aadhar: ""
        },
    })

    const watchedNationality = form.watch("nationality")
    const watchedState = form.watch("state")
    const isIndian = watchedNationality?.toLowerCase() === "indian" || watchedNationality?.toLowerCase() === "india"

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
                // We construct the full URL by stripping /api from the NEXT_PUBLIC_API_URL
                const backendBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
                const fullUrl = backendBase + res.data.filePath;
                setPhotoUrl(fullUrl)
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
                    setStudentData(student)
                    form.reset({
                        name: student.name,
                        dob: (student.dob || student.date_of_birth) ? new Date(student.dob || student.date_of_birth).toISOString().split('T')[0] : "",
                        address: student.address_line || student.address || "",
                        father_name: student.father_name || student.parent_name || "",
                        email: student.email || "",
                        batch_year: student.batch_year || "",
                        standard: student.school_standard || student.hifz_standard || student.madrassa_standard || "",
                        assigned_usthad_id: student.assigned_usthad_id || "unassigned",
                        local_body: student.comprehensive_details?.basic?.local_body || "",
                        pincode: student.comprehensive_details?.basic?.pincode || "",
                        id_mark: student.comprehensive_details?.basic?.id_mark || "",
                        district: student.comprehensive_details?.basic?.district || "",
                        nationality: student.comprehensive_details?.basic?.nationality || "Indian",
                        country: student.comprehensive_details?.basic?.country || "",
                        place: student.comprehensive_details?.basic?.place || "",
                        state: student.comprehensive_details?.basic?.state || "",
                        gender: student.gender || student.comprehensive_details?.basic?.gender || "Male",
                        aadhar: student.aadhar || student.comprehensive_details?.basic?.aadhar || ""
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
            dob: values.dob || null,
            address: values.address || null,
            father_name: values.father_name || null,
            email: values.email || null,
            batch_year: values.batch_year || null,
            standard: values.standard || null,
            assigned_usthad_id: values.assigned_usthad_id === "unassigned" ? null : values.assigned_usthad_id,
            photo_url: photoUrl,
            comprehensive_details: {
                basic: {
                    local_body: values.local_body,
                    pincode: values.pincode,
                    id_mark: values.id_mark,
                    district: values.district,
                    nationality: values.nationality,
                    country: values.country,
                    place: values.place,
                    state: values.state,
                    gender: values.gender,
                    aadhar: values.aadhar
                }
            }
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
        } finally {
            setLoading(false)
        }
    }

    if (fetching) {
        return <div className="p-8 text-center">Loading student details...</div>
    }

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20">
            {/* Hero Section */}
            <div className="relative rounded-2xl overflow-hidden bg-white border border-slate-100 shadow-sm p-6 sm:p-8">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-50 via-teal-50/30 to-white pointer-events-none" />
                <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white flex items-center justify-center text-3xl font-bold shadow-sm border-4 border-white flex-shrink-0 overflow-hidden">
                            {studentData?.photo_url ? (
                                <img src={studentData.photo_url} alt="Profile" className="h-full w-full object-cover" />
                            ) : (
                                studentData?.name ? studentData.name.charAt(0).toUpperCase() : id.charAt(0)
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{studentData?.name || 'Loading Student...'}</h1>
                                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-md">
                                    {id}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-slate-500 font-medium">
                                <span>{studentData?.standard || 'Unassigned Class'}</span>
                                {studentData?.batch_year && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                                        <span>Batch: {studentData.batch_year}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <Button variant="outline" onClick={() => router.push("/admin/students")} className="bg-white hover:bg-slate-50 border-slate-200 text-slate-600 shadow-sm">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="basic" className="w-full">
                <div className="border-b border-slate-200 w-full mb-6">
                    <TabsList className="w-full justify-start h-auto p-0 bg-transparent flex flex-wrap gap-x-6 gap-y-0 pb-px px-2">
                        {[
                            { value: 'basic', label: 'Basic Info' },
                            { value: 'admission', label: 'Admission Details' },
                            { value: 'family', label: 'Family Info' },
                            { value: 'religious', label: 'Religious Education' },
                            { value: 'academic', label: 'Academic Information' },
                            { value: 'languages', label: 'Languages' },
                            { value: 'achievements', label: 'Achievements' },
                            { value: 'sulook', label: 'Sulook' },
                            { value: 'skills', label: 'Skills' },
                            { value: 'contributions', label: 'Contributions' },
                            { value: 'profession', label: 'Profession' },
                            { value: 'hifz', label: 'Hifz History' },
                        ].map(tab => (
                            <TabsTrigger 
                                key={tab.value}
                                value={tab.value} 
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:text-emerald-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 py-3 whitespace-nowrap text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                            >
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                <TabsContent value="basic" className="mt-6">
                    <Card className="border-none shadow-sm bg-white border border-slate-100 overflow-hidden">
                        <div className="bg-gradient-to-r from-slate-50 to-white px-6 py-4 border-b border-slate-100 flex flex-row items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-800">Basic Information</h3>
                                <p className="text-sm text-slate-500">Personal details and identification</p>
                            </div>
                            <Button 
                                variant={editing ? "default" : "outline"} 
                                className={editing ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm"}
                                type="button" 
                                onClick={() => editing ? form.handleSubmit(onSubmit)() : setEditing(true)}
                            >
                                {loading ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                                ) : editing ? (
                                    "Save Changes"
                                ) : (
                                    <><Pencil className="mr-2 h-4 w-4" /> Edit Profile</>
                                )}
                            </Button>
                        </div>
                        <CardContent className="p-6">
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
                                                    <Input placeholder="John Doe" disabled={!editing} {...field} />
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
                                                        <Input type="date" disabled={!editing} {...field} />
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
                                                    <Select onValueChange={field.onChange} value={field.value} disabled={!editing}>
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

                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField control={form.control} name="gender" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Gender</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value || ""} disabled={!editing}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select Gender" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Male">Male</SelectItem>
                                                        <SelectItem value="Female">Female</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="aadhar" render={({ field }) => (
                                            <FormItem><FormLabel>Aadhar Number</FormLabel>
                                            <FormControl><Input placeholder="xxxx xxxx xxxx" disabled={!editing} {...field} /></FormControl>
                                            <FormMessage /></FormItem>
                                        )} />
                                    </div>

                                    <FormField control={form.control} name="address" render={({ field }) => (
                                        <FormItem><FormLabel>Address Line</FormLabel>
                                        <FormControl><Input placeholder="House name/number" disabled={!editing} {...field} /></FormControl>
                                        <FormMessage /></FormItem>
                                    )} />

                                    <div className="grid grid-cols-3 gap-4">
                                        <FormField control={form.control} name="place" render={({ field }) => (
                                            <FormItem><FormLabel>Place</FormLabel>
                                            <FormControl><Input placeholder="City/Town" disabled={!editing} {...field} /></FormControl>
                                            <FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="local_body" render={({ field }) => (
                                            <FormItem><FormLabel>Local Body</FormLabel>
                                            <FormControl><Input placeholder="Panchayat/Municipality" disabled={!editing} {...field} /></FormControl>
                                            <FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="pincode" render={({ field }) => (
                                            <FormItem><FormLabel>Pincode</FormLabel>
                                            <FormControl><Input placeholder="671123" disabled={!editing} {...field} /></FormControl>
                                            <FormMessage /></FormItem>
                                        )} />
                                    </div>

                                    <div className="grid grid-cols-3 gap-4">
                                        <FormField control={form.control} name="nationality" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Nationality</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value || "Indian"} disabled={!editing}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select Nationality" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Indian">Indian</SelectItem>
                                                        <SelectItem value="Other">Other</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        
                                        {watchedNationality === "Other" && (
                                            <FormField control={form.control} name="country" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Country</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="E.g., UAE" disabled={!editing} {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )} />
                                        )}
                                        
                                        <FormField control={form.control} name="state" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>State</FormLabel>
                                                {isIndian ? (
                                                    <Select onValueChange={field.onChange} value={field.value || ""} disabled={!editing}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select State" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="max-h-60">
                                                            {INDIAN_STATES.map((state) => (
                                                                <SelectItem key={state} value={state}>{state}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <FormControl>
                                                        <Input placeholder="E.g., KL or Kerala" disabled={!editing} {...field} />
                                                    </FormControl>
                                                )}
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        
                                        <FormField control={form.control} name="district" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>District</FormLabel>
                                                {isIndian && watchedState && DISTRICTS_BY_STATE[watchedState] ? (
                                                    <Select onValueChange={field.onChange} value={field.value || ""} disabled={!editing}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select District" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="max-h-60">
                                                            {DISTRICTS_BY_STATE[watchedState].map((district) => (
                                                                <SelectItem key={district} value={district}>{district}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <FormControl>
                                                        <Input placeholder="E.g., Kasaragod" disabled={!editing} {...field} />
                                                    </FormControl>
                                                )}
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField control={form.control} name="id_mark" render={({ field }) => (
                                            <FormItem><FormLabel>Identification Mark</FormLabel>
                                            <FormControl><Input placeholder="E.g., Mole on left face" disabled={!editing} {...field} /></FormControl>
                                            <FormMessage /></FormItem>
                                        )} />
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="batch_year"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Batch Year</FormLabel>
                                                <FormControl>
                                                    <Input disabled={!editing} {...field} />
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
                                                <Select onValueChange={field.onChange} value={field.value || "unassigned"} disabled={!editing}>
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
                                                        <Input disabled={!editing} {...field} />
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
                                                        <Input type="email" placeholder="parent@example.com" disabled={!editing} {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {editing && (
                                        <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700">
                                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Save Changes
                                        </Button>
                                    )}
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="admission">
                    <AdmissionDetailsTab studentId={id} initialData={studentData?.comprehensive_details?.admission} />
                </TabsContent>

                <TabsContent value="family">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Family Info</CardTitle>
                            <Button variant="outline" size="sm">Update</Button>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center py-8 text-muted-foreground bg-slate-50 dark:bg-slate-900 rounded-md">Map parent details here.</div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="religious">
                    <ReligiousEducationTab studentId={id} initialData={studentData?.comprehensive_details?.religious} />
                </TabsContent>

                {/* Additional Placeholders */}
                {['academic', 'languages', 'achievements', 'sulook', 'skills', 'contributions'].map(tab => (
                    <TabsContent key={tab} value={tab}>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="capitalize">{tab} Info</CardTitle>
                                <Button variant="outline" size="sm">Update</Button>
                            </CardHeader>
                            <CardContent>
                                <div className="text-center py-8 text-muted-foreground bg-slate-50 dark:bg-slate-900 rounded-md">
                                    Tab data builder for {tab} goes here.
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                ))}

                <TabsContent value="profession">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="text-4xl mb-4 text-slate-300">🏢</div>
                                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">Alumni Access Only</h3>
                                <p className="text-sm text-slate-500 max-w-sm mt-1">This section is available exclusively for alumni users.</p>
                            </div>
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
