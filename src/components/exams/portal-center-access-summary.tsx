import type { PortalData } from '@/lib/exam-portal'
import { Button } from '@/components/ui/button'

export default function PortalCenterAccessSummary({ data, onManage }: { data: PortalData; onManage: () => void }) {
    const available = data.centers.filter(center => center.has_passcode)
    return <section aria-labelledby="center-access-heading" className="rounded-xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="center-access-heading" className="font-bold">Center access</h2>
            <Button type="button" variant="outline" size="sm" onClick={onManage}>Manage center passcodes</Button>
        </div>
        <p className="mt-3 text-sm text-slate-600">You can open examiner access at any time. Only centers with generated passcodes appear on the examiner login page.</p>
        {available.length ? <>
            <p className="mt-3 text-sm font-semibold text-emerald-900">{available.length} of {data.centers.length} centers available for sign in</p>
            <div className="mt-3 flex flex-wrap gap-2">{available.map(center => <span key={center.id} className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800">Center {center.code}</span>)}</div>
        </> : <p className="mt-3 text-sm text-slate-500">No center passcodes have been generated yet. Generate a passcode for any center you want to make available.</p>}
    </section>
}
