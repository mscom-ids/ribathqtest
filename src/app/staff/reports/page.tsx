import UnifiedReportView from "@/components/reports/UnifiedReportView"

export const metadata = {
    title: "Student Progress Reports",
}

export default function StaffReportsPage() {
    return (
        <div className="p-4 md:p-6 lg:p-8">
            <UnifiedReportView />
        </div>
    )
}
