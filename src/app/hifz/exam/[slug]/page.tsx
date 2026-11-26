import ExaminerPortal from '@/components/exams/examiner-portal'
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    return <ExaminerPortal slug={slug} />
}
