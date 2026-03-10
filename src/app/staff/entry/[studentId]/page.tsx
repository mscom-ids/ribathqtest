import { Suspense } from "react"
import DailyEntryForm from "@/components/staff/daily-entry-form"
import { Loader2 } from "lucide-react"

// In Next.js 16 App Router, params is a Promise
export default async function Page({ params }: { params: Promise<{ studentId: string }> }) {
    const { studentId } = await params

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <Suspense fallback={<div className="p-4 max-w-lg mx-auto flex justify-center items-center h-40"><Loader2 className="animate-spin text-emerald-500" /></div>}>
                <DailyEntryForm studentId={studentId} />
            </Suspense>
        </div>
    )
}
