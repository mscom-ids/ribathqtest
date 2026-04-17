"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
    ArrowLeft, User, Users, BarChart2, Phone, Mail, MapPin,
    BookOpen, Loader2, AlertCircle, Eye, GraduationCap,
    Plus, Search, Trash2, X, CheckSquare, Square,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import api from "@/lib/api"
import { resolveBackendUrl } from "@/lib/utils"

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
type Staff = {
    id: string
    staff_id: string | null
    name: string
    email: string
    role: string
    phone: string | null
    photo_url: string | null
    address: string | null
    place: string | null
    phone_contacts: { number: string; relation: string }[]
    is_active?: boolean
    created_at?: string
}

type Student = {
    id: string
    adm_no: string
    name: string
    standard: string | null
    batch_year: string | null
    photo_url: string | null
    is_hifz: boolean
    is_school: boolean
    is_madrasa: boolean
}

type AllStudent = {
    adm_no: string
    name: string
    standard: string | null
    status: string
    hifz_mentor_id: string | null
    school_mentor_id: string | null
    madrasa_mentor_id: string | null
}

type HifzMonth = {
    month_year: string
    new_hifz_pages: number
    juz_revision_count: number
    monthly_attendance_days: number
}

type Section = "hifz" | "school" | "madrasa"

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function roleLabel(role: string) {
    const map: Record<string, string> = {
        usthad: "Mentor", principal: "Principal",
        vice_principal: "Vice Principal", staff: "Staff",
        admin: "Admin", controller: "Controller", teacher: "Teacher",
    }
    return map[role] || role
}

function formatDate(d?: string | null) {
    if (!d) return "—"
    try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) }
    catch { return d }
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex flex-col gap-0.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
            <p className="text-[13.5px] font-medium text-slate-800 dark:text-slate-200">{value || "—"}</p>
        </div>
    )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex justify-between items-center py-2 border-b border-slate-50 dark:border-slate-800 last-of-type:border-0">
            <span className="text-[13px] text-slate-500">{label}</span>
            <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">{value || "—"}</span>
        </div>
    )
}

const SECTIONS: Section[] = ["hifz", "school", "madrasa"]
const SECTION_LABEL: Record<Section, string> = { hifz: "Hifz", school: "School", madrasa: "Madrasa" }
const SECTION_STYLE: Record<Section, { pill: string; header: string; border: string }> = {
    hifz:    { pill: "bg-[#e8ebfd] text-[#3d5ee1]",   header: "text-[#3d5ee1]",   border: "border-[#3d5ee1]/20" },
    school:  { pill: "bg-emerald-50 text-emerald-700", header: "text-emerald-700", border: "border-emerald-200" },
    madrasa: { pill: "bg-amber-50 text-amber-700",     header: "text-amber-700",   border: "border-amber-200" },
}

// ────────────────────────────────────────────────────────────────────────────
// Section Student Table sub-component
// ────────────────────────────────────────────────────────────────────────────
function SectionTable({
    section, students, onRemove, removing,
}: {
    section: Section
    students: Student[]
    onRemove: (admNo: string, section: Section) => void
    removing: string | null
}) {
    const st = SECTION_STYLE[section]
    return (
        <div>
            {/* Section header */}
            <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${st.pill}`}>
                    {SECTION_LABEL[section]} Students
                </span>
                <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200">
                    {students.length}
                </Badge>
            </div>

            {students.length === 0 ? (
                <div className={`text-xs text-slate-400 italic px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/30 border ${st.border} mb-1`}>
                    No {SECTION_LABEL[section]} students assigned yet.
                </div>
            ) : (
                <div className={`overflow-x-auto rounded-xl border ${st.border} mb-1`}>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/40">
                                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-10">#</th>
                                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Adm No</th>
                                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Class</th>
                                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {students.map((s, idx) => (
                                <tr key={s.adm_no} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors">
                                    <td className="px-4 py-2.5 text-slate-400 text-xs">{idx + 1}</td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-2.5">
                                            <div className={`h-7 w-7 rounded-md flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden ${st.pill}`}>
                                                {s.photo_url
                                                    ? <img src={s.photo_url} alt={s.name} className="h-full w-full object-cover" />
                                                    : s.name.charAt(0)
                                                }
                                            </div>
                                            <span className="font-medium text-slate-800 dark:text-slate-200 text-[13px]">{s.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{s.adm_no}</td>
                                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 text-[13px]">{s.standard || "—"}</td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center justify-end gap-2">
                                            <Link href={`/admin/students/${s.adm_no}`}>
                                                <Button variant="outline" size="sm"
                                                    className={`h-7 text-xs border-[#3d5ee1]/20 text-[#3d5ee1] hover:bg-[#e8ebfd]`}>
                                                    <Eye className="h-3 w-3 mr-1" /> View
                                                </Button>
                                            </Link>
                                            <Button
                                                variant="ghost" size="sm"
                                                className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                disabled={removing === `${s.adm_no}-${section}`}
                                                onClick={() => onRemove(s.adm_no, section)}
                                            >
                                                {removing === `${s.adm_no}-${section}`
                                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                                    : <><Trash2 className="h-3 w-3 mr-1" />Remove</>
                                                }
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

// ────────────────────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────────────────────
export default function MentorDetailPage() {
    const params = useParams()
    const router = useRouter()
    const id = params?.id as string

    // ── Core data ────────────────────────────────────────────────
    const [staffData, setStaffData] = useState<Staff | null>(null)
    const [studentCount, setStudentCount] = useState(0)
    const [students, setStudents] = useState<Student[]>([])
    const [monthlyStats, setMonthlyStats] = useState<HifzMonth[]>([])
    const [fetching, setFetching] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // ── Tab & lazy-load state ────────────────────────────────────
    const [activeTab, setActiveTab] = useState("details")
    const [studentsLoaded, setStudentsLoaded] = useState(false)
    const [statsLoaded, setStatsLoaded] = useState(false)

    // ── Assign modal state ───────────────────────────────────────
    const [modalOpen, setModalOpen] = useState(false)
    const [assignSection, setAssignSection] = useState<Section>("hifz")
    const [allStudents, setAllStudents] = useState<AllStudent[]>([])
    const [allStudentsLoaded, setAllStudentsLoaded] = useState(false)
    const [studentSearch, setStudentSearch] = useState("")
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [assigning, setAssigning] = useState(false)
    const [removing, setRemoving] = useState<string | null>(null)

    // ── Load mentor profile ──────────────────────────────────────
    useEffect(() => {
        if (!id) return
        async function load() {
            try {
                const res = await api.get(`/staff/${id}`)
                if (res.data.success) {
                    setStaffData(res.data.staff)
                    setStudentCount(res.data.student_count ?? 0)
                } else { setError("Mentor not found.") }
            } catch { setError("Failed to load mentor details.") }
            finally { setFetching(false) }
        }
        load()
    }, [id])

    // ── Lazy-load assigned students ──────────────────────────────
    useEffect(() => {
        if (activeTab !== "students" || studentsLoaded) return
        loadStudents()
    }, [activeTab, studentsLoaded])

    async function loadStudents() {
        try {
            const res = await api.get(`/staff/${id}/students`)
            if (res.data.success) {
                setStudents(res.data.students || [])
                setStudentCount(res.data.students?.length ?? 0)
            }
        } catch { /* non-blocking */ }
        setStudentsLoaded(true)
    }

    // ── Lazy-load progress stats ─────────────────────────────────
    useEffect(() => {
        if (activeTab !== "progress" || statsLoaded) return
        async function loadStats() {
            try {
                const res = await api.get("/hifz/monthly-reports", { params: { staff_id: id, limit: 6 } })
                if (res.data.success) setMonthlyStats(res.data.reports || [])
            } catch { /* non-blocking */ }
            setStatsLoaded(true)
        }
        loadStats()
    }, [activeTab, statsLoaded])

    // ── Load ALL students (for modal) ────────────────────────────
    async function loadAllStudents() {
        if (allStudentsLoaded) return
        try {
            const res = await api.get("/students")
            if (res.data.success) setAllStudents(res.data.students || [])
        } catch { /* non-blocking */ }
        setAllStudentsLoaded(true)
    }

    const openModal = async () => {
        setAssignSection("hifz")
        setStudentSearch("")
        setSelectedIds(new Set())
        setModalOpen(true)
        await loadAllStudents()
    }

    // ── Filtered students for modal list ─────────────────────────
    const filteredModalStudents = useMemo(() => {
        const fieldMap: Record<Section, keyof AllStudent> = {
            hifz: "hifz_mentor_id", school: "school_mentor_id", madrasa: "madrasa_mentor_id",
        }
        const field = fieldMap[assignSection]
        return allStudents.filter(s => {
            const notAssigned = s[field] !== id  // show even if assigned to someone else — admin can reassign
            const matchSearch = !studentSearch || s.name.toLowerCase().includes(studentSearch.toLowerCase()) || s.adm_no.toLowerCase().includes(studentSearch.toLowerCase())
            return notAssigned && matchSearch
        })
    }, [allStudents, assignSection, studentSearch, id])

    // Already assigned in this section (to exclude checkmarks)
    const alreadyAssignedIds = useMemo(() => {
        return new Set(
            students
                .filter(s => s[`is_${assignSection}` as "is_hifz" | "is_school" | "is_madrasa"])
                .map(s => s.adm_no)
        )
    }, [students, assignSection])

    // ── Toggle student selection ─────────────────────────────────
    const toggleStudent = (admNo: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(admNo)) next.delete(admNo)
            else next.add(admNo)
            return next
        })
    }

    // ── Assign action ────────────────────────────────────────────
    const handleAssign = async () => {
        if (!selectedIds.size) return
        setAssigning(true)
        try {
            const res = await api.post(`/staff/${id}/assign`, {
                student_ids: Array.from(selectedIds),
                section: assignSection,
            })
            if (res.data.success) {
                setModalOpen(false)
                setStudentsLoaded(false)        // trigger re-fetch
                setAllStudentsLoaded(false)     // reset all students cache
                loadStudents()
            }
        } catch { /* swallow */ }
        setAssigning(false)
    }

    // ── Unassign action ──────────────────────────────────────────
    const handleRemove = async (admNo: string, section: Section) => {
        setRemoving(`${admNo}-${section}`)
        try {
            const res = await api.post(`/staff/${id}/unassign`, { student_id: admNo, section })
            if (res.data.success) {
                // Instant UI update — remove from state
                setStudents(prev => {
                    const updated = prev.map(s => {
                        if (s.adm_no !== admNo) return s
                        return {
                            ...s,
                            is_hifz:    section === "hifz"    ? false : s.is_hifz,
                            is_school:  section === "school"  ? false : s.is_school,
                            is_madrasa: section === "madrasa" ? false : s.is_madrasa,
                        }
                    }).filter(s => s.is_hifz || s.is_school || s.is_madrasa)
                    setStudentCount(updated.length)
                    return updated
                })
            }
        } catch { /* non-blocking */ }
        setRemoving(null)
    }

    // ── Select all visible ───────────────────────────────────────
    const selectAll = () => {
        const eligible = filteredModalStudents.filter(s => !alreadyAssignedIds.has(s.adm_no))
        setSelectedIds(new Set(eligible.map(s => s.adm_no)))
    }
    const clearAll = () => setSelectedIds(new Set())

    // ── Computed student groups ──────────────────────────────────
    const hifzStudents    = students.filter(s => s.is_hifz)
    const schoolStudents  = students.filter(s => s.is_school)
    const madrasaStudents = students.filter(s => s.is_madrasa)

    // ────────────────────────────────────────────────────────────────────────
    // Loading / Error states
    // ────────────────────────────────────────────────────────────────────────
    if (fetching) {
        return (
            <div className="flex flex-col items-center justify-center py-32">
                <div className="h-8 w-8 rounded-full border-2 border-[#3d5ee1] border-t-transparent animate-spin mb-4" />
                <p className="text-sm text-slate-500">Loading mentor details…</p>
            </div>
        )
    }

    if (error || !staffData) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#1e2538] rounded-2xl border border-red-100 shadow-sm text-center px-6 max-w-lg mx-auto mt-12">
                <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
                <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">Unable to Load Mentor</h2>
                <p className="text-sm text-slate-500 mb-6">{error}</p>
                <Button variant="outline" onClick={() => router.push("/admin/staff")}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Staff
                </Button>
            </div>
        )
    }

    const primaryPhone = staffData.phone_contacts?.find(c => c.number)?.number || staffData.phone || null

    const TABS = [
        { value: "details",  label: "Mentor Details",    icon: User },
        { value: "students", label: "Assigned Students", icon: Users },
        { value: "progress", label: "Progress",          icon: BarChart2 },
    ]

    // ────────────────────────────────────────────────────────────────────────
    // Render
    // ────────────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-4 pb-20">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 dark:text-white">Mentor Details</h1>
                    <p className="text-xs text-slate-400 mt-0.5">Dashboard / Staff / Mentor Details</p>
                </div>
                <Button variant="outline" onClick={() => router.push("/admin/staff")}
                    className="gap-2 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600">
                    <ArrowLeft className="h-4 w-4" /> Back to List
                </Button>
            </div>

            {/* Two-column layout */}
            <div className="flex flex-col xl:flex-row gap-5 items-start">

                {/* ── LEFT: Profile Card ── */}
                <div className="w-full xl:w-[280px] shrink-0">
                    <div className="bg-white dark:bg-[#1e2538] border border-slate-200 dark:border-[#2a3348] rounded-2xl shadow-sm">
                        {/* Avatar + name */}
                        <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center">
                            <div className="h-[88px] w-[88px] rounded-xl overflow-hidden bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-4xl font-bold text-white mb-4">
                                {staffData.photo_url ? (
                                    <img
                                        src={resolveBackendUrl(staffData.photo_url)}
                                        alt="Profile" className="h-full w-full object-cover"
                                    />
                                ) : (
                                    staffData.name.charAt(0).toUpperCase()
                                )}
                            </div>
                            <h2 className="font-bold text-slate-900 dark:text-white text-[15px] leading-snug tracking-tight">
                                {staffData.name}
                            </h2>
                            <span className="text-sm font-semibold text-[#3d5ee1] mt-0.5">
                                {staffData.staff_id || staffData.id.slice(0, 8)}
                            </span>
                            <Badge className={`mt-2 capitalize border-none text-xs ${["admin","principal","vice_principal","controller"].includes(staffData.role) ? "bg-amber-100 text-amber-700" : "bg-[#e8ebfd] text-[#3d5ee1]"}`}>
                                {roleLabel(staffData.role)}
                            </Badge>
                        </div>

                        {/* Quick stats */}
                        <div className="mx-5 border-t border-slate-100 dark:border-slate-700/50" />
                        <div className="px-6 py-4 grid grid-cols-2 gap-3">
                            <div className="flex flex-col items-center bg-slate-50 dark:bg-slate-800/40 rounded-xl py-3">
                                <span className="text-lg font-bold text-[#3d5ee1]">{studentCount}</span>
                                <span className="text-[10px] text-slate-500 mt-0.5">Students</span>
                            </div>
                            <div className="flex flex-col items-center bg-slate-50 dark:bg-slate-800/40 rounded-xl py-3">
                                <span className={`text-sm font-bold ${staffData.is_active === false ? "text-slate-400" : "text-emerald-600"}`}>
                                    {staffData.is_active === false ? "Archived" : "Active"}
                                </span>
                                <span className="text-[10px] text-slate-500 mt-0.5">Status</span>
                            </div>
                        </div>

                        {/* Info rows */}
                        <div className="mx-5 border-t border-slate-100 dark:border-slate-700/50" />
                        <div className="px-6 py-4">
                            <InfoRow label="Staff ID"  value={staffData.staff_id || staffData.id.slice(0, 8)} />
                            <InfoRow label="Role"      value={roleLabel(staffData.role)} />
                            <InfoRow label="Place"     value={staffData.place} />
                            <InfoRow label="Joined"    value={formatDate(staffData.created_at)} />
                        </div>

                        {/* Contact */}
                        <div className="mx-5 border-t border-slate-100 dark:border-slate-700/50" />
                        <div className="px-6 py-4 space-y-2">
                            {primaryPhone && (
                                <div className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300">
                                    <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                    {primaryPhone}
                                </div>
                            )}
                            {staffData.email && !staffData.email.includes("dummy-") && (
                                <div className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300 break-all">
                                    <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                    {staffData.email}
                                </div>
                            )}
                            {staffData.place && (
                                <div className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300">
                                    <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                    {staffData.place}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: Tab Panel ── */}
                <div className="flex-1 w-full min-w-0">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        {/* Tab nav — flex-wrap, no scroll */}
                        <div className="bg-white dark:bg-[#1e2538] rounded-xl shadow-sm mb-4 border border-slate-200 dark:border-[#2a3348] p-2">
                            <div className="flex flex-wrap gap-2">
                                {TABS.map(tab => {
                                    const Icon = tab.icon
                                    const active = activeTab === tab.value
                                    return (
                                        <button
                                            key={tab.value}
                                            onClick={() => setActiveTab(tab.value)}
                                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap border
                                                ${active
                                                    ? "bg-[#e8ebfd] text-[#3d5ee1] border-[#3d5ee1]/30 shadow-sm"
                                                    : "bg-white dark:bg-[#1e2538] border-slate-200 dark:border-[#2a3348] text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/40 hover:text-slate-700"
                                                }`}
                                        >
                                            <Icon className="h-[15px] w-[15px] shrink-0" />
                                            {tab.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* ── DETAILS TAB ─────────────── */}
                        <TabsContent value="details" className="mt-0 animate-in fade-in duration-200">
                            <div className="bg-white dark:bg-[#1e2538] border border-slate-200 dark:border-[#2a3348] rounded-xl shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-[#2a3348]">
                                    <h3 className="text-base font-semibold text-slate-800 dark:text-white">Profile Information</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Full mentor details and contact info</p>
                                </div>
                                <div className="p-6 space-y-6">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Personal Information</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-5 gap-x-6">
                                            <InfoField label="Full Name"  value={staffData.name} />
                                            <InfoField label="Staff ID"   value={staffData.staff_id || staffData.id.slice(0, 8)} />
                                            <InfoField label="Role"       value={roleLabel(staffData.role)} />
                                            <InfoField label="Place"      value={staffData.place} />
                                            <InfoField label="Address"    value={staffData.address} />
                                            <InfoField label="Joined"     value={formatDate(staffData.created_at)} />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Contact Details</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-5 gap-x-6">
                                            <InfoField label="Email"         value={staffData.email?.includes("dummy-") ? undefined : staffData.email} />
                                            <InfoField label="Primary Phone" value={primaryPhone} />
                                            {staffData.phone_contacts?.filter(c => c.number).map((c, i) => (
                                                <InfoField key={i} label={`Phone (${c.relation || "Other"})`} value={c.number} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        {/* ── ASSIGNED STUDENTS TAB ───── */}
                        <TabsContent value="students" className="mt-0 animate-in fade-in duration-200">
                            <div className="bg-white dark:bg-[#1e2538] border border-slate-200 dark:border-[#2a3348] rounded-xl shadow-sm overflow-hidden">
                                {/* Header */}
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-[#2a3348] flex items-center justify-between flex-wrap gap-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-slate-800 dark:text-white">Assigned Students</h3>
                                        <p className="text-xs text-slate-400 mt-0.5">Active students mentored by {staffData.name}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge className="bg-[#e8ebfd] text-[#3d5ee1] border-none">{studentCount} total</Badge>
                                        <Button
                                            size="sm"
                                            className="h-8 text-xs gap-1.5 bg-[#3d5ee1] hover:bg-[#2f4bcc] text-white shadow-sm"
                                            onClick={openModal}
                                        >
                                            <Plus className="h-3.5 w-3.5" /> Assign Students
                                        </Button>
                                    </div>
                                </div>

                                {!studentsLoaded ? (
                                    <div className="flex items-center justify-center py-16">
                                        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                                    </div>
                                ) : students.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-center">
                                        <GraduationCap className="h-10 w-10 text-slate-300 mb-3" />
                                        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No students assigned yet</p>
                                        <p className="text-xs text-slate-400 mt-1 mb-4">Click "Assign Students" to add students to this mentor.</p>
                                        <Button size="sm" className="gap-1.5 bg-[#3d5ee1] hover:bg-[#2f4bcc] text-white" onClick={openModal}>
                                            <Plus className="h-3.5 w-3.5" /> Assign Students
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="p-6 space-y-6">
                                        <SectionTable section="hifz"    students={hifzStudents}    onRemove={handleRemove} removing={removing} />
                                        <SectionTable section="school"  students={schoolStudents}  onRemove={handleRemove} removing={removing} />
                                        <SectionTable section="madrasa" students={madrasaStudents} onRemove={handleRemove} removing={removing} />
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        {/* ── PROGRESS TAB ─────────────── */}
                        <TabsContent value="progress" className="mt-0 animate-in fade-in duration-200">
                            <div className="bg-white dark:bg-[#1e2538] border border-slate-200 dark:border-[#2a3348] rounded-xl shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-[#2a3348]">
                                    <h3 className="text-base font-semibold text-slate-800 dark:text-white">Progress Overview</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Hifz progress of assigned students (last 6 months)</p>
                                </div>

                                {!statsLoaded ? (
                                    <div className="flex items-center justify-center py-16">
                                        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                                    </div>
                                ) : (
                                    <div className="p-6 space-y-6">
                                        {/* Summary */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {[
                                                { label: "Total Students",    value: studentCount, color: "text-[#3d5ee1]", bg: "bg-[#e8ebfd]" },
                                                { label: "Hifz Pages (6m)",   value: monthlyStats.reduce((s, r) => s + (r.new_hifz_pages || 0), 0), color: "text-emerald-600", bg: "bg-emerald-50" },
                                                { label: "Juz Revised (6m)",  value: monthlyStats.reduce((s, r) => s + (r.juz_revision_count || 0), 0), color: "text-amber-600", bg: "bg-amber-50" },
                                                { label: "Attend. Days (6m)", value: monthlyStats.reduce((s, r) => s + (r.monthly_attendance_days || 0), 0), color: "text-purple-600", bg: "bg-purple-50" },
                                            ].map(stat => (
                                                <div key={stat.label} className={`${stat.bg} rounded-xl p-4`}>
                                                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                                                    <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Monthly breakdown */}
                                        {monthlyStats.length > 0 ? (
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Monthly Breakdown</p>
                                                <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="bg-slate-50 dark:bg-slate-800/50">
                                                                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase">Month</th>
                                                                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-[#3d5ee1] uppercase">Hifz Pages</th>
                                                                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-amber-600 uppercase">Juz Revised</th>
                                                                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-purple-600 uppercase">Attend.</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                            {monthlyStats.map(r => (
                                                                <tr key={r.month_year} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                                                    <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">{r.month_year}</td>
                                                                    <td className="px-4 py-2.5 text-right font-semibold text-[#3d5ee1]">{r.new_hifz_pages ?? 0}</td>
                                                                    <td className="px-4 py-2.5 text-right font-semibold text-amber-600">{r.juz_revision_count ?? 0}</td>
                                                                    <td className="px-4 py-2.5 text-right font-semibold text-purple-600">{r.monthly_attendance_days ?? 0}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                                <BookOpen className="h-10 w-10 text-slate-300 mb-3" />
                                                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No progress data yet</p>
                                                <p className="text-xs text-slate-400 mt-1">Hifz monthly reports will appear here once recorded.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* ══════════════════════════════════════════════
                ASSIGN STUDENTS MODAL
            ══════════════════════════════════════════════ */}
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-[#3d5ee1]" />
                            Assign Students to {staffData.name}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex flex-col gap-4 overflow-y-auto flex-1 pr-1">
                        {/* Section selector */}
                        <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Section</p>
                            <Select value={assignSection} onValueChange={v => { setAssignSection(v as Section); setSelectedIds(new Set()); setStudentSearch("") }}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="hifz">Hifz</SelectItem>
                                    <SelectItem value="school">School</SelectItem>
                                    <SelectItem value="madrasa">Madrasa</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Student multi-select */}
                        <div className="space-y-1.5 flex flex-col min-h-0">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    Select Students
                                    {selectedIds.size > 0 && (
                                        <span className="ml-2 text-[#3d5ee1] normal-case font-normal">({selectedIds.size} selected)</span>
                                    )}
                                </p>
                                <div className="flex gap-2">
                                    <button onClick={selectAll} className="text-[11px] text-[#3d5ee1] hover:underline">Select all</button>
                                    {selectedIds.size > 0 && <button onClick={clearAll} className="text-[11px] text-slate-400 hover:underline">Clear</button>}
                                </div>
                            </div>

                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                <Input
                                    placeholder="Search by name or admission no…"
                                    value={studentSearch}
                                    onChange={e => setStudentSearch(e.target.value)}
                                    className="pl-9 text-sm h-9"
                                />
                                {studentSearch && (
                                    <button onClick={() => setStudentSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Student list */}
                            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-y-auto" style={{ maxHeight: 280 }}>
                                {!allStudentsLoaded ? (
                                    <div className="flex items-center justify-center py-10">
                                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                    </div>
                                ) : filteredModalStudents.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-8 text-center">
                                        <Search className="h-7 w-7 text-slate-300 mb-2" />
                                        <p className="text-sm text-slate-500">No students found</p>
                                    </div>
                                ) : (
                                    filteredModalStudents.map(s => {
                                        const alreadyInSection = alreadyAssignedIds.has(s.adm_no)
                                        const isSelected = selectedIds.has(s.adm_no)
                                        return (
                                            <button
                                                key={s.adm_no}
                                                onClick={() => !alreadyInSection && toggleStudent(s.adm_no)}
                                                disabled={alreadyInSection}
                                                className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0 text-left transition-colors
                                                    ${alreadyInSection ? "opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/30"
                                                    : isSelected ? "bg-[#e8ebfd] dark:bg-[#1e2e6e]"
                                                    : "hover:bg-slate-50 dark:hover:bg-slate-800/30"}`}
                                            >
                                                {/* Checkbox visual */}
                                                <div className={`flex-shrink-0 h-4 w-4 rounded transition-colors flex items-center justify-center
                                                    ${isSelected ? "bg-[#3d5ee1]" : "border-2 border-slate-300 dark:border-slate-600"}`}>
                                                    {isSelected && <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-none stroke-white stroke-2"><polyline points="1,4 4,7 9,1" /></svg>}
                                                </div>
                                                {/* Avatar */}
                                                <div className="h-7 w-7 rounded-md bg-[#e8ebfd] text-[#3d5ee1] flex items-center justify-center text-xs font-bold shrink-0">
                                                    {s.name.charAt(0)}
                                                </div>
                                                {/* Name / class */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">{s.name}</p>
                                                    <p className="text-[11px] text-slate-400">{s.adm_no}{s.standard ? ` · ${s.standard}` : ""}</p>
                                                </div>
                                                {alreadyInSection && (
                                                    <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-none shrink-0">Assigned</Badge>
                                                )}
                                            </button>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleAssign}
                            disabled={selectedIds.size === 0 || assigning}
                            className="bg-[#3d5ee1] hover:bg-[#2f4bcc] text-white min-w-[110px]"
                        >
                            {assigning
                                ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Assigning…</>
                                : `Assign ${selectedIds.size > 0 ? `(${selectedIds.size})` : ""}`
                            }
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
