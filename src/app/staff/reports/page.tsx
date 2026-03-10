import { FileBarChart, Download, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function StaffReportsPage() {
    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Monthly Reports</h1>
                <p className="text-muted-foreground">Generate and view student progress reports.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card className="hover:shadow-md transition-shadow cursor-pointer border-slate-200 dark:border-slate-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Class Performance</CardTitle>
                        <FileBarChart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">February 2026</div>
                        <p className="text-xs text-muted-foreground">
                            +12.5% progress from last month
                        </p>
                        <Button className="w-full mt-4" variant="outline" size="sm">
                            <Download className="mr-2 h-4 w-4" /> Download PDF
                        </Button>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow cursor-pointer border-slate-200 dark:border-slate-800 opacity-60">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Monthly Attendance</CardTitle>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">January 2026</div>
                        <p className="text-xs text-muted-foreground">
                            Generated on Jan 31, 2026
                        </p>
                        <Button className="w-full mt-4" variant="outline" size="sm" disabled>
                            <Download className="mr-2 h-4 w-4" /> Archived
                        </Button>
                    </CardContent>
                </Card>

                <Card className="flex flex-col items-center justify-center p-6 border-dashed border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                    <div className="rounded-full bg-slate-100 p-3 mb-3 dark:bg-slate-800">
                        <FileText className="h-6 w-6 text-slate-400" />
                    </div>
                    <h3 className="text-sm font-medium mb-1">Coming Soon</h3>
                    <p className="text-xs text-muted-foreground text-center mb-4">More report types will be available soon.</p>
                </Card>
            </div>
        </div>
    )
}
