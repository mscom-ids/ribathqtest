"use client"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Loader2, ArrowLeft, Save, Calendar as CalendarIcon, GraduationCap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import api from "@/lib/api"

const formSchema = z.object({
    title: z.string().min(2, "Title must be at least 2 characters"),
    start_date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid date"),
    end_date: z.string().optional().or(z.literal("")),
})

type FormValues = z.infer<typeof formSchema>

export default function CreateExamPage({ params }: { params: Promise<{ department: string }> }) {
    const { department } = use(params);
    const departmentName = department.charAt(0).toUpperCase() + department.slice(1);

    const router = useRouter()
    const [loading, setLoading] = useState(false)

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: "",
            start_date: new Date().toISOString().split('T')[0],
            end_date: "",
        },
    })

    async function onSubmit(values: FormValues) {
        setLoading(true)

        try {
            const res = await api.post("/exams", {
                title: values.title,
                department: departmentName, // Assign department automatically based on route
                type: departmentName,       // Temporary fallback to satisfy older database constraint
                start_date: values.start_date,
                end_date: values.end_date || null,
                is_active: true
            })

            if (!res.data.success) {
                alert("Error creating exam: " + res.data.error)
                setLoading(false)
            } else {
                router.push(`/admin/${department}/exams`)
            }
        } catch (error: any) {
            alert("Error creating exam: " + error.message)
            setLoading(false)
        }
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-10 w-10">
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                        Create New {departmentName} Examination
                    </h1>
                    <p className="text-muted-foreground mt-1">Schedule a new examination term for {departmentName}</p>
                </div>
            </div>

            {/* Form Card */}
            <Card className="border-none shadow-xl">
                <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 border-b">
                    <CardTitle className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <GraduationCap className="h-5 w-5 text-emerald-600" />
                        </div>
                        Examination Details
                    </CardTitle>
                    <CardDescription>Fill in the basic information for this examination</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                            {/* Exam Title */}
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-base font-semibold">Examination Title</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder={`e.g. Annual ${departmentName} Exam 2024`}
                                                {...field}
                                                className="h-12 text-base"
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Choose a clear, descriptive name for this examination
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Date Range */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField
                                    control={form.control}
                                    name="start_date"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-base font-semibold">Start Date</FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                                    <Input
                                                        type="date"
                                                        {...field}
                                                        className="h-12 pl-11 text-base"
                                                    />
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="end_date"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-base font-semibold">End Date <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                                    <Input
                                                        type="date"
                                                        {...field}
                                                        className="h-12 pl-11 text-base"
                                                    />
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-end gap-3 pt-6 border-t">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => router.back()}
                                    className="h-11 px-6"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    className="h-11 px-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/30"
                                    disabled={loading}
                                >
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Save className="mr-2 h-4 w-4" />
                                    Create Examination
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    )
}
