import PortalAdministration from '@/components/exams/portal-administration'
export default async function Page({params}:{params:Promise<{id:string}>}) {
    const {id}=await params
    return <PortalAdministration examId={id}/>
}
