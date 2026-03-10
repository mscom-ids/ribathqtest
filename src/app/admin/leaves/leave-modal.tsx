import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { format } from "date-fns"
import { CalendarIcon, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/auth"
import { toast } from "sonner"

const leaveSchema = z.object({
    student_id: z.string().min(1, "Student is required"),
    leave_type: z.enum(["internal", "personal", "institutional"]),
    start_datetime: z.string().min(1, "Start time is required"),
    end_datetime: z.string().min(1, "End time is required"),
    reason: z.string().optional(),
})

type LeaveFormValues = z.infer<typeof leaveSchema>

interface LeaveModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function LeaveModal({ open, onOpenChange, onSuccess }: LeaveModalProps) {
    const [students, setStudents] = useState<{ adm_no: string; name: string; standard: string }[]>([])
    const [loading, setLoading] = useState(false)

    const form = useForm<LeaveFormValues>({
        resolver: zodResolver(leaveSchema),
        defaultValues: {
            student_id: "",
            leave_type: "personal",
            start_datetime: "",
            end_datetime: "",
            reason: "",
        },
    })

    useEffect(() => {
        if (!open) return
        
        // Fetch eligible students
        const fetchStudents = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", user.id)
                .single()

            const isAdminRole = ["admin", "principal", "vice_principal"].includes(profile?.role || "")

            let query = supabase.from("students").select("adm_no, name, standard").eq("status", "active").order("name")
            
            // If not admin, RLS handles it conceptually, 
            // but we explicitly filter to ensure the combobox only shows assigned students
            if (!isAdminRole) {
                // Get staff ID
                const { data: staff } = await supabase
                    .from("staff")
                    .select("id")
                    .eq("profile_id", user.id)
                    .single()

                if (staff) {
                    query = query.eq("assigned_usthad_id", staff.id)
                }
            }

            const { data, error } = await query
            if (!error && data) {
                setStudents(data)
            }
        }
        
        fetchStudents()
        form.reset()
    }, [open])

    const onSubmit = async (values: LeaveFormValues) => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        
        // Convert local datetime to ISO aware string
        const start = new Date(values.start_datetime).toISOString()
        const end = new Date(values.end_datetime).toISOString()

        let error = null;

        if (values.student_id === "ALL") {
            const inserts = students.map(s => ({
                student_id: s.adm_no,
                leave_type: values.leave_type,
                start_datetime: start,
                end_datetime: end,
                reason: values.reason,
                approved_by: user?.id,
                status: "approved"
            }))
            const res = await supabase.from("student_leaves").insert(inserts)
            error = res.error
        } else {
            const res = await supabase.from("student_leaves").insert({
                student_id: values.student_id,
                leave_type: values.leave_type,
                start_datetime: start,
                end_datetime: end,
                reason: values.reason,
                approved_by: user?.id,
                status: "approved"
            })
            error = res.error
        }

        if (error) {
            toast.error("Failed to authorize leave", { description: error.message })
        } else {
            toast.success("Leave Authorized Successfully")
            onSuccess()
            onOpenChange(false)
        }
        setLoading(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Authorize New Leave</DialogTitle>
                    <DialogDescription>
                        Create a new leave request. Mentors can only issue leaves to their assigned students.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="student_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Student</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select student" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="max-h-64">
                                            {form.watch("leave_type") === "institutional" && (
                                                <SelectItem value="ALL" className="font-bold text-emerald-600 dark:text-emerald-400">
                                                    All Students (Bulk Vacation)
                                                </SelectItem>
                                            )}
                                            {students.map((s) => (
                                                <SelectItem key={s.adm_no} value={s.adm_no}>
                                                    {s.name} ({s.adm_no} - {s.standard})
                                                </SelectItem>
                                            ))}
                                            {students.length === 0 && (
                                                <SelectItem value="none" disabled>No eligible students found</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="leave_type"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Leave Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="personal">Personal Leave (e.g., Ziyarath, Family)</SelectItem>
                                            <SelectItem value="internal">Internal Leave (e.g., Medical, Exam)</SelectItem>
                                            <SelectItem value="institutional">Institutional (e.g., Vacation)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="start_datetime"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Start Time</FormLabel>
                                        <FormControl>
                                            <input
                                                type="datetime-local"
                                                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="end_datetime"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Expected Return</FormLabel>
                                        <FormControl>
                                            <input
                                                type="datetime-local"
                                                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="reason"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Reason (Optional)</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="Provide reason for leave"
                                            className="resize-none"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button type="submit" disabled={loading} className="w-full sm:w-auto mt-4 sm:mt-0 bg-emerald-600 hover:bg-emerald-700">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Authorize Leave
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
