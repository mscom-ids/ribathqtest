import { redirect } from "next/navigation"
export default async function LeadershipEntry({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  redirect(`/leadership/student/${encodeURIComponent(studentId)}?register=1`)
}
