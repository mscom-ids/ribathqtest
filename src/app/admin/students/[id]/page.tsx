"use client"

import React, { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Loader2, Pencil, X, AlertCircle, CheckCircle2, User, BookOpen, FileText, Users, BookMarked, GraduationCap, Globe, Trophy, Heart, Lightbulb, Gift, Briefcase } from "lucide-react"

import { PhoneInput, validatePhone } from "@/components/ui/phone-input"
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
    hifz_mentor_id: z.string().optional(),
    school_mentor_id: z.string().optional(),
    madrasa_mentor_id: z.string().optional(),
    local_body: z.string().optional(),
    pincode: z.string().optional(),
    post: z.string().optional(),
    id_mark: z.string().optional(),
    district: z.string().optional(),
    nationality: z.string().optional(),
    place: z.string().optional(),
    state: z.string().optional(),
    gender: z.string().optional(),
    aadhar: z.string().optional(),
    phone_number: z.string().optional().refine(
        (v) => validatePhone(v) === true,
        { message: "Phone must be 8–15 digits" }
    ),
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

/** Format a stored E.164 number for display: "+919876543210" → "+91 9876543210" */
function formatPhone(phone: string | null | undefined): string {
    if (!phone) return "—"
    const cleaned = phone.startsWith("+") ? phone : "+" + phone
    // Match country code (1-3 digits) + subscriber number
    const match = cleaned.match(/^(\+\d{1,3})(\d+)$/)
    if (match) return `${match[1]} ${match[2]}`
    return cleaned
}

/** Left-panel label-value row — matches PreSkool reference */
function InfoRow({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex items-center justify-between gap-4 py-3 min-h-[44px] border-b border-slate-100 dark:border-slate-700/50 last:border-0">
            <span className="text-[14px] md:text-[13px] text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
            <span className="text-[15px] md:text-[13px] font-semibold text-slate-800 dark:text-slate-200 text-right truncate">{value || "—"}</span>
        </div>
    )
}

/** Right-panel section display field */
function InfoField({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex flex-col space-y-1 py-1">
            <p className="text-[13px] md:text-[10px] text-slate-500 md:text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
            <p className="text-[15px] md:text-sm font-medium text-slate-800 dark:text-slate-200">{value || "—"}</p>
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
    const [pincodeLoading, setPincodeLoading] = useState(false)
    const [pincodeError, setPincodeError] = useState<string | null>(null)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "", dob: "", address: "", father_name: "", email: "",
            batch_year: "", standard: "",
            hifz_mentor_id: "unassigned",
            school_mentor_id: "unassigned",
            madrasa_mentor_id: "unassigned",
            local_body: "", pincode: "", post: "", id_mark: "", district: "",
            nationality: "Indian", place: "", state: "",
            gender: "Male", aadhar: "", phone_number: ""
        },
    })

    const watchedNationality = form.watch("nationality")
    const watchedState = form.watch("state")
    const isIndian = watchedNationality?.toLowerCase() === "indian" || watchedNationality?.toLowerCase() === "india"

    // ── Pincode auto-fill (India Post API) ────────────────────
    async function handlePincodeChange(pincode: string) {
        form.setValue("pincode", pincode)
        if (!isIndian || pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
            if (pincode.length === 0) setPincodeError(null)
            return
        }
        setPincodeLoading(true)
        setPincodeError(null)
        try {
            const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`)
            const data = await res.json()
            if (data[0]?.Status === "Success" && data[0]?.PostOffice?.length > 0) {
                const offices = data[0].PostOffice
                // Find first entry with both District and State filled
                const validOffice = offices.find((o: any) => o.District && o.District !== "NA" && o.State && o.State !== "NA") || offices[0]
                form.setValue("post", validOffice?.Name || "")
                form.setValue("district", validOffice?.District || validOffice?.Division || "")
                form.setValue("state", validOffice?.State || "")
                const block = validOffice?.Block && validOffice.Block !== "NA" ? validOffice.Block : validOffice?.Region && validOffice.Region !== "NA" ? validOffice.Region : ""
                if (block) form.setValue("place", block)
                setPincodeError(null)
            } else {
                setPincodeError("Invalid pincode")
            }
        } catch {
            setPincodeError("Failed to fetch pincode data")
        } finally {
            setPincodeLoading(false)
        }
    }

    // Helper for safe date formatting from DB legacy values
    const safeFormatDateForInput = (d: any) => {
        if (!d || d === "" || d === "0000-00-00") return "";
        try {
            const parsed = new Date(d);
            if (isNaN(parsed.getTime())) return "";
            return parsed.toISOString().split('T')[0];
        } catch {
            return "";
        }
    }

    // ── Photo upload ──────────────────────────────────────────
    async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (!e.target.files?.length) return
        setPhotoUploading(true)
        const fd = new FormData()
        fd.append('avatar', e.target.files[0])
        try {
            const res = await api.post('/upload/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            if (res.data.success) {
                // filePath is now a full Supabase public URL — use it directly
                setPhotoUrl(res.data.filePath)
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
                        dob: safeFormatDateForInput(s.dob || s.date_of_birth),
                        address: s.address_line || s.address || "",
                        father_name: s.father_name || s.parent_name || "",
                        email: s.email || "",
                        batch_year: s.batch_year || "",
                        standard: s.standard || s.school_standard || s.hifz_standard || s.madrassa_standard || "",
                        hifz_mentor_id: s.hifz_mentor_id || "unassigned",
                        school_mentor_id: s.school_mentor_id || "unassigned",
                        madrasa_mentor_id: s.madrasa_mentor_id || "unassigned",
                        local_body: s.local_body || s.comprehensive_details?.basic?.local_body || "",
                        pincode: s.pincode || s.comprehensive_details?.basic?.pincode || "",
                        post: s.post || s.comprehensive_details?.basic?.post || "",
                        id_mark: s.id_mark || s.comprehensive_details?.basic?.id_mark || "",
                        district: s.district || s.comprehensive_details?.basic?.district || "",
                        nationality: s.nationality || s.comprehensive_details?.basic?.nationality || "Indian",
                        place: s.place || s.comprehensive_details?.basic?.place || "",
                        state: s.state || s.comprehensive_details?.basic?.state || "",
                        gender: s.gender || s.comprehensive_details?.basic?.gender || "Male",
                        aadhar: s.aadhar || s.comprehensive_details?.basic?.aadhar || "",
                        phone_number: s.phone_number || ""
                    })
                } else {
                    setError("Student record not found.")
                    setFetching(false)
                    return
                }
            } catch (err: any) {
                console.error("Failed to load student details:", err)
                setError("Unable to process student data. Please ensure the backend is running and data is valid.")
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
            hifz_mentor_id: values.hifz_mentor_id === "unassigned" ? null : (values.hifz_mentor_id || null),
            school_mentor_id: values.school_mentor_id === "unassigned" ? null : (values.school_mentor_id || null),
            madrasa_mentor_id: values.madrasa_mentor_id === "unassigned" ? null : (values.madrasa_mentor_id || null),
            photo_url: photoUrl,
            gender: values.gender || null,
            nationality: values.nationality || null,
            pincode: values.pincode || null,
            post: values.post || null,
            district: values.district || null,
            state: values.state || null,
            place: values.place || null,
            local_body: values.local_body || null,
            aadhar: values.aadhar || null,
            id_mark: values.id_mark || null,
            phone_number: values.phone_number || null,
            comprehensive_details: {
                basic: {
                    local_body: values.local_body, pincode: values.pincode,
                    post: values.post, id_mark: values.id_mark, district: values.district,
                    nationality: values.nationality,
                    place: values.place, state: values.state,
                    gender: values.gender, aadhar: values.aadhar
                }
            }
        }
        try {
            const res = await api.put(`/students/${id}`, updates)
            if (res.data.success) {
                const hm = values.hifz_mentor_id === "unassigned" ? null : values.hifz_mentor_id
                const sm = values.school_mentor_id === "unassigned" ? null : values.school_mentor_id
                const mm = values.madrasa_mentor_id === "unassigned" ? null : values.madrasa_mentor_id
                setStudentData((prev: any) => ({
                    ...prev, name: values.name, dob: values.dob,
                    address: values.address, father_name: values.father_name,
                    email: values.email, batch_year: values.batch_year,
                    standard: values.standard, gender: values.gender, aadhar: values.aadhar,
                    nationality: values.nationality, pincode: values.pincode, post: values.post,
                    district: values.district, state: values.state, place: values.place,
                    local_body: values.local_body, id_mark: values.id_mark, photo_url: photoUrl,
                    phone_number: values.phone_number,
                    hifz_mentor_id: hm, school_mentor_id: sm, madrasa_mentor_id: mm,
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
            name: s.name || "", dob: safeFormatDateForInput(s.dob || s.date_of_birth),
            address: s.address_line || s.address || "", father_name: s.father_name || s.parent_name || "",
            email: s.email || "", batch_year: s.batch_year || "",
            standard: s.standard || s.school_standard || s.hifz_standard || s.madrassa_standard || "",
            hifz_mentor_id: s.hifz_mentor_id || "unassigned",
            school_mentor_id: s.school_mentor_id || "unassigned",
            madrasa_mentor_id: s.madrasa_mentor_id || "unassigned",
            local_body: s.local_body || s.comprehensive_details?.basic?.local_body || "",
            pincode: s.pincode || s.comprehensive_details?.basic?.pincode || "",
            post: s.post || s.comprehensive_details?.basic?.post || "",
            id_mark: s.id_mark || s.comprehensive_details?.basic?.id_mark || "",
            district: s.district || s.comprehensive_details?.basic?.district || "",
            nationality: s.nationality || s.comprehensive_details?.basic?.nationality || "Indian",
            place: s.place || s.comprehensive_details?.basic?.place || "",
            state: s.state || s.comprehensive_details?.basic?.state || "",
            gender: s.gender || s.comprehensive_details?.basic?.gender || "Male",
            aadhar: s.aadhar || s.comprehensive_details?.basic?.aadhar || "",
            phone_number: s.phone_number || ""
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
    const hifzMentorName = staff.find(s => s.id === studentData?.hifz_mentor_id)?.name || null
    const schoolMentorName = staff.find(s => s.id === studentData?.school_mentor_id)?.name || null
    const madrasaMentorName = staff.find(s => s.id === studentData?.madrasa_mentor_id)?.name || null

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
            <div className="flex flex-col xl:flex-row gap-5 items-start">

                {/* ╔══════════════════════════════╗
                    ║      LEFT PANEL              ║
                    ╚══════════════════════════════╝ */}
                <div className="w-full xl:w-[300px] shrink-0">
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
                            <InfoRow label="Standard" value={studentData?.standard || studentData?.school_standard || studentData?.hifz_standard || studentData?.madrassa_standard} />
                            <InfoRow label="Batch Year" value={studentData?.batch_year} />
                            <InfoRow label="Nationality" value={studentData?.nationality || studentData?.comprehensive_details?.basic?.nationality} />
                            <InfoRow label="Father" value={studentData?.father_name || studentData?.parent_name} />
                            <InfoRow label="Hifz Mentor" value={hifzMentorName} />
                            <InfoRow label="School Mentor" value={schoolMentorName} />
                            <InfoRow label="Madrasa Mentor" value={madrasaMentorName} />
                            <InfoRow label="Aadhar" value={studentData?.aadhar || studentData?.comprehensive_details?.basic?.aadhar} />
                            <InfoRow label="Phone No" value={formatPhone(studentData?.phone_number)} />
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
                <div className="flex-1 w-full min-w-0">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

                        {/* ── Tab Navigation — plain buttons, 2-row grid ── */}
                        <div className="bg-white dark:bg-[#1e2538] rounded-xl shadow-sm mb-4 border border-slate-200 dark:border-[#2a3348] p-2">
                            <div className="flex flex-wrap gap-2">
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
                                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap border
                                                ${isActive
                                                    ? 'bg-[#e8ebfd] text-[#3d5ee1] border-[#3d5ee1]/30 shadow-sm'
                                                    : 'bg-white dark:bg-[#1e2538] border-slate-200 dark:border-[#2a3348] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 hover:text-slate-700 dark:hover:text-slate-200'
                                                }`}
                                        >
                                            <Icon className="h-[15px] w-[15px] shrink-0" />
                                            {tab.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* ── BASIC INFO TAB ──────────────────────── */}
                        <TabsContent value="basic" className="mt-0">
                            <div className="bg-transparent md:bg-white dark:bg-transparent md:dark:bg-[#1e2538] border-none md:border border-slate-200 dark:border-[#2a3348] rounded-none md:rounded-xl shadow-none md:shadow-sm overflow-hidden">

                                {/* Card header */}
                                <div className="px-4 md:px-6 py-4 mb-4 md:mb-0 bg-white md:bg-transparent rounded-xl md:rounded-none shadow-sm md:shadow-none border md:border-b border-slate-200 md:border-slate-100 dark:border-[#2a3348] flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-slate-800 dark:text-white">Basic Information</h3>
                                        <p className="text-xs text-slate-400 mt-0.5">Personal details and identification</p>
                                    </div>
                                    {!editing ? (
                                        <Button variant="outline" size="sm" onClick={() => setEditing(true)}
                                            className="w-full md:w-auto gap-1.5 text-sm md:text-xs bg-white border-[#3d5ee1] text-[#3d5ee1] hover:bg-[#e8ebfd] min-h-[44px] md:min-h-0">
                                            <Pencil className="h-4 w-4 md:h-3.5 md:w-3.5" /> Edit Profile
                                        </Button>
                                    ) : (
                                        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                                            <Button size="sm" onClick={() => form.handleSubmit(onSubmit)()} disabled={loading}
                                                className="w-full md:w-auto bg-[#3d5ee1] hover:bg-[#3d5ee1]/90 text-white text-sm md:text-xs min-h-[44px] md:min-h-0">
                                                {loading ? <><Loader2 className="mr-1.5 h-4 w-4 md:h-3.5 md:w-3.5 animate-spin" />Saving...</> : "Save Changes"}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={handleCancelEdit} disabled={loading} className="w-full md:w-auto gap-1 text-sm md:text-xs min-h-[44px] md:min-h-0">
                                                <X className="h-4 w-4 md:h-3.5 md:w-3.5" /> Cancel
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                <div className="p-0 md:p-6 pb-20">
                                    {!editing ? (
                                        /* ── VIEW MODE ──────────────────────── */
                                        <div className="space-y-4 md:space-y-7">
                                            {/* Photo row */}
                                            {photoUrl && (
                                                <div className="p-4 md:p-0 bg-white md:bg-transparent border md:border-0 border-slate-200 rounded-xl md:rounded-none shadow-sm md:shadow-none flex items-center gap-4 md:pb-5 md:border-b dark:border-slate-800">
                                                    <img src={photoUrl} alt="Student" className="h-16 w-16 rounded-xl object-cover ring-4 ring-slate-50 md:ring-slate-100 dark:ring-slate-700 shadow-sm" />
                                                    <div>
                                                        <p className="text-[12px] md:text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Profile Photo</p>
                                                        <p className="text-xs text-slate-500">Photo on file</p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Personal */}
                                            <div className="p-4 md:p-0 bg-white md:bg-transparent border md:border-0 border-slate-200 rounded-xl md:rounded-none shadow-sm md:shadow-none">
                                                <p className="text-[12px] md:text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Personal Information</p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-6">
                                                    <InfoField label="Full Name" value={studentData?.name} />
                                                    <InfoField label="Date of Birth" value={formatDate(studentData?.dob || studentData?.date_of_birth)} />
                                                    <InfoField label="Gender" value={studentData?.gender || studentData?.comprehensive_details?.basic?.gender} />
                                                    <InfoField label="Aadhar Number" value={studentData?.aadhar || studentData?.comprehensive_details?.basic?.aadhar} />
                                                    <InfoField label="Standard / Grade" value={studentData?.standard || studentData?.school_standard || studentData?.hifz_standard || studentData?.madrassa_standard} />
                                                    <InfoField label="Batch Year" value={studentData?.batch_year} />
                                                </div>
                                            </div>

                                            {/* Address */}
                                            <div className="p-4 md:p-0 bg-white md:bg-transparent border md:border-0 border-slate-200 rounded-xl md:rounded-none shadow-sm md:shadow-none">
                                                <p className="text-[12px] md:text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Address</p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-6">
                                                    <InfoField label="Address Line" value={studentData?.address_line || studentData?.address} />
                                                    <InfoField label="Place" value={studentData?.place || studentData?.comprehensive_details?.basic?.place} />
                                                    <InfoField label="Local Body" value={studentData?.local_body || studentData?.comprehensive_details?.basic?.local_body} />
                                                    <InfoField label="Pincode" value={studentData?.pincode || studentData?.comprehensive_details?.basic?.pincode} />
                                                    <InfoField label="Post Office" value={studentData?.post || studentData?.comprehensive_details?.basic?.post} />
                                                    <InfoField label="Nationality" value={studentData?.nationality || studentData?.comprehensive_details?.basic?.nationality} />
                                                    <InfoField label="State" value={studentData?.state || studentData?.comprehensive_details?.basic?.state} />
                                                    <InfoField label="District" value={studentData?.district || studentData?.comprehensive_details?.basic?.district} />
                                                </div>
                                            </div>

                                            {/* Other */}
                                            <div className="p-4 md:p-0 bg-white md:bg-transparent border md:border-0 border-slate-200 rounded-xl md:rounded-none shadow-sm md:shadow-none">
                                                <p className="text-[12px] md:text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Other Details</p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-6">
                                                    <InfoField label="Identification Mark" value={studentData?.id_mark || studentData?.comprehensive_details?.basic?.id_mark} />
                                                    <InfoField label="Father's Name" value={studentData?.father_name || studentData?.parent_name} />
                                                    <InfoField label="Parent Email" value={studentData?.email} />
                                                    <InfoField label="Phone Number" value={formatPhone(studentData?.phone_number)} />
                                                </div>
                                            </div>

                                            {/* Mentor Assignments */}
                                            <div className="p-4 md:p-0 bg-white md:bg-transparent border md:border-0 border-slate-200 rounded-xl md:rounded-none shadow-sm md:shadow-none">
                                                <p className="text-[12px] md:text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Mentor Assignments</p>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-y-4 gap-x-6">
                                                    <InfoField label="Hifz Mentor" value={hifzMentorName || "Unassigned"} />
                                                    <InfoField label="School Mentor" value={schoolMentorName || "Unassigned"} />
                                                    <InfoField label="Madrasa Mentor" value={madrasaMentorName || "Unassigned"} />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        /* ── EDIT MODE ──────────────────────── */
                                        <Form {...form}>
                                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 md:space-y-7">

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
                                                                <FormItem>
                                                                    <FormLabel>Pincode {isIndian && pincodeLoading && <span className="text-xs text-slate-400 font-normal ml-1">fetching...</span>}</FormLabel>
                                                                    <FormControl>
                                                                        <Input
                                                                            placeholder="671123"
                                                                            {...field}
                                                                            onChange={e => handlePincodeChange(e.target.value)}
                                                                            maxLength={6}
                                                                        />
                                                                    </FormControl>
                                                                    {pincodeError && <p className="text-xs text-red-500 mt-1">{pincodeError}</p>}
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )} />
                                                        </div>
                                                        {/* Post Office + Nationality row */}
                                                        <div className="grid grid-cols-3 gap-4">
                                                            <FormField control={form.control} name="post" render={({ field }) => (
                                                                <FormItem><FormLabel>Post Office</FormLabel>
                                                                    <FormControl><Input placeholder="Auto-filled from pincode" {...field} /></FormControl>
                                                                    <FormMessage /></FormItem>
                                                            )} />
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
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-4">
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
                                                        <FormField control={form.control} name="phone_number" render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Phone Number</FormLabel>
                                                                <PhoneInput
                                                                    value={field.value ?? ""}
                                                                    onChange={field.onChange}
                                                                    disabled={loading}
                                                                />
                                                                <FormMessage />
                                                            </FormItem>
                                                        )} />
                                                    </div>
                                                </div>

                                                {/* Mentor Assignments */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Mentor Assignments</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                                                        <FormField control={form.control} name="hifz_mentor_id" render={({ field }) => (
                                                            <FormItem className="min-w-0 w-full"><FormLabel>Hifz Mentor</FormLabel>
                                                                <Select onValueChange={field.onChange} value={field.value || "unassigned"}>
                                                                    <FormControl>
                                                                        <SelectTrigger className="w-full min-w-0 overflow-hidden">
                                                                            <SelectValue placeholder="Select Mentor" className="truncate" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        <SelectItem value="unassigned">-- Unassigned --</SelectItem>
                                                                        {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage /></FormItem>
                                                        )} />
                                                        <FormField control={form.control} name="school_mentor_id" render={({ field }) => (
                                                            <FormItem className="min-w-0 w-full"><FormLabel>School Mentor</FormLabel>
                                                                <Select onValueChange={field.onChange} value={field.value || "unassigned"}>
                                                                    <FormControl>
                                                                        <SelectTrigger className="w-full min-w-0 overflow-hidden">
                                                                            <SelectValue placeholder="Select Mentor" className="truncate" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        <SelectItem value="unassigned">-- Unassigned --</SelectItem>
                                                                        {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage /></FormItem>
                                                        )} />
                                                        <FormField control={form.control} name="madrasa_mentor_id" render={({ field }) => (
                                                            <FormItem className="min-w-0 w-full"><FormLabel>Madrasa Mentor</FormLabel>
                                                                <Select onValueChange={field.onChange} value={field.value || "unassigned"}>
                                                                    <FormControl>
                                                                        <SelectTrigger className="w-full min-w-0 overflow-hidden">
                                                                            <SelectValue placeholder="Select Mentor" className="truncate" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
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
