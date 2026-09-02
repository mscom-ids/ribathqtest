"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, GraduationCap, Loader2 } from "lucide-react"
import * as z from "zod"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"

const schema = z.object({
    title: z.string().trim().min(2, "Enter an exam name"),
    start_date: z.string().min(1, "Choose a start date"),
    end_date: z.string().optional(),
}).refine(values => !values.end_date || values.end_date >= values.start_date, { message: "End date must be after the start date", path: ["end_date"] })
type Values = z.infer<typeof schema>

export default function CreateExamPage({ params }: { params: Promise<{ department: string }> }) {
    const { department } = use(params)
    const departmentName = department.charAt(0).toUpperCase() + department.slice(1)
    const router = useRouter()
    const [saving, setSaving] = useState(false)
    const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { title: "", start_date: new Date().toISOString().slice(0, 10), end_date: "" } })

    async function submit(values: Values) {
        setSaving(true)
        try {
            const response = await api.post("/exams", { ...values, end_date: values.end_date || null, department: departmentName, type: departmentName, is_active: true })
            router.push(`/admin/${department}/exams/${response.data.exam.id}`)
        } catch (error: any) {
            alert(error.response?.data?.error || "Failed to create exam")
            setSaving(false)
        }
    }

    return <div className="mx-auto max-w-3xl space-y-4 pb-10">
        <header className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 px-5 py-4 text-white shadow-sm sm:px-6">
            <div className="pointer-events-none absolute inset-0 opacity-15" style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "76px 100%" }} />
            <div className="absolute -right-8 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full border-[10px] border-white/15" />
            <div className="relative flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.back()} className="h-9 w-9 text-white hover:bg-white/10 hover:text-white"><ArrowLeft className="h-4 w-4" /></Button><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15"><GraduationCap className="h-5 w-5" /></div><div><h1 className="text-xl font-bold sm:text-2xl">Create exam</h1><p className="text-[13px] font-medium text-blue-100">Add dates now, then configure subjects by standard.</p></div></div>
        </header>
        <Card className="border-0 shadow-lg"><CardContent className="p-5 sm:p-7"><Form {...form}><form onSubmit={form.handleSubmit(submit)} className="space-y-6">
            <FormField control={form.control} name="title" render={({ field }) => <FormItem><FormLabel>Exam name</FormLabel><FormControl><Input autoFocus placeholder="Example: First term examination 2026–27" {...field} /></FormControl><FormMessage /></FormItem>} />
            <div className="grid gap-5 sm:grid-cols-2">
                <FormField control={form.control} name="start_date" render={({ field }) => <FormItem><FormLabel>Start date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={form.control} name="end_date" render={({ field }) => <FormItem><FormLabel>End date <span className="font-normal text-muted-foreground">(optional)</span></FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>} />
            </div>
            <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button><Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create and add subjects</Button></div>
        </form></Form></CardContent></Card>
    </div>
}
