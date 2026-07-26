import { redirect } from "next/navigation"

// The monthly progress register is now the only Hifz recording workflow.
export default async function Page({ params }: { params: Promise<{ studentId: string }> }) {
    const { studentId } = await params
    redirect(`/staff/student/${studentId}?register=1`)
}
