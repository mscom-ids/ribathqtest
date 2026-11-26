"use client"
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { errorMessage } from '@/lib/exam-portal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
export default function AdministrationPasscodeSettings({ examId }: { examId: string }) {
    const [configured, setConfigured] = useState<boolean | null>(null)
    const [passcode, setPasscode] = useState('')
    const [generated, setGenerated] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    useEffect(() => { void api.get(`/exams/${examId}/portal/admin-passcode`).then(response => setConfigured(response.data.configured)).catch(e => setError(errorMessage(e))) }, [examId])
    async function save(generate: boolean) {
        if (configured && !confirm('Change this exam’s administration passcode? Signed-in exam administrators will need to sign in again.')) return
        setBusy(true); setError(''); setNotice(''); setGenerated('')
        try {
            const response = await api.post(`/exams/${examId}/portal/admin-passcode`, generate ? { generate: true } : { passcode })
            setConfigured(true); setPasscode(''); setGenerated(response.data.passcode || ''); setNotice('Administration passcode saved for this exam.')
        } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
    }
    return <section className="rounded-xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="font-bold">Examination administration passcode</h2>
        <p className="mt-2 text-sm text-slate-600">Set a separate passcode for the Examination administration link. It gives access to this exam only.</p>
        <p className="mt-2 text-sm font-medium text-emerald-800">{configured === null ? 'Checking passcode…' : configured ? 'Administration passcode configured' : 'No administration passcode set'}</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="mt-3 text-sm text-emerald-800">{notice}</p>}
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void save(false) }}><div className="min-w-48 flex-1"><Label htmlFor="administration-new-passcode">New administration passcode</Label><Input id="administration-new-passcode" className="mt-2" type="password" autoComplete="new-password" value={passcode} minLength={8} maxLength={72} required disabled={busy} onChange={event => setPasscode(event.target.value)} placeholder="At least 8 characters" /></div><Button disabled={busy || configured === null || passcode.trim().length < 8}>Set passcode</Button><Button type="button" variant="outline" disabled={busy || configured === null} onClick={() => void save(true)}>Generate passcode</Button></form>
        {generated && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold">New examination administration passcode</p><code className="mt-2 block select-all break-all text-lg">{generated}</code><p className="mt-2 text-xs text-amber-900">Shown only now. Copy and keep it privately.</p><Button variant="outline" className="mt-3" onClick={() => void navigator.clipboard.writeText(generated).then(() => setNotice('Administration passcode copied.')).catch(() => setError('Select and copy the passcode manually.'))}>Copy administration passcode</Button></div>}
    </section>
}
