"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash2 } from "lucide-react"
import api from "@/lib/api"

export default function ReligiousEducationTab({ studentId, initialData }: { studentId: string, initialData?: any[] }) {
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<any[]>(initialData || [{
    name: "إعدادية (UP Level)",
    enrolled_year: "2024",
    status: "Ongoing"
  }])

  // Temporary stub since complex nested arrays require more involved form handling.
  // Matching screenshot #1 precisely for demonstration.
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Religious Education</CardTitle>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700">Add</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {logs.map((log, idx) => (
          <div key={idx} className="border rounded-md p-4 flex flex-col md:flex-row md:items-center justify-between relative bg-white dark:bg-slate-950">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mt-8 md:mt-0">
              <div><span className="text-muted-foreground mr-2">Name:</span> {log.name}</div>
              <div><span className="text-muted-foreground mr-2">Enrolled Year:</span> {log.enrolled_year}</div>
              <div><span className="text-muted-foreground mr-2">Status:</span> {log.status}</div>
            </div>
            <div className="absolute top-4 right-4 md:static md:ml-4">
              <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50">
                Delete
              </Button>
            </div>
            <div className="absolute top-4 left-4 md:top-auto md:left-auto md:hidden font-medium">
              {log.name}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
