"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Search, Trash2, Users, Shield, Mail, UserCog, KeyRound, Loader2, Pencil, Phone, RotateCcw } from "lucide-react"

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
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { supabase } from "@/lib/auth"
import { createStaffUser, archiveStaff, restoreStaff } from "@/actions/staff-auth"

type StaffRole = "admin" | "principal" | "vice_principal" | "controller" | "staff" | "usthad" | "teacher"

type Staff = {
    id: string
    name: string
    email: string
    role: StaffRole
    phone: string | null
    profile_id: string | null
    is_active?: boolean
}

export default function StaffPage() {
    const [staff, setStaff] = useState<Staff[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [activeTab, setActiveTab] = useState<"active" | "archived">("active")

    // Create Login State
    const [loginDialogOpen, setLoginDialogOpen] = useState(false)
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null)
    const [newPassword, setNewPassword] = useState("")
    const [creatingLogin, setCreatingLogin] = useState(false)
    const [saving, setSaving] = useState(false)

    // Edit Form State
    const [editForm, setEditForm] = useState({
        name: "",
        role: "",
        phone: ""
    })

    useEffect(() => {
        loadStaff()
    }, [])

    async function loadStaff() {
        const { data } = await supabase.from("staff").select("*").order("name")
        if (data) setStaff(data)
        setLoading(false)
    }

    async function handleArchiveStaff(id: string) {
        if (!confirm("Are you sure you want to archive this staff member? This will remove their login access, but preserve their historical records.")) return

        setLoading(true)
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) { alert("Authentication error. Please log in again."); setLoading(false); return; }

        const result = await archiveStaff(id, token)
        if (result.error) {
            alert(`Failed to archive staff: ${result.error}`)
            setLoading(false)
        } else {
            setStaff(staff.map(s => s.id === id ? { ...s, is_active: false, profile_id: null } : s))
            setLoading(false)
        }
    }

    async function handleRestoreStaff(id: string) {
        if (!confirm("Are you sure you want to restore this staff member?")) return

        setLoading(true)
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) { alert("Authentication error. Please log in again."); setLoading(false); return; }

        const result = await restoreStaff(id, token)
        if (result.error) {
            alert(`Failed to restore staff: ${result.error}`)
            setLoading(false)
        } else {
            setStaff(staff.map(s => s.id === id ? { ...s, is_active: true } : s))
            setLoading(false)
        }
    }

    const handleCreateLogin = async () => {
        if (!selectedStaff || !newPassword) return
        if (newPassword.length < 6) {
            alert("Password must be at least 6 characters")
            return
        }

        setCreatingLogin(true)
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token;
            if (!token) throw new Error("Authentication error. Please log in again.");

            const result = await createStaffUser({
                email: selectedStaff.email,
                name: selectedStaff.name,
                role: selectedStaff.role,
                password: newPassword,
                existingStaffId: selectedStaff.id,
                phone: selectedStaff.phone || undefined,
                token: token
            })

            if (result.error) {
                alert("Error: " + result.error)
            } else {
                alert("Login created successfully!")
                setLoginDialogOpen(false)
                setNewPassword("")
                loadStaff() // Refresh to update profile_id
            }
        } catch (e: any) {
            alert("Failed: " + e.message)
        } finally {
            setCreatingLogin(false)
        }
    }

    const handleUpdateStaff = async () => {
        if (!selectedStaff) return
        setSaving(true)
        try {
            const { error } = await supabase
                .from("staff")
                .update({
                    name: editForm.name,
                    role: editForm.role,
                    phone: editForm.phone || null
                })
                .eq("id", selectedStaff.id)

            if (error) throw error

            // If linked to profile, update profile name/role too?
            // For now, let's keep it simple and just update staff record.
            // Ideally, we server-side update both, but simple update is fine.

            alert("Staff updated successfully")
            setEditDialogOpen(false)
            loadStaff()
        } catch (error: any) {
            console.error(error)
            alert("Failed to update: " + error.message)
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
        setEditForm({
            name: s.name,
            role: s.role,
            phone: s.phone || ""
        })
        setEditDialogOpen(true)
    }

    const activeStaffList = staff.filter(s => s.is_active !== false)
    const archivedStaffList = staff.filter(s => s.is_active === false)

    const displayedStaff = activeTab === "active" ? activeStaffList : archivedStaffList

    const filtered = displayedStaff.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase())
    )

    const roleCount = (role: string) => activeStaffList.filter(s => s.role === role).length

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Staff Directory</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Manage faculty and administrators.</p>
                </div>
                <Link href="/admin/staff/create">
                    <Button className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 shadow-lg shadow-purple-500/30">
                        <Plus className="mr-2 h-4 w-4" /> Add Staff
                    </Button>
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-[#1a2234]">
                    <CardContent className="p-4 sm:p-5 flex flex-col justify-center">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-md shadow-purple-500/20">
                                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div>
                                <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-none">{loading ? "..." : activeStaffList.length}</p>
                                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">Total Staff</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-[#1a2234]">
                    <CardContent className="p-4 sm:p-5 flex flex-col justify-center">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20">
                                <UserCog className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div>
                                <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-none">{loading ? "..." : roleCount("usthad")}</p>
                                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">Usthads</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-[#1a2234]">
                    <CardContent className="p-4 sm:p-5 flex flex-col justify-center">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20">
                                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div>
                                <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-none">{loading ? "..." : roleCount("staff")}</p>
                                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">Staff</p>
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
                                <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-none">{loading ? "..." : roleCount("admin")}</p>
                                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">Admins</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="col-span-2 md:col-span-1 border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-[#1a2234] opacity-80 hover:opacity-100 transition-opacity">
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
                        Active Staff
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
                        placeholder="Search by name or email..."
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
                        Archived staff are <strong>not deleted</strong> — all their records (students, Hifz logs, attendance) are preserved. You can restore them at any time.
                    </p>
                </div>
            )}

            {/* Table */}
            <Card className="border-none shadow-lg overflow-hidden bg-white dark:bg-[#1a2234]">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                            <TableRow>
                                <TableHead className="pl-6">Staff Member</TableHead>
                                <TableHead>Contact Info</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead className="text-right pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center h-32">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="h-5 w-5 rounded-full border-2 border-purple-600 border-t-transparent animate-spin"></div>
                                            Loading...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center h-32 text-slate-500">
                                        <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                                        No staff found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map((s) => (
                                    <TableRow key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                        <TableCell className="pl-6">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm shadow">
                                                    {s.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <span className="font-medium text-slate-900 dark:text-white block">{s.name}</span>
                                                    {activeTab === "archived" ? (
                                                        <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 mt-1">
                                                            Archived
                                                        </Badge>
                                                    ) : !s.profile_id && (
                                                        <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200 mt-1">
                                                            No Login
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-slate-500 dark:text-slate-400">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <Mail className="h-3.5 w-3.5" />
                                                    {s.email}
                                                </div>
                                                {s.phone && (
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <Phone className="h-3.5 w-3.5" />
                                                        {s.phone}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                className={`capitalize border-none ${s.role === 'admin' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                                    s.role === 'usthad' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                    }`}
                                            >
                                                {s.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex items-center justify-end gap-2">
                                                {activeTab === "active" ? (
                                                    <>
                                                        {!s.profile_id && (
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
                                                            onClick={() => handleArchiveStaff(s.id)}
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
                        <DialogDescription>
                            Set a password for this staff member to enable them to log in.
                            Their email <strong>{selectedStaff?.email}</strong> will be the username.
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

            {/* Edit Staff Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Staff Member</DialogTitle>
                        <DialogDescription>
                            Update details for {selectedStaff?.name}.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Full Name</Label>
                            <Input
                                value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Phone Number</Label>
                            <Input
                                placeholder="+91 9876543210"
                                value={editForm.phone}
                                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            />
                        </div>

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
                                    <SelectItem value="usthad">Usthad</SelectItem>
                                    <SelectItem value="principal">Principal</SelectItem>
                                    <SelectItem value="vice_principal">Vice Principal</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="staff">Staff</SelectItem>
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
        </div>
    )
}
