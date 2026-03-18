"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, ArrowLeft } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import api from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

type PhoneContact = {
    number: string
    relation: string
}

const RELATION_OPTIONS = ["Personal", "Home", "Father", "Mother", "Guardian", "Other"]

export default function CreateStaffPage() {
    const router = useRouter()
    const { toast } = useToast()
    const [loading, setLoading] = useState(false)

    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        role: "usthad",
        address: "",
        place: "",
        phone_contacts: [{ number: "", relation: "Personal" }] as PhoneContact[],
        join_year: new Date().getFullYear().toString(),
        join_month: String(new Date().getMonth() + 1).padStart(2, '0'),
        staff_id: "",
    })
    const [photoFile, setPhotoFile] = useState<File | null>(null)

    const addPhoneContact = () => {
        if (form.phone_contacts.length < 3) {
            setForm({
                ...form,
                phone_contacts: [...form.phone_contacts, { number: "", relation: "Personal" }]
            })
        }
    }

    const removePhoneContact = (index: number) => {
        setForm({
            ...form,
            phone_contacts: form.phone_contacts.filter((_, i) => i !== index)
        })
    }

    const updatePhoneContact = (index: number, field: 'number' | 'relation', value: string) => {
        const updated = [...form.phone_contacts]
        updated[index] = { ...updated[index], [field]: value }
        setForm({ ...form, phone_contacts: updated })
    }

    async function onSubmit() {
        if (!form.name.trim()) {
            toast({ title: "Error", description: "Name is required", variant: "destructive" })
            return
        }

        setLoading(true)

        try {
            let photoUrl = null

            // Upload photo if provided
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
            const validContacts = form.phone_contacts.filter(c => c.number.trim() !== '')
            // Use the first phone as the primary phone field too
            const primaryPhone = validContacts.length > 0 ? validContacts[0].number : null

            const result = await api.post('/staff', {
                name: form.name.trim(),
                email: form.email.trim() || undefined,
                password: form.password || undefined,
                role: form.role,
                phone: primaryPhone,
                photo_url: photoUrl,
                address: form.address || null,
                place: form.place || null,
                phone_contacts: validContacts,
                join_year: (form.role === 'usthad' || form.role === 'vice_principal') ? form.join_year : undefined,
                join_month: (form.role === 'usthad' || form.role === 'vice_principal') ? form.join_month : undefined,
                staff_id: (form.role !== 'usthad' && form.role !== 'vice_principal') ? (form.staff_id || null) : undefined,
            })

            if (!result.data.success) {
                toast({ title: "Error", description: result.data.error, variant: "destructive" })
            } else {
                toast({ title: "Success", description: "Mentor added successfully!" })
                router.push("/admin/staff")
            }
        } catch (error: any) {
            console.error(error)
            const errorMsg = error.response?.data?.error || error.message || "Unknown error"
            toast({ title: "Error", description: `Failed to add mentor: ${errorMsg}`, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/admin/staff">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Add New Mentor</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Mentor Details</CardTitle>
                    <p className="text-sm text-slate-500">Only name is required. Staff ID generation depends on the role selected.</p>
                </CardHeader>
                <CardContent className="space-y-6">

                    {/* Photo */}
                    <div className="flex items-center gap-4">
                        <div>
                            {photoFile ? (
                                <img
                                    src={URL.createObjectURL(photoFile)}
                                    alt="Photo"
                                    className="h-16 w-16 rounded-full object-cover ring-2 ring-slate-200"
                                />
                            ) : (
                                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold">
                                    {form.name.charAt(0) || '?'}
                                </div>
                            )}
                        </div>
                        <div className="space-y-1 flex-1">
                            <Label>Photo (Optional)</Label>
                            <Input
                                type="file"
                                accept="image/*"
                                className="w-full text-sm"
                                onChange={(e) => e.target.files?.[0] && setPhotoFile(e.target.files[0])}
                            />
                        </div>
                    </div>

                    {/* Name */}
                    <div className="space-y-2">
                        <Label>Full Name <span className="text-red-500">*</span></Label>
                        <Input
                            placeholder="Enter mentor name"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            autoFocus
                        />
                    </div>

                    {/* Email & Password */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>Email <span className="text-xs text-slate-400 font-normal">(Optional, for login)</span></Label>
                            <Input
                                type="email"
                                placeholder="Email address"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Password <span className="text-xs text-slate-400 font-normal">(Optional)</span></Label>
                            <Input
                                type="password"
                                placeholder="Create password"
                                value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Place & Address */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>Place</Label>
                            <Input
                                placeholder="City / Town"
                                value={form.place}
                                onChange={(e) => setForm({ ...form, place: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Address</Label>
                            <Input
                                placeholder="Full address"
                                value={form.address}
                                onChange={(e) => setForm({ ...form, address: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Phone Contacts */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label>Phone Numbers</Label>
                            {form.phone_contacts.length < 3 && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-purple-600" onClick={addPhoneContact}>
                                    <Plus className="h-3 w-3 mr-1" /> Add Phone
                                </Button>
                            )}
                        </div>
                        {form.phone_contacts.map((contact, i) => (
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
                                {form.phone_contacts.length > 1 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-red-400 hover:text-red-600"
                                        type="button"
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
                            value={form.role}
                            onValueChange={(val) => setForm({ ...form, role: val })}
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

                    {(form.role === 'usthad' || form.role === 'vice_principal') ? (
                        <div className="grid grid-cols-2 gap-3 p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-100 dark:border-purple-900/30">
                            <div className="space-y-2">
                                <Label>Joined Year</Label>
                                <Input 
                                    type="number"
                                    min="2000"
                                    max="2100"
                                    value={form.join_year} 
                                    onChange={(e) => setForm({ ...form, join_year: e.target.value })} 
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Joined Month</Label>
                                <Select
                                    value={form.join_month}
                                    onValueChange={(val) => setForm({ ...form, join_month: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Month" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({ length: 12 }).map((_, i) => (
                                            <SelectItem key={i} value={String(i + 1).padStart(2, '0')}>
                                                {String(i + 1).padStart(2, '0')}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <p className="col-span-2 text-xs text-purple-600 dark:text-purple-400">
                                Staff ID will be auto-generated for Mentors and Vice Principals based on the joined year and month (e.g. SRXX-{form.join_year}-{form.join_month}).
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-100 dark:border-blue-900/30">
                            <Label>Staff ID (Key) <span className="text-red-500">*</span></Label>
                            <Input
                                placeholder="Enter custom Staff ID"
                                value={form.staff_id}
                                onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
                            />
                            <p className="text-xs text-blue-600 dark:text-blue-400">
                                This role requires a manually entered Staff ID.
                            </p>
                        </div>
                    )}

                    <Button onClick={onSubmit} disabled={loading || !form.name.trim()} className="w-full bg-purple-600 hover:bg-purple-700">
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Add Mentor
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
