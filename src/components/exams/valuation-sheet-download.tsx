"use client"

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type PortalData, errorMessage } from '@/lib/exam-portal'

export default function ValuationSheetDownload({data, download}:{data:PortalData;download:(center:string,mode:string)=>Promise<void>}) {
    const [center,setCenter] = useState('')
    const [mode,setMode] = useState('saved')
    const [busy,setBusy] = useState(false)
    const [error,setError] = useState('')
    async function save() {
        setBusy(true); setError('')
        try { await download(center,mode) } catch(e) { setError(errorMessage(e)) } finally { setBusy(false) }
    }
    return <section className="rounded-xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="font-bold">Download center valuation sheets</h2>
        <p className="mt-2 text-sm text-slate-600">Excel sheets with student details, Juz, individual question marks, automatic totals, examiner name and signature space. Each center has its own sheet.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <select aria-label="Valuation sheet center" disabled={busy} className="h-10 min-w-0 rounded-md border bg-white px-3 text-sm" value={center} onChange={e=>setCenter(e.target.value)}><option value="">All centers</option>{data.centers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select aria-label="Valuation sheet marks" disabled={busy} className="h-10 min-w-0 rounded-md border bg-white px-3 text-sm" value={mode} onChange={e=>setMode(e.target.value)}><option value="saved">Include saved marks</option><option value="blank">Blank marking sheets</option></select>
            <Button variant="outline" disabled={busy||!data.centers.length} onClick={()=>void save()}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Download className="mr-2 h-4 w-4"/>}Download valuation Excel</Button>
        </div>
        {error&&<p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    </section>
}
