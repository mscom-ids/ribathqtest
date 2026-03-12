"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import api from "@/lib/api"

const admissionSchema = z.object({
  admitted_batch: z.string().optional(),
  admitted_course: z.string().optional(),
  status: z.string().optional(),
  admission_number: z.string().optional(),
  admitted_year: z.string().optional(),
  previous_institution: z.string().optional(),
  admission_date: z.string().optional(),
  admission_type: z.string().optional(),
  recommended: z.string().optional(),
})

export default function AdmissionDetailsTab({ studentId, initialData }: { studentId: string, initialData?: any }) {
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)

  const form = useForm<z.infer<typeof admissionSchema>>({
    resolver: zodResolver(admissionSchema),
    defaultValues: {
      admitted_batch: initialData?.admitted_batch || "",
      admitted_course: initialData?.admitted_course || "",
      status: initialData?.status || "Active",
      admission_number: initialData?.admission_number || "",
      admitted_year: initialData?.admitted_year || "",
      previous_institution: initialData?.previous_institution || "",
      admission_date: initialData?.admission_date || "",
      admission_type: initialData?.admission_type || "",
      recommended: initialData?.recommended || "No",
    },
  })

  async function onSubmit(values: z.infer<typeof admissionSchema>) {
    setLoading(true)
    try {
      const res = await api.put(`/students/${studentId}`, {
        comprehensive_details: { admission: values }
      })
      if (res.data.success) {
        alert("Admission details updated successfully")
        setEditing(false)
      } else {
        alert(`Failed to update: ${res.data.error}`)
      }
    } catch (error: any) {
      console.error("Error:", error)
      alert(`Update failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Ma'din Ribathul Qur'an College</CardTitle>
        <Button variant="outline" size="sm" onClick={() => editing ? form.handleSubmit(onSubmit)() : setEditing(true)}>
          {loading ? "Saving..." : editing ? "Save" : "Update"}
        </Button>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FormField control={form.control} name="admitted_batch" render={({ field }) => (
              <FormItem><FormLabel>Admitted Batch</FormLabel>
                <FormControl><Input disabled={!editing} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="admission_number" render={({ field }) => (
              <FormItem><FormLabel>Admission Number</FormLabel>
                <FormControl><Input disabled={!editing} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="admission_date" render={({ field }) => (
              <FormItem><FormLabel>Admission Date</FormLabel>
                <FormControl><Input type="date" disabled={!editing} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="admitted_course" render={({ field }) => (
              <FormItem><FormLabel>Admitted Course</FormLabel>
                <FormControl><Input disabled={!editing} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="admitted_year" render={({ field }) => (
              <FormItem><FormLabel>Admitted Year</FormLabel>
                <FormControl><Input disabled={!editing} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="admission_type" render={({ field }) => (
              <FormItem><FormLabel>Admission Type</FormLabel>
                <FormControl><Input disabled={!editing} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem><FormLabel>Status</FormLabel>
                <Select disabled={!editing} onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Graduated">Graduated</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="previous_institution" render={({ field }) => (
              <FormItem><FormLabel>Previous Institution</FormLabel>
                <FormControl><Input disabled={!editing} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="recommended" render={({ field }) => (
              <FormItem><FormLabel>Recommended</FormLabel>
                <Select disabled={!editing} onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
