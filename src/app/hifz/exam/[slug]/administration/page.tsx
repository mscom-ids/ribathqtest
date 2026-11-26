import StandaloneAdministration from '@/components/exams/standalone-administration'
export default async function Page({params}:{params:Promise<{slug:string}>}) {
    return <StandaloneAdministration slug={(await params).slug}/>
}
