"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"

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

const leaveRequestSchema = z.object({
    leave_type: z.enum(["personal", "internal"]),
    start_datetime: z.string().min(1, "Start time is required"),
    end_datetime: z.string().min(1, "End time is required"),
    reason: z.string().min(1, "Reason is required"),
})

type LeaveRequestValues = z.infer<typeof leaveRequestSchema>

interface LeaveRequestModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    studentId: string
    studentName: string
}

export function LeaveRequestModal({ open, onOpenChange, studentId, studentName }: LeaveRequestModalProps) {
    const [loading, setLoading] = useState(false)

    const form = useForm<LeaveRequestValues>({
        resolver: zodResolver(leaveRequestSchema),
        defaultValues: {
            leave_type: "personal",
            start_datetime: "",
            end_datetime: "",
            reason: "",
        },
    })

    const onSubmit = async (values: LeaveRequestValues) => {
        setLoading(true)
        
        const start = new Date(values.start_datetime).toISOString()
        const end = new Date(values.end_datetime).toISOString()

        const { error } = await supabase.from("student_leaves").insert({
            student_id: studentId,
            leave_type: values.leave_type,
            start_datetime: start,
            end_datetime: end,
            reason: values.reason,
            status: "pending" // Explicitly set as pending
        })

        if (error) {
            toast.error("Failed to submit request", { description: error.message })
        } else {
            toast.success("Leave Request Submitted")
            form.reset()
            onOpenChange(false)
        }
        setLoading(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Request Leave for {studentName}</DialogTitle>
                    <DialogDescription>
                        Submit a leave request. It will be reviewed by the administration.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                                            <SelectItem value="personal">Personal / Family Reason</SelectItem>
                                            <SelectItem value="internal">Medical / Emergency</SelectItem>
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
                                    <FormLabel>Reason</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="Please provide a detailed reason"
                                            className="resize-none"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button type="submit" disabled={loading} className="w-full sm:w-auto mt-4 sm:mt-0 bg-emerald-600 hover:bg-emerald-700 text-white">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Submit Request
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
