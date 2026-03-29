"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Search, Trash2, Users, Shield, KeyRound, Loader2, Pencil, Phone, RotateCcw, MapPin, Camera, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import api from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

type PhoneContact = {
    number: string
    relation: string
}

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
    phone_contacts: PhoneContact[]
    profile_id: string | null
    password_hash?: string | null
    is_active?: boolean
}

const RELATION_OPTIONS = ["Personal", "Home", "Father", "Mother", "Guardian", "Other"]

export default function StaffPage() {
    const [staff, setStaff] = useState<Staff[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [activeTab, setActiveTab] = useState<"active" | "archived">("active")
    const { toast } = useToast()

    // Create Login State
    const [loginDialogOpen, setLoginDialogOpen] = useState(false)
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null)
    const [newPassword, setNewPassword] = useState("")
    const [creatingLogin, setCreatingLogin] = useState(false)
    const [saving, setSaving] = useState(false)
    const [staffToArchive, setStaffToArchive] = useState<string | null>(null)

    // View Students State
    const [viewStudentsDialogOpen, setViewStudentsDialogOpen] = useState(false)
    const [viewStudentsStaff, setViewStudentsStaff] = useState<Staff | null>(null)
    const [assignedStudents, setAssignedStudents] = useState<any[]>([])
    const [loadingStudents, setLoadingStudents] = useState(false)

    // Edit Form State
    const [editForm, setEditForm] = useState({
        name: "",
        email: "",
        role: "",
        staff_id: "",
        phone: "",
        address: "",
        place: "",
        phone_contacts: [{ number: "", relation: "Personal" }] as PhoneContact[],
    })
    const [photoFile, setPhotoFile] = useState<File | null>(null)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        loadStaff()
    }, [])

    async function loadStaff() {
        try {
            const res = await api.get('/staff')
            if (res.data.success) {
                setStaff(res.data.staff || [])
            }
        } catch (error) {
            console.error("Failed to load staff", error)
        }
        setLoading(false)
    }

    async function handleArchiveStaff() {
        if (!staffToArchive) return
        const id = staffToArchive
        setStaffToArchive(null)

        // Optimistic Update
        const previousStaff = [...staff]
        setStaff(staff.map(s => s.id === id ? { ...s, is_active: false, profile_id: null } : s))
        
        try {
            const result = await api.put(`/staff/${id}/archive`)
            if (result.data.success) {
                toast({ title: "Archived", description: "Mentor has been archived." })
            } else {
                setStaff(previousStaff)
                toast({ title: "Error", description: "Failed to archive mentor.", variant: "destructive" })
            }
        } catch (error: any) {
            setStaff(previousStaff)
            toast({ title: "Error", description: "Failed to archive mentor.", variant: "destructive" })
        }
    }

    async function handleRestoreStaff(id: string) {
        // Optimistic Update
        const previousStaff = [...staff]
        setStaff(staff.map(s => s.id === id ? { ...s, is_active: true } : s))
        
        try {
            const result = await api.put(`/staff/${id}/restore`)
            if (result.data.success) {
                toast({ title: "Restored", description: "Mentor has been restored." })
            } else {
                setStaff(previousStaff)
                toast({ title: "Error", description: "Failed to restore mentor.", variant: "destructive" })
            }
        } catch (error: any) {
            setStaff(previousStaff)
            toast({ title: "Error", description: "Failed to restore mentor.", variant: "destructive" })
        }
    }

    const handleCreateLogin = async () => {
        if (!selectedStaff || !newPassword) return
        if (newPassword.length < 6) {
            toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" })
            return
        }

        setCreatingLogin(true)
        try {
            const result = await api.post(`/staff/${selectedStaff.id}/login`, {
                password: newPassword
            })

            if (result.data.success) {
                toast({ title: "Success", description: "Login created successfully!" })
                setLoginDialogOpen(false)
                setNewPassword("")
                loadStaff()
            } else {
                toast({ title: "Error", description: result.data.error, variant: "destructive" })
            }
        } catch (e: any) {
            toast({ title: "Error", description: "Failed: " + e.message, variant: "destructive" })
        } finally {
            setCreatingLogin(false)
        }
    }

    const handleUpdateStaff = async () => {
        if (!selectedStaff) return
        setSaving(true)
        try {
            let photoUrl = selectedStaff.photo_url

            // Upload photo if changed
            if (photoFile) {
                const formData = new FormData()
                formData.append('avatar', photoFile)
                const uploadRes = await api.post('/upload/avatar', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                })
                if (uploadRes.data.success) {
                    photoUrl = uploadRes.data.filePath
                }
            }

            // Filter out empty phone contacts
            const validContacts = editForm.phone_contacts.filter(c => c.number.trim() !== '')

            const res = await api.put(`/staff/${selectedStaff.id}`, {
                name: editForm.name,
                email: editForm.email.trim() || undefined,
                role: editForm.role,
                staff_id: editForm.staff_id || null,
                phone: editForm.phone || null,
                address: editForm.address || null,
                place: editForm.place || null,
                photo_url: photoUrl,
                phone_contacts: validContacts,
            })

            if (res.data.success) {
                toast({ title: "Updated", description: "Mentor details updated successfully." })
                setEditDialogOpen(false)
                setPhotoFile(null)
                loadStaff()
            } else {
                throw new Error(res.data.error)
            }
        } catch (error: any) {
            console.error(error)
            const errorMsg = error.response?.data?.error || error.message || "Unknown error"
            toast({ title: "Error", description: "Failed to update: " + errorMsg, variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const openCreateLoginDialog = (s: Staff) => {
        setSelectedStaff(s)
        setNewPassword("")
        setLoginDialogOpen(true)
    }

    const openEditDialog = (s: Staff) => {
        setSelectedStaff(s)
        const contacts = (s.phone_contacts && s.phone_contacts.length > 0)
            ? s.phone_contacts
            : [{ number: s.phone || "", relation: "Personal" }]
        // Ensure we always have at least one row visible
        setEditForm({
            name: s.name,
            email: s.email || "",
            role: s.role,
            staff_id: s.staff_id || "",
            phone: s.phone || "",
            address: s.address || "",
            place: s.place || "",
            phone_contacts: contacts,
        })
        setPhotoFile(null)
        setEditDialogOpen(true)
    }

    const openViewStudents = async (s: Staff) => {
        setViewStudentsStaff(s)
        setViewStudentsDialogOpen(true)
        setLoadingStudents(true)
        setAssignedStudents([]) // clear previous

        try {
            const res = await api.get(`/staff/${s.id}/students`)
            if (res.data.success) {
                setAssignedStudents(res.data.students || [])
            } else {
                toast({ title: "Error", description: "Failed to load assigned students.", variant: "destructive" })
            }
        } catch (error) {
            console.error("Failed to load students:", error)
            toast({ title: "Error", description: "Network error loading students.", variant: "destructive" })
        } finally {
            setLoadingStudents(false)
        }
    }

    const addPhoneContact = () => {
        if (editForm.phone_contacts.length < 3) {
            setEditForm({
                ...editForm,
                phone_contacts: [...editForm.phone_contacts, { number: "", relation: "Personal" }]
            })
        }
    }

    const removePhoneContact = (index: number) => {
        setEditForm({
            ...editForm,
            phone_contacts: editForm.phone_contacts.filter((_, i) => i !== index)
        })
    }

    const updatePhoneContact = (index: number, field: 'number' | 'relation', value: string) => {
        const updated = [...editForm.phone_contacts]
        updated[index] = { ...updated[index], [field]: value }
        setEditForm({ ...editForm, phone_contacts: updated })
    }

    const activeStaffList = staff.filter(s => s.is_active !== false)
    const archivedStaffList = staff.filter(s => s.is_active === false)
    const displayedStaff = activeTab === "active" ? activeStaffList : archivedStaffList

    const filtered = displayedStaff.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.place && s.place.toLowerCase().includes(search.toLowerCase())) ||
        (s.staff_id && s.staff_id.toLowerCase().includes(search.toLowerCase()))
    )

    const mentorCount = activeStaffList.filter(s => ['usthad', 'staff', 'teacher'].includes(s.role)).length
    const adminCount = activeStaffList.filter(s => ['admin', 'principal', 'vice_principal', 'controller'].includes(s.role)).length

    // Get primary phone for display
    const getPrimaryPhone = (s: Staff) => {
        if (s.phone_contacts && s.phone_contacts.length > 0) {
            return s.phone_contacts[0].number
        }
        return s.phone || '-'
    }

    return (
        <div className="p-4 md:p-8 pt-6 space-y-6" suppressHydrationWarning>
            {!mounted ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
            ) : (
                <>
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Mentors</h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage mentors and administrators.</p>
                    </div>
                    <Link href="/admin/staff/create">
                        <Button className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 shadow-lg shadow-purple-500/30">
                            <Plus className="mr-2 h-4 w-4" /> Add Mentor
                        </Button>
                    </Link>
                </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-[#1a2234]">
                    <CardContent className="p-4 sm:p-5 flex flex-col justify-center">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-md shadow-purple-500/20">
                                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div>
                                <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-none">{loading ? "..." : activeStaffList.length}</p>
                                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">Total</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-[#1a2234]">
                    <CardContent className="p-4 sm:p-5 flex flex-col justify-center">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20">
                                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div>
                                <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-none">{loading ? "..." : mentorCount}</p>
                                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">Mentors</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-[#1a2234]">
                    <CardContent className="p-4 sm:p-5 flex flex-col justify-center">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-amber-500/20">
                                <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div>
                                <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-none">{loading ? "..." : adminCount}</p>
                                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">Admins</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-[#1a2234] opacity-80 hover:opacity-100 transition-opacity">
                    <CardContent className="p-4 sm:p-5 flex flex-col justify-center">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center shadow-md border-2 border-slate-300 dark:border-slate-700">
                                <Trash2 className="h-5 w-5 sm:h-6 sm:w-6 text-slate-500" />
                            </div>
                            <div>
                                <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-300 leading-none">{loading ? "..." : archivedStaffList.length}</p>
                                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-500 mt-1">Archived</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs & Search */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-8 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex gap-1 w-full md:w-auto overflow-x-auto scrollbar-hide">
                    <button
                        onClick={() => setActiveTab("active")}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${activeTab === "active"
                            ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20"
                            : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                            }`}
                    >
                        Active
                        <Badge variant="secondary" className="bg-white/50 dark:bg-slate-900/50">{activeStaffList.length}</Badge>
                    </button>
                    <button
                        onClick={() => setActiveTab("archived")}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${activeTab === "archived"
                            ? "border-slate-500 text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800"
                            : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                            }`}
                    >
                        Archived
                        <Badge variant="secondary" className="bg-white/50 dark:bg-slate-900/50">{archivedStaffList.length}</Badge>
                    </button>
                </div>

                <div className="relative w-full md:w-72 flex-shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search by name or place..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                    />
                </div>
            </div>

            {/* Archival Notice */}
            {activeTab === "archived" && (
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start sm:items-center gap-3 text-sm text-amber-800 dark:text-amber-300">
                    <span className="text-xl">🗂️</span>
                    <p>
                        Archived mentors are <strong>not deleted</strong> — all their records (students, Hifz logs, attendance) are preserved. You can restore them at any time.
                    </p>
                </div>
            )}

            {/* Table */}
            <Card className="border-none shadow-lg overflow-hidden bg-white dark:bg-[#1a2234]">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                            <TableRow>
                                <TableHead className="pl-6 w-10">#</TableHead>
                                <TableHead>Photo</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Staff ID</TableHead>
                                <TableHead>Place</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead className="text-right pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center h-32">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="h-5 w-5 rounded-full border-2 border-purple-600 border-t-transparent animate-spin"></div>
                                            Loading...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center h-32 text-slate-500">
                                        <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                                        No mentors found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map((s, idx) => (
                                    <TableRow key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                        <TableCell className="pl-6 text-slate-400 text-xs">{idx + 1}</TableCell>
                                        <TableCell>
                                            {s.photo_url ? (
                                                <img
                                                    src={s.photo_url.startsWith('http') ? s.photo_url : `http://localhost:5000${s.photo_url}`}
                                                    alt={s.name}
                                                    className="h-10 w-10 rounded-full object-cover ring-2 ring-white dark:ring-slate-900 shadow-sm"
                                                />
                                            ) : (
                                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm shadow">
                                                    {s.name.charAt(0)}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <span className="font-medium text-slate-900 dark:text-white block">{s.name}</span>
                                                {activeTab === "active" && !s.password_hash && (
                                                    <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200 mt-1">
                                                        No Login
                                                    </Badge>
                                                )}
                                                {activeTab === "archived" && (
                                                    <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-500 border-slate-200 mt-1">
                                                        Archived
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-slate-500 font-mono text-xs">{s.staff_id || s.id.slice(0, 8)}</TableCell>
                                        <TableCell className="text-slate-600 dark:text-slate-400">
                                            {s.place ? (
                                                <div className="flex items-center gap-1.5">
                                                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                                    {s.place}
                                                </div>
                                            ) : '-'}
                                        </TableCell>
                                        <TableCell className="text-slate-600 dark:text-slate-400">
                                            <div className="flex items-center gap-1.5">
                                                <Phone className="h-3.5 w-3.5 text-slate-400" />
                                                {getPrimaryPhone(s)}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                className={`capitalize border-none ${['admin', 'principal', 'vice_principal', 'controller'].includes(s.role)
                                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                    }`}
                                            >
                                                {s.role === 'usthad' ? 'Mentor' : s.role === 'vice_principal' ? 'Vice Principal' : s.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex items-center justify-end gap-2">
                                                {activeTab === "active" ? (
                                                    <>
                                                        {!s.password_hash && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                                                                onClick={() => openCreateLoginDialog(s)}
                                                            >
                                                                <KeyRound className="h-3 w-3 mr-1.5" />
                                                                Create Login
                                                            </Button>
                                                        )}
                                                        {(!['admin', 'controller'].includes(s.role)) && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 w-8 p-0 border-slate-200 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-blue-900/20"
                                                                onClick={() => openViewStudents(s)}
                                                                title="View Assigned Students"
                                                            >
                                                                <Users className="h-3.5 w-3.5" />
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 w-8 p-0 border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                                                            onClick={() => openEditDialog(s)}
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                            onClick={() => setStaffToArchive(s.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:text-white"
                                                        onClick={() => handleRestoreStaff(s.id)}
                                                    >
                                                        <RotateCcw className="h-3.5 w-3.5 mr-2" />
                                                        Restore
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>

            {/* Create Login Dialog */}
            <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Login for {selectedStaff?.name}</DialogTitle>
                        <DialogDescription asChild>
                            <div className="space-y-1 mt-2 text-sm text-slate-500">
                                <p>Set a password to enable login access.</p>
                                {selectedStaff?.email?.includes('dummy-') ? (
                                    <p className="text-red-500 font-medium">Warning: This mentor has a placeholder email. Please Edit their profile to add a real email address before creating a login.</p>
                                ) : (
                                    <p className="text-blue-600 dark:text-blue-400 font-medium">Login Email: {selectedStaff?.email || 'N/A'}</p>
                                )}
                            </div>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Password</Label>
                            <Input
                                type="password"
                                placeholder="Enter password (min 6 chars)"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setLoginDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateLogin} disabled={creatingLogin || newPassword.length < 6} className="bg-purple-600 hover:bg-purple-700">
                            {creatingLogin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Login
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Mentor Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Mentor</DialogTitle>
                        <DialogDescription>
                            Update details for {selectedStaff?.name}.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5 py-4">
                        {/* Photo */}
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                {(photoFile || selectedStaff?.photo_url) ? (
                                    <img
                                        src={photoFile ? URL.createObjectURL(photoFile) : (selectedStaff?.photo_url?.startsWith('http') ? selectedStaff.photo_url : `http://localhost:5000${selectedStaff?.photo_url}`)}
                                        alt="Photo"
                                        className="h-16 w-16 rounded-full object-cover ring-2 ring-slate-200"
                                    />
                                ) : (
                                    <div className="h-16 w-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold">
                                        {editForm.name.charAt(0) || '?'}
                                    </div>
                                )}
                            </div>
                            <div className="space-y-1">
                                <Label>Photo</Label>
                                <Input
                                    type="file"
                                    accept="image/*"
                                    className="w-full text-sm"
                                    onChange={(e) => e.target.files?.[0] && setPhotoFile(e.target.files[0])}
                                />
                            </div>
                        </div>

                        {/* Name & ID */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Full Name <span className="text-red-500">*</span></Label>
                                <Input
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <Label>Email (for login)</Label>
                                <Input
                                    type="email"
                                    placeholder="Mentor email"
                                    value={editForm.email}
                                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                />
                            </div>
                            
                            {editForm.role !== 'usthad' && editForm.role !== 'vice_principal' && (
                                <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-100 dark:border-blue-900/30">
                                    <Label>Staff ID (Key)</Label>
                                    <Input
                                        placeholder="Enter custom Staff ID"
                                        value={editForm.staff_id}
                                        onChange={(e) => setEditForm({ ...editForm, staff_id: e.target.value })}
                                    />
                                    <p className="text-[10px] text-blue-600 dark:text-blue-400">
                                        This role requires a manually entered Staff ID. Mentors/VPs are auto-generated.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Place & Address */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>Place</Label>
                                <Input
                                    placeholder="City / Town"
                                    value={editForm.place}
                                    onChange={(e) => setEditForm({ ...editForm, place: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Address</Label>
                                <Input
                                    placeholder="Full address"
                                    value={editForm.address}
                                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Phone Contacts */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>Phone Numbers</Label>
                                {editForm.phone_contacts.length < 3 && (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs text-purple-600" onClick={addPhoneContact}>
                                        + Add Phone
                                    </Button>
                                )}
                            </div>
                            {editForm.phone_contacts.map((contact, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Input
                                        placeholder="Phone number"
                                        value={contact.number}
                                        onChange={(e) => updatePhoneContact(i, 'number', e.target.value)}
                                        className="flex-1"
                                    />
                                    <Select
                                        value={contact.relation}
                                        onValueChange={(val) => updatePhoneContact(i, 'relation', val)}
                                    >
                                        <SelectTrigger className="w-[120px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {RELATION_OPTIONS.map(r => (
                                                <SelectItem key={r} value={r}>{r}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {editForm.phone_contacts.length > 1 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 text-red-400 hover:text-red-600"
                                            onClick={() => removePhoneContact(i)}
                                        >
                                            ×
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Role */}
                        <div className="space-y-2">
                            <Label>Role</Label>
                            <Select
                                value={editForm.role}
                                onValueChange={(val) => setEditForm({ ...editForm, role: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="usthad">Mentor</SelectItem>
                                    <SelectItem value="principal">Principal</SelectItem>
                                    <SelectItem value="vice_principal">Vice Principal</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="teacher">Teacher</SelectItem>
                                    <SelectItem value="controller">School Controller</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpdateStaff} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View Assigned Students Dialog */}
            <Dialog open={viewStudentsDialogOpen} onOpenChange={setViewStudentsDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                    <DialogHeader className="pb-4 border-b">
                        <DialogTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-purple-600" />
                            Assigned Students
                        </DialogTitle>
                        <DialogDescription>
                            Students currently assigned to {viewStudentsStaff?.name} ({viewStudentsStaff?.role}).
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto py-4">
                        {loadingStudents ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                                <Loader2 className="h-8 w-8 animate-spin mb-4 text-purple-600" />
                                <p>Loading students...</p>
                            </div>
                        ) : assignedStudents.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                                <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                    <User className="h-8 w-8 text-slate-400" />
                                </div>
                                <p className="font-medium text-slate-700 dark:text-slate-300">No students assigned</p>
                                <p className="text-sm mt-1">This mentor does not have any active students currently assigned.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between px-2 mb-2">
                                    <span className="text-sm font-medium text-slate-500">Total: {assignedStudents.length} Students</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {assignedStudents.map((stu) => (
                                        <div key={stu.id || stu.adm_no} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#1a2234] hover:border-purple-200 dark:hover:border-purple-800/50 transition-colors">
                                            {stu.photo_url ? (
                                                <img src={`http://localhost:5000${stu.photo_url}`} alt={stu.name} className="h-10 w-10 rounded-full object-cover ring-2 ring-white dark:ring-slate-900" />
                                            ) : (
                                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium text-sm">
                                                    {stu.name.charAt(0)}
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{stu.name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <Badge variant="outline" className="text-[10px] bg-white dark:bg-slate-800 font-normal">
                                                        #{stu.adm_no}
                                                    </Badge>
                                                    {stu.standard && (
                                                        <span className="text-xs text-slate-500">Std {stu.standard}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Archive Confirmation Dialog */}
            <AlertDialog open={!!staffToArchive} onOpenChange={(open) => !open && setStaffToArchive(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Archive Mentor?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to archive this mentor? This will immediately remove their login access, but preserve all their historical records.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleArchiveStaff} className="bg-red-600 hover:bg-red-700 text-white">
                            Archive Mentor
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
                </>
            )}
        </div>
    )
}
