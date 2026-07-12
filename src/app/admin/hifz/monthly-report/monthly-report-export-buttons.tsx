"use client"

import { useState } from "react"
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import api from "@/lib/api"

type ExportStudent = {
    adm_no: string
    name: string
    standard: string
    hifz_pages: number
    recent_days: number
    juz_revision: number
    pointClassDays?: number
    grade: string
    attendance: string
    usthad_name: string
    attendedClasses?: number
    notAttendedClasses?: number
    cancelledClasses?: number
}

type Props = {
    month: string
    students: ExportStudent[]
    search: string
    standard: string
    usthad: string
}

function attendanceText(student: ExportStudent) {
    if (
        student.attendedClasses === undefined &&
        student.notAttendedClasses === undefined &&
        student.cancelledClasses === undefined
    ) return student.attendance

    const parts = [
        `${student.attendedClasses || 0} attended`,
        `${student.notAttendedClasses || 0} not attended`,
    ]
    if ((student.cancelledClasses || 0) > 0) parts.push(`${student.cancelledClasses} cancelled`)
    return parts.join(", ")
}

export function MonthlyReportExportButtons({ month, students, search, standard, usthad }: Props) {
    const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)

    async function download(format: "excel" | "pdf") {
        setExporting(format)
        try {
            const response = await api.post(`/hifz/monthly-reports/export/${format}`, {
                month,
                filters: {
                    search: search.trim() || undefined,
                    standard: standard === "all" ? undefined : standard,
                    usthad: usthad === "all" ? undefined : usthad,
                },
                rows: students.map(student => ({
                    adm_no: student.adm_no,
                    name: student.name,
                    standard: student.standard,
                    hifz_pages: student.hifz_pages,
                    recent_days: student.recent_days,
                    juz_revision: student.juz_revision,
                    point_days: student.pointClassDays ?? 0,
                    grade: student.grade,
                    attendance: attendanceText(student),
                    usthad_name: student.usthad_name,
                })),
            }, { responseType: "blob" })

            const extension = format === "excel" ? "xlsx" : "pdf"
            const url = window.URL.createObjectURL(response.data)
            const link = document.createElement("a")
            link.href = url
            link.download = `hifz-monthly-report-${month}.${extension}`
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
        } catch (error) {
            console.error(`Failed to export ${format} report:`, error)
            alert(`Failed to export the ${format === "excel" ? "Excel" : "PDF"} report.`)
        } finally {
            setExporting(null)
        }
    }

    return (
        <>
            <Button
                variant="outline"
                onClick={() => download("excel")}
                disabled={students.length === 0 || exporting !== null}
                className="gap-2"
            >
                {exporting === "excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-emerald-600" />}
                Excel
            </Button>
            <Button
                variant="outline"
                onClick={() => download("pdf")}
                disabled={students.length === 0 || exporting !== null}
                className="gap-2"
            >
                {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-rose-600" />}
                PDF
            </Button>
        </>
    )
}
