"use client"

import React, { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Loader2, Pencil, X, AlertCircle, CheckCircle2, User, BookOpen, FileText, Users, BookMarked, GraduationCap, Globe, Trophy, Heart, Lightbulb, Gift, Briefcase } from "lucide-react"

import AdmissionDetailsTab from "./AdmissionDetailsTab"
import ReligiousEducationTab from "./ReligiousEducationTab"
import { ProgressTab } from "@/components/admin/student-profile/tabs/progress-tab"

import { Button } from "@/components/ui/button"
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import api from "@/lib/api"

// ── Constants ────────────────────────────────────────────────
const INDIAN_STATES = [
    "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
    "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli", "Daman and Diu", "Delhi", "Goa",
    "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Lakshadweep",
    "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
    "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal"
]

const DISTRICTS_BY_STATE: Record<string, string[]> = {
    "Kerala": ["Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad"],
    "Karnataka": ["Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", "Bidar", "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga", "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayapura", "Yadgir", "Vijayanagara"],
    "Tamil Nadu": ["Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kanchipuram", "Kanyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli", "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore", "Viluppuram", "Virudhunagar"],
    "Maharashtra": ["Ahmednagar", "Akola", "Amravati", "Aurangabad", "Beed", "Bhandara", "Buldhana", "Chandrapur", "Dhule", "Gadchiroli", "Gondia", "Hingoli", "Jalgaon", "Jalna", "Kolhapur", "Latur", "Mumbai City", "Mumbai Suburban", "Nagpur", "Nanded", "Nandurbar", "Nashik", "Osmanabad", "Palghar", "Parbhani", "Pune", "Raigad", "Ratnagiri", "Sangli", "Satara", "Sindhudurg", "Solapur", "Thane", "Wardha", "Washim", "Yavatmal"]
}

// ── Form schema ──────────────────────────────────────────────
const formSchema = z.object({
    name: z.string().min(2),
    dob: z.string().optional(),
    address: z.string().optional(),
    father_name: z.string().optional(),
    email: z.string().optional().or(z.literal('')),
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

// ── Helpers ──────────────────────────────────────────────────
function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return "—"
    try {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return "—"
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return "—" }
}

/** Left-panel label-value row — matches PreSkool reference */
function InfoRow({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
            <span className="text-[13px] text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
            <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 text-right truncate">{value || "—"}</span>
        </div>
    )
}

/** Right-panel section display field */
function InfoField({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{value || "—"}</p>
        </div>
    )
}

// ── Status styles ─────────────────────────────────────────────
const statusConfig: Record<string, { label: string; dot: string; badge: string }> = {
    active:    { label: "Active",    dot: "bg-[#26af48]", badge: "bg-[#e6f7ec] text-[#26af48]" },
    completed: { label: "Completed", dot: "bg-blue-500",    badge: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    dropout:   { label: "Dropout",   dot: "bg-red-400",     badge: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
}

// ── Main Component ────────────────────────────────────────────
export default function StudentDetailPage() {
    const router = useRouter()
    const params = useParams()
    const id = params.id as string

    const [activeTab, setActiveTab] = useState("basic")
    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(true)
    const [editing, setEditing] = useState(false)
    const [staff, setStaff] = useState<StaffOption[]>([])
    const [studentData, setStudentData] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)
    const [saveSuccess, setSaveSuccess] = useState(false)
    const [hifzLogs, setHifzLogs] = useState<any[]>([])
    const [photoUploading, setPhotoUploading] = useState(false)
    const [photoUrl, setPhotoUrl] = useState<string | null>(null)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "", dob: "", address: "", father_name: "", email: "",
            batch_year: "", standard: "", assigned_usthad_id: "unassigned",
            local_body: "", pincode: "", id_mark: "", district: "",
            nationality: "Indian", country: "", place: "", state: "",
            gender: "Male", aadhar: ""
        },
    })

    const watchedNationality = form.watch("nationality")
    const watchedState = form.watch("state")
    const isIndian = watchedNationality?.toLowerCase() === "indian" || watchedNationality?.toLowerCase() === "india"

    // ── Photo upload ──────────────────────────────────────────
    async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (!e.target.files?.length) return
        setPhotoUploading(true)
        const fd = new FormData()
        fd.append('avatar', e.target.files[0])
        try {
            const res = await api.post('/upload/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            if (res.data.success) {
                const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '')
                setPhotoUrl(base + res.data.filePath)
            }
        } catch (err) { console.error("Upload error:", err) }
        finally { setPhotoUploading(false) }
    }

    // ── Load data ─────────────────────────────────────────────
    useEffect(() => {
        async function loadData() {
            setFetching(true)
            try {
                const staffRes = await api.get('/staff')
                if (staffRes.data.success) setStaff(staffRes.data.staff)
            } catch { console.error("Failed to load staff") }

            try {
                const res = await api.get(`/students/${id}`)
                if (res.data.success) {
                    const s = res.data.student
                    setStudentData(s)
                    if (s.photo_url) setPhotoUrl(s.photo_url)
                    form.reset({
                        name: s.name,
                        dob: (s.dob || s.date_of_birth) ? new Date(s.dob || s.date_of_birth).toISOString().split('T')[0] : "",
                        address: s.address_line || s.address || "",
                        father_name: s.father_name || s.parent_name || "",
                        email: s.email || "",
                        batch_year: s.batch_year || "",
                        standard: s.school_standard || s.hifz_standard || s.madrassa_standard || "",
                        assigned_usthad_id: s.assigned_usthad_id || "unassigned",
                        local_body: s.comprehensive_details?.basic?.local_body || "",
                        pincode: s.comprehensive_details?.basic?.pincode || "",
                        id_mark: s.comprehensive_details?.basic?.id_mark || "",
                        district: s.comprehensive_details?.basic?.district || "",
                        nationality: s.comprehensive_details?.basic?.nationality || "Indian",
                        country: s.comprehensive_details?.basic?.country || "",
                        place: s.comprehensive_details?.basic?.place || "",
                        state: s.comprehensive_details?.basic?.state || "",
                        gender: s.gender || s.comprehensive_details?.basic?.gender || "Male",
                        aadhar: s.aadhar || s.comprehensive_details?.basic?.aadhar || ""
                    })
                } else {
                    setError("Student record not found.")
                    setFetching(false)
                    return
                }
            } catch {
                setError("Could not connect to server. Please ensure the backend is running.")
                setFetching(false)
                return
            }

            try {
                const logsRes = await api.get('/hifz/logs', { params: { student_id: id } })
                if (logsRes.data.success) setHifzLogs(logsRes.data.logs)
            } catch { /* non-blocking */ }

            setFetching(false)
        }
        loadData()
    }, [id, form])

    // ── Save ──────────────────────────────────────────────────
    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true)
        const updates = {
            name: values.name, dob: values.dob || null,
            address: values.address || null, father_name: values.father_name || null,
            email: values.email || null, batch_year: values.batch_year || null,
            standard: values.standard || null,
            assigned_usthad_id: values.assigned_usthad_id === "unassigned" ? null : values.assigned_usthad_id,
            photo_url: photoUrl,
            comprehensive_details: {
                basic: {
                    local_body: values.local_body, pincode: values.pincode,
                    id_mark: values.id_mark, district: values.district,
                    nationality: values.nationality, country: values.country,
                    place: values.place, state: values.state,
                    gender: values.gender, aadhar: values.aadhar
                }
            }
        }
        try {
            const res = await api.put(`/students/${id}`, updates)
            if (res.data.success) {
                setStudentData((prev: any) => ({
                    ...prev, name: values.name, dob: values.dob,
                    address: values.address, father_name: values.father_name,
                    email: values.email, batch_year: values.batch_year,
                    gender: values.gender, aadhar: values.aadhar, photo_url: photoUrl,
                    comprehensive_details: { ...prev?.comprehensive_details, basic: updates.comprehensive_details.basic }
                }))
                setEditing(false)
                setSaveSuccess(true)
                setTimeout(() => setSaveSuccess(false), 3000)
            }
        } catch (err) { console.error("Update error:", err) }
        finally { setLoading(false) }
    }

    function handleCancelEdit() {
        const s = studentData
        if (!s) { setEditing(false); return }
        form.reset({
            name: s.name || "", dob: (s.dob || s.date_of_birth) ? new Date(s.dob || s.date_of_birth).toISOString().split('T')[0] : "",
            address: s.address_line || s.address || "", father_name: s.father_name || s.parent_name || "",
            email: s.email || "", batch_year: s.batch_year || "",
            standard: s.school_standard || s.hifz_standard || s.madrassa_standard || "",
            assigned_usthad_id: s.assigned_usthad_id || "unassigned",
            local_body: s.comprehensive_details?.basic?.local_body || "", pincode: s.comprehensive_details?.basic?.pincode || "",
            id_mark: s.comprehensive_details?.basic?.id_mark || "", district: s.comprehensive_details?.basic?.district || "",
            nationality: s.comprehensive_details?.basic?.nationality || "Indian", country: s.comprehensive_details?.basic?.country || "",
            place: s.comprehensive_details?.basic?.place || "", state: s.comprehensive_details?.basic?.state || "",
            gender: s.gender || s.comprehensive_details?.basic?.gender || "Male",
            aadhar: s.aadhar || s.comprehensive_details?.basic?.aadhar || ""
        })
        setEditing(false)
    }

    // ── Loading / Error states ────────────────────────────────
    if (fetching) {
        return (
            <div className="flex flex-col items-center justify-center py-32">
                <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-4" />
                <p className="text-sm text-slate-500">Loading student details...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#1e2538] rounded-2xl border border-red-100 shadow-sm text-center px-6 max-w-lg mx-auto mt-12">
                <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
                <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">Unable to Load Student</h2>
                <p className="text-sm text-slate-500 mb-6">{error}</p>
                <Button onClick={() => router.push("/admin/students")} variant="outline">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Students
                </Button>
            </div>
        )
    }

    const status = studentData?.status || 'active'
    const statusStyle = statusConfig[status] || statusConfig.active
    const mentorName = staff.find(s => s.id === studentData?.assigned_usthad_id)?.name

    // ── Render ────────────────────────────────────────────────
    return (
        <div className="space-y-4 pb-20">

            {/* ── Page Header ──────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 dark:text-white">Student Details</h1>
                    <p className="text-xs text-slate-400 mt-0.5">Dashboard / Students / Student Details</p>
                </div>
                <Button variant="outline" onClick={() => router.push("/admin/students")}
                    className="gap-2 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600">
                    <ArrowLeft className="h-4 w-4" /> Back to List
                </Button>
            </div>

            {/* ── Save Success Banner ───────────────────────────── */}
            {saveSuccess && (
                <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-700 dark:text-emerald-400 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Student profile updated successfully.
                </div>
            )}

            {/* ── 2-Column Layout ──────────────────────────────── */}
            <div className="flex gap-5 items-start">

                {/* ╔══════════════════════════════╗
                    ║      LEFT PANEL              ║
                    ╚══════════════════════════════╝ */}
                <div className="w-[300px] shrink-0">
                    <div className="bg-white dark:bg-[#1e2538] border border-slate-200 dark:border-[#2a3348] rounded-2xl shadow-sm">

                        {/* ── Profile header ─────────────────────── */}
                        <div className="px-6 pt-6 pb-5 flex flex-col items-center text-center">
                            <div className="relative">
                                <div className="h-[88px] w-[88px] rounded-xl overflow-hidden bg-[#e8ebfd] flex items-center justify-center text-4xl font-bold text-[#3d5ee1]">
                                    {photoUrl
                                        ? <img src={photoUrl} alt="Profile" className="h-full w-full object-cover" />
                                        : studentData?.name?.charAt(0).toUpperCase()
                                    }
                                </div>
                                <span className={`absolute -bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${statusStyle.badge} border-2 border-white dark:border-[#1e2538] shadow-sm`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                                    {statusStyle.label}
                                </span>
                            </div>
                            <h2 className="font-bold text-slate-900 dark:text-white text-[15px] leading-snug mt-5 tracking-tight">
                                {studentData?.name}
                            </h2>
                            <span className="text-sm font-semibold text-[#3d5ee1] mt-0.5">
                                {id}
                            </span>
                        </div>

                        {/* ── Basic Information ──────────────────── */}
                        <div className="mx-5 border-t border-slate-100 dark:border-slate-700/50" />
                        <div className="px-6 pt-5 pb-2">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">Basic Information</h3>
                        </div>
                        <div className="px-6 pb-4">
                            <InfoRow label="Roll No" value={id} />
                            <InfoRow label="Gender" value={studentData?.gender || studentData?.comprehensive_details?.basic?.gender} />
                            <InfoRow label="Date Of Birth" value={formatDate(studentData?.dob || studentData?.date_of_birth)} />
                            <InfoRow label="Standard" value={studentData?.school_standard || studentData?.hifz_standard || studentData?.madrassa_standard} />
                            <InfoRow label="Batch Year" value={studentData?.batch_year} />
                            <InfoRow label="Nationality" value={studentData?.comprehensive_details?.basic?.nationality} />
                            <InfoRow label="Father" value={studentData?.father_name || studentData?.parent_name} />
                            <InfoRow label="Usthad" value={mentorName} />
                            <InfoRow label="Aadhar" value={studentData?.aadhar || studentData?.comprehensive_details?.basic?.aadhar} />
                        </div>

                        {/* ── Primary Contact ────────────────────── */}
                        <div className="mx-5 border-t border-slate-100 dark:border-slate-700/50" />
                        <div className="px-6 pt-5 pb-2">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">Primary Contact Info</h3>
                        </div>
                        <div className="px-6 pb-4 space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                                    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-slate-400 font-medium">Email Address</p>
                                    <p className="text-[13px] text-slate-700 dark:text-slate-300 font-medium truncate">{studentData?.email || "—"}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                                    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-slate-400 font-medium">Location</p>
                                    <p className="text-[13px] text-slate-700 dark:text-slate-300 font-medium truncate">
                                        {[studentData?.comprehensive_details?.basic?.place, studentData?.comprehensive_details?.basic?.district, studentData?.comprehensive_details?.basic?.state].filter(Boolean).join(", ") || "—"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* ── Add Fees button ────────────────────── */}
                        <div className="px-5 pb-5 pt-2">
                            <button className="w-full py-2.5 px-4 rounded-xl bg-[#3d5ee1] hover:bg-[#3d5ee1]/90 text-white text-sm font-semibold transition-colors">
                                Add Fees
                            </button>
                        </div>
                    </div>
                </div>

                {/* ╔══════════════════════════════╗
                    ║      RIGHT PANEL             ║
                    ╚══════════════════════════════╝ */}
                <div className="flex-1 min-w-0">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

                        {/* ── Tab Navigation — plain buttons, 2-row grid ── */}
                        <div className="bg-white dark:bg-[#1e2538] rounded-xl shadow-sm mb-4 border border-slate-200 dark:border-[#2a3348] px-2 py-2">
                            <div className="grid grid-cols-7 gap-1">
                                {([
                                    { value: 'basic',        label: 'Student Details',  icon: User },
                                    { value: 'hifz',         label: 'Hifz History',     icon: BookOpen },
                                    { value: 'admission',    label: 'Admission',         icon: FileText },
                                    { value: 'family',       label: 'Family Info',       icon: Users },
                                    { value: 'religious',    label: 'Religious Ed.',     icon: BookMarked },
                                    { value: 'academic',     label: 'Academics',         icon: GraduationCap },
                                    { value: 'languages',    label: 'Languages',         icon: Globe },
                                    { value: 'achievements', label: 'Achievements',      icon: Trophy },
                                    { value: 'sulook',       label: 'Sulook',            icon: Heart },
                                    { value: 'skills',       label: 'Skills',            icon: Lightbulb },
                                    { value: 'contributions',label: 'Contributions',     icon: Gift },
                                    { value: 'profession',   label: 'Profession',        icon: Briefcase },
                                ]).map(tab => {
                                    const Icon = tab.icon
                                    const isActive = activeTab === tab.value
                                    return (
                                        <button
                                            key={tab.value}
                                            onClick={() => setActiveTab(tab.value)}
                                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
                                                ${isActive
                                                    ? 'bg-[#e8ebfd] text-[#3d5ee1]'
                                                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 hover:text-slate-700 dark:hover:text-slate-200'
                                                }`}
                                        >
                                            <Icon className="h-3.5 w-3.5 shrink-0" />
                                            {tab.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* ── BASIC INFO TAB ──────────────────────── */}
                        <TabsContent value="basic" className="mt-0">
                            <div className="bg-white dark:bg-[#1e2538] border border-slate-200 dark:border-[#2a3348] rounded-xl shadow-sm overflow-hidden">

                                {/* Card header */}
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-[#2a3348] flex items-center justify-between">
                                    <div>
                                        <h3 className="text-base font-semibold text-slate-800 dark:text-white">Basic Information</h3>
                                        <p className="text-xs text-slate-400 mt-0.5">Personal details and identification</p>
                                    </div>
                                    {!editing ? (
                                        <Button variant="outline" size="sm" onClick={() => setEditing(true)}
                                            className="gap-1.5 text-xs bg-white border-[#3d5ee1] text-[#3d5ee1] hover:bg-[#e8ebfd]">
                                            <Pencil className="h-3.5 w-3.5" /> Edit Profile
                                        </Button>
                                    ) : (
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={() => form.handleSubmit(onSubmit)()} disabled={loading}
                                                className="bg-[#3d5ee1] hover:bg-[#3d5ee1]/90 text-white text-xs">
                                                {loading ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving...</> : "Save Changes"}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={handleCancelEdit} disabled={loading} className="gap-1 text-xs">
                                                <X className="h-3.5 w-3.5" /> Cancel
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                <div className="p-6">
                                    {!editing ? (
                                        /* ── VIEW MODE ──────────────────────── */
                                        <div className="space-y-7">
                                            {/* Photo row */}
                                            {photoUrl && (
                                                <div className="flex items-center gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
                                                    <img src={photoUrl} alt="Student" className="h-16 w-16 rounded-xl object-cover ring-4 ring-slate-100 dark:ring-slate-700 shadow-sm" />
                                                    <div>
                                                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Profile Photo</p>
                                                        <p className="text-xs text-slate-500">Photo on file</p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Personal */}
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Personal Information</p>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                                                    <InfoField label="Full Name" value={studentData?.name} />
                                                    <InfoField label="Date of Birth" value={formatDate(studentData?.dob || studentData?.date_of_birth)} />
                                                    <InfoField label="Gender" value={studentData?.gender || studentData?.comprehensive_details?.basic?.gender} />
                                                    <InfoField label="Aadhar Number" value={studentData?.aadhar || studentData?.comprehensive_details?.basic?.aadhar} />
                                                    <InfoField label="Standard / Grade" value={studentData?.school_standard || studentData?.hifz_standard || studentData?.madrassa_standard} />
                                                    <InfoField label="Batch Year" value={studentData?.batch_year} />
                                                </div>
                                            </div>

                                            {/* Address */}
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Address</p>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                                                    <InfoField label="Address Line" value={studentData?.address_line || studentData?.address} />
                                                    <InfoField label="Place" value={studentData?.comprehensive_details?.basic?.place} />
                                                    <InfoField label="Local Body" value={studentData?.comprehensive_details?.basic?.local_body} />
                                                    <InfoField label="Pincode" value={studentData?.comprehensive_details?.basic?.pincode} />
                                                    <InfoField label="Nationality" value={studentData?.comprehensive_details?.basic?.nationality} />
                                                    <InfoField label="Country" value={studentData?.comprehensive_details?.basic?.country} />
                                                    <InfoField label="State" value={studentData?.comprehensive_details?.basic?.state} />
                                                    <InfoField label="District" value={studentData?.comprehensive_details?.basic?.district} />
                                                </div>
                                            </div>

                                            {/* Other */}
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Other Details</p>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                                                    <InfoField label="Identification Mark" value={studentData?.comprehensive_details?.basic?.id_mark} />
                                                    <InfoField label="Father's Name" value={studentData?.father_name || studentData?.parent_name} />
                                                    <InfoField label="Parent Email" value={studentData?.email} />
                                                    <InfoField label="Assigned Mentor" value={mentorName || (studentData?.assigned_usthad_id ? "—" : "Unassigned")} />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        /* ── EDIT MODE ──────────────────────── */
                                        <Form {...form}>
                                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-7">

                                                {/* Photo */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Student Photo</p>
                                                    <div className="flex items-center gap-4">
                                                        {photoUrl && <img src={photoUrl} alt="Preview" className="h-14 w-14 rounded-xl object-cover ring-2 ring-slate-200 shadow-sm" />}
                                                        <div className="flex-1">
                                                            <Input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={photoUploading} />
                                                            {photoUploading && <p className="text-xs text-slate-400 mt-1">Uploading...</p>}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Personal Info */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Personal Information</p>
                                                    <div className="space-y-4">
                                                        <FormField control={form.control} name="name" render={({ field }) => (
                                                            <FormItem><FormLabel>Full Name</FormLabel>
                                                                <FormControl><Input {...field} /></FormControl>
                                                                <FormMessage /></FormItem>
                                                        )} />
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <FormField control={form.control} name="dob" render={({ field }) => (
                                                                <FormItem><FormLabel>Date of Birth</FormLabel>
                                                                    <FormControl><Input type="date" {...field} /></FormControl>
                                                                    <FormMessage /></FormItem>
                                                            )} />
                                                            <FormField control={form.control} name="standard" render={({ field }) => (
                                                                <FormItem><FormLabel>Standard / Grade</FormLabel>
                                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                                        <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                                                                        <SelectContent>
                                                                            <SelectItem value="Hifz">Hifz Only</SelectItem>
                                                                            <SelectItem value="5th">5th Std</SelectItem>
                                                                            <SelectItem value="6th">6th Std</SelectItem>
                                                                            <SelectItem value="7th">7th Std</SelectItem>
                                                                            <SelectItem value="8th">8th Std</SelectItem>
                                                                            <SelectItem value="9th">9th Std</SelectItem>
                                                                            <SelectItem value="10th">10th Std</SelectItem>
                                                                            <SelectItem value="Plus One">+1 (Plus One)</SelectItem>
                                                                            <SelectItem value="Plus Two">+2 (Plus Two)</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <FormMessage /></FormItem>
                                                            )} />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <FormField control={form.control} name="gender" render={({ field }) => (
                                                                <FormItem><FormLabel>Gender</FormLabel>
                                                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                                                        <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                                                                        <SelectContent>
                                                                            <SelectItem value="Male">Male</SelectItem>
                                                                            <SelectItem value="Female">Female</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <FormMessage /></FormItem>
                                                            )} />
                                                            <FormField control={form.control} name="aadhar" render={({ field }) => (
                                                                <FormItem><FormLabel>Aadhar Number</FormLabel>
                                                                    <FormControl><Input placeholder="xxxx xxxx xxxx" {...field} /></FormControl>
                                                                    <FormMessage /></FormItem>
                                                            )} />
                                                        </div>
                                                        <FormField control={form.control} name="batch_year" render={({ field }) => (
                                                            <FormItem><FormLabel>Batch Year</FormLabel>
                                                                <FormControl><Input placeholder="e.g. 2023" {...field} /></FormControl>
                                                                <FormMessage /></FormItem>
                                                        )} />
                                                    </div>
                                                </div>

                                                {/* Address */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Address</p>
                                                    <div className="space-y-4">
                                                        <FormField control={form.control} name="address" render={({ field }) => (
                                                            <FormItem><FormLabel>Address Line</FormLabel>
                                                                <FormControl><Input placeholder="House name/number" {...field} /></FormControl>
                                                                <FormMessage /></FormItem>
                                                        )} />
                                                        <div className="grid grid-cols-3 gap-4">
                                                            <FormField control={form.control} name="place" render={({ field }) => (
                                                                <FormItem><FormLabel>Place</FormLabel>
                                                                    <FormControl><Input placeholder="City/Town" {...field} /></FormControl>
                                                                    <FormMessage /></FormItem>
                                                            )} />
                                                            <FormField control={form.control} name="local_body" render={({ field }) => (
                                                                <FormItem><FormLabel>Local Body</FormLabel>
                                                                    <FormControl><Input placeholder="Panchayat/Municipality" {...field} /></FormControl>
                                                                    <FormMessage /></FormItem>
                                                            )} />
                                                            <FormField control={form.control} name="pincode" render={({ field }) => (
                                                                <FormItem><FormLabel>Pincode</FormLabel>
                                                                    <FormControl><Input placeholder="671123" {...field} /></FormControl>
                                                                    <FormMessage /></FormItem>
                                                            )} />
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-4">
                                                            <FormField control={form.control} name="nationality" render={({ field }) => (
                                                                <FormItem><FormLabel>Nationality</FormLabel>
                                                                    <Select onValueChange={field.onChange} value={field.value || "Indian"}>
                                                                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                                        <SelectContent>
                                                                            <SelectItem value="Indian">Indian</SelectItem>
                                                                            <SelectItem value="Other">Other</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <FormMessage /></FormItem>
                                                            )} />
                                                            {watchedNationality === "Other" && (
                                                                <FormField control={form.control} name="country" render={({ field }) => (
                                                                    <FormItem><FormLabel>Country</FormLabel>
                                                                        <FormControl><Input placeholder="E.g., UAE" {...field} /></FormControl>
                                                                        <FormMessage /></FormItem>
                                                                )} />
                                                            )}
                                                            <FormField control={form.control} name="state" render={({ field }) => (
                                                                <FormItem><FormLabel>State</FormLabel>
                                                                    {isIndian ? (
                                                                        <Select onValueChange={field.onChange} value={field.value || ""}>
                                                                            <FormControl><SelectTrigger><SelectValue placeholder="Select State" /></SelectTrigger></FormControl>
                                                                            <SelectContent className="max-h-60">
                                                                                {INDIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    ) : (
                                                                        <FormControl><Input placeholder="State / Province" {...field} /></FormControl>
                                                                    )}
                                                                    <FormMessage /></FormItem>
                                                            )} />
                                                            <FormField control={form.control} name="district" render={({ field }) => (
                                                                <FormItem><FormLabel>District</FormLabel>
                                                                    {isIndian && watchedState && DISTRICTS_BY_STATE[watchedState] ? (
                                                                        <Select onValueChange={field.onChange} value={field.value || ""}>
                                                                            <FormControl><SelectTrigger><SelectValue placeholder="Select District" /></SelectTrigger></FormControl>
                                                                            <SelectContent className="max-h-60">
                                                                                {DISTRICTS_BY_STATE[watchedState].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    ) : (
                                                                        <FormControl><Input placeholder="E.g., Kasaragod" {...field} /></FormControl>
                                                                    )}
                                                                    <FormMessage /></FormItem>
                                                            )} />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Other Details */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Other Details</p>
                                                    <div className="space-y-4">
                                                        <FormField control={form.control} name="id_mark" render={({ field }) => (
                                                            <FormItem><FormLabel>Identification Mark</FormLabel>
                                                                <FormControl><Input placeholder="E.g., Mole on left face" {...field} /></FormControl>
                                                                <FormMessage /></FormItem>
                                                        )} />
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <FormField control={form.control} name="father_name" render={({ field }) => (
                                                                <FormItem><FormLabel>Father's Name</FormLabel>
                                                                    <FormControl><Input {...field} /></FormControl>
                                                                    <FormMessage /></FormItem>
                                                            )} />
                                                            <FormField control={form.control} name="email" render={({ field }) => (
                                                                <FormItem><FormLabel>Parent Email</FormLabel>
                                                                    <FormControl><Input type="email" placeholder="parent@example.com" {...field} /></FormControl>
                                                                    <FormMessage /></FormItem>
                                                            )} />
                                                        </div>
                                                        <FormField control={form.control} name="assigned_usthad_id" render={({ field }) => (
                                                            <FormItem><FormLabel>Assign Mentor</FormLabel>
                                                                <Select onValueChange={field.onChange} value={field.value || "unassigned"}>
                                                                    <FormControl><SelectTrigger><SelectValue placeholder="Select Mentor" /></SelectTrigger></FormControl>
                                                                    <SelectContent>
                                                                        <SelectItem value="unassigned">-- Unassigned --</SelectItem>
                                                                        {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage /></FormItem>
                                                        )} />
                                                    </div>
                                                </div>

                                                {/* Action buttons */}
                                                <div className="flex gap-3 pt-1">
                                                    <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                        Save Changes
                                                    </Button>
                                                    <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={loading}>
                                                        <X className="mr-2 h-4 w-4" /> Cancel
                                                    </Button>
                                                </div>
                                            </form>
                                        </Form>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        {/* ── ADMISSION TAB ──────────────────────── */}
                        <TabsContent value="admission" className="mt-0">
                            <AdmissionDetailsTab studentId={id} initialData={studentData?.comprehensive_details?.admission} />
                        </TabsContent>

                        {/* ── FAMILY TAB ─────────────────────────── */}
                        <TabsContent value="family" className="mt-0">
                            <Card className="shadow-sm border border-slate-200 dark:border-[#2a3348] bg-white dark:bg-[#1e2538]">
                                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-[#2a3348]">
                                    <CardTitle className="text-sm">Family Info</CardTitle>
                                    <Button variant="outline" size="sm" className="text-xs">Update</Button>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="text-center py-8 text-slate-400 bg-slate-50 dark:bg-slate-900/30 rounded-lg text-sm">
                                        Family details coming soon.
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* ── RELIGIOUS TAB ──────────────────────── */}
                        <TabsContent value="religious" className="mt-0">
                            <ReligiousEducationTab studentId={id} initialData={studentData?.comprehensive_details?.religious} />
                        </TabsContent>

                        {/* ── PLACEHOLDER TABS ───────────────────── */}
                        {['academic', 'languages', 'achievements', 'sulook', 'skills', 'contributions'].map(tab => (
                            <TabsContent key={tab} value={tab} className="mt-0">
                                <Card className="shadow-sm border border-slate-200 dark:border-[#2a3348] bg-white dark:bg-[#1e2538]">
                                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-[#2a3348]">
                                        <CardTitle className="text-sm capitalize">{tab} Info</CardTitle>
                                        <Button variant="outline" size="sm" className="text-xs">Update</Button>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                        <div className="text-center py-8 text-slate-400 bg-slate-50 dark:bg-slate-900/30 rounded-lg text-sm">
                                            {tab.charAt(0).toUpperCase() + tab.slice(1)} data coming soon.
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        ))}

                        {/* ── PROFESSION TAB ─────────────────────── */}
                        <TabsContent value="profession" className="mt-0">
                            <Card className="shadow-sm border border-slate-200 dark:border-[#2a3348] bg-white dark:bg-[#1e2538]">
                                <CardContent className="pt-6">
                                    <div className="flex flex-col items-center justify-center py-14 text-center">
                                        <div className="text-4xl mb-4">🏢</div>
                                        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">Alumni Access Only</h3>
                                        <p className="text-sm text-slate-400 max-w-xs mt-1">This section is available exclusively for alumni users.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* ── HIFZ HISTORY TAB ───────────────────── */}
                        <TabsContent value="hifz" className="mt-0">
                            <div className="space-y-4">
                                {/* Weekly/Monthly progress charts and stats from ProgressTab */}
                                {studentData && (
                                    <ProgressTab student={{ ...studentData, adm_no: id }} />
                                )}

                                {/* Raw log table */}
                                <Card className="shadow-sm border border-slate-200 dark:border-[#2a3348] bg-white dark:bg-[#1e2538]">
                                    <CardHeader className="border-b border-slate-100 dark:border-[#2a3348]">
                                        <CardTitle className="text-sm">Hifz Entry Log</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        {hifzLogs.length === 0 ? (
                                            <div className="p-8 text-center text-sm text-slate-400">No records found.</div>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
                                                        <tr>
                                                            {['Date', 'Session', 'Mode', 'Task', 'Rating', 'Mentor'].map(h => (
                                                                <th key={h} className="p-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                        {hifzLogs.map((log) => (
                                                            <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors">
                                                                <td className="p-3 text-slate-600 dark:text-slate-300 text-xs">{log.entry_date}</td>
                                                                <td className="p-3 text-slate-600 dark:text-slate-300 text-xs">{log.session_type}</td>
                                                                <td className="p-3">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                                                        log.mode === 'New Verses' ? 'bg-blue-100 text-blue-700' :
                                                                        log.mode === 'Recent Revision' ? 'bg-orange-100 text-orange-700' :
                                                                        'bg-green-100 text-green-700'
                                                                    }`}>{log.mode}</span>
                                                                </td>
                                                                <td className="p-3 text-slate-600 dark:text-slate-300 text-xs">
                                                                    {log.surah_name ? <>{log.surah_name} v.{log.start_v}–{log.end_v}</>
                                                                    : log.start_page ? <>Pp {log.start_page}–{log.end_page}</>
                                                                    : log.juz_number ? <>Juz {log.juz_number} ({log.juz_portion})</>
                                                                    : '—'}
                                                                </td>
                                                                <td className="p-3 text-xs">
                                                                    <span className="font-semibold text-slate-700 dark:text-slate-300">{log.rating}</span>
                                                                    <span className="text-slate-400">/5</span>
                                                                </td>
                                                                <td className="p-3 text-slate-400 text-xs">{log.staff?.name || "—"}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                    </Tabs>
                </div>
            </div>
        </div>
    )
}
