"use client"
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { LockKeyhole, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import dynamic from 'next/dynamic'
import type { PortalData } from '@/lib/exam-portal'
import { portalRequest } from '@/lib/exam-portal-request'
const PortalAdministration = dynamic(() => import('./portal-administration'), { loading: () => <p className="p-8 text-center">Opening examination administration…</p> })
type EntryData = { authenticated: boolean; data?: PortalData; exam?: { title: string } }
import { errorMessage } from '@/lib/exam-portal'

export default function StandaloneAdministration({ slug }: { slug: string }) {
    const [initialData, setInitialData] = useState<PortalData | null>(null)
    const [title, setTitle] = useState('Examination administration')
    const [state, setState] = useState('loading')
    const [passcode, setPasscode] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const base = `/api/exam-portal/${encodeURIComponent(slug)}/admin`
    const expired = useCallback(() => { setState('login'); setInitialData(null); setError('Enter this exam’s administration passcode to continue.') }, [])
    useEffect(() => {
        let active = true
        void portalRequest<EntryData>(`${base}/bootstrap`).then(entry => {
            if (!active) return
            if (entry.authenticated && entry.data) { setInitialData(entry.data); setTitle(entry.data.exam.title); setState('ready') }
            else { if (entry.exam) setTitle(entry.exam.title); setState('login') }
        }).catch(e => { if (active) { setError(errorMessage(e)); setState('login') } })
        return () => { active = false }
    }, [base])
    async function login(event: React.FormEvent) {
        event.preventDefault(); setBusy(true); setError('')
        try {
            const entry = await portalRequest<EntryData>(`${base}/login`, { passcode })
            if (!entry.data) throw new Error('Unable to open administration. Please try again.')
            setPasscode(''); setInitialData(entry.data); setTitle(entry.data.exam.title); setState('ready')
        } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
    }
    async function logout() {
        try { await portalRequest(`${base}/logout`, {}); setState('login'); setInitialData(null); setError('') }
        catch (e) { setError(errorMessage(e)) }
    }
    return <main className="min-h-screen bg-slate-50 text-slate-900">{state === 'ready' && initialData ? <PortalAdministration initialData={initialData} examId={initialData.exam.id} standalone portalSlug={slug} onExpired={expired} onSignOut={() => void logout()} /> : <div className="mx-auto max-w-md space-y-5 px-4 py-12">
        <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8"><LockKeyhole className="mb-4 h-8 w-8 text-emerald-800" /><h1 className="text-2xl font-bold">Examination administration</h1><p className="mt-2 text-sm font-semibold text-emerald-800">{title}</p>
            {state === 'loading' ? <p className="mt-5 text-sm">Checking exam access…</p> : <><p className="mt-3 text-sm leading-6 text-slate-500">Enter the administration passcode set for this exam.</p>{error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}<form onSubmit={login} className="mt-6 space-y-4"><div className="space-y-2"><Label htmlFor="exam-administration-passcode">Administration passcode</Label><Input id="exam-administration-passcode" type="password" autoComplete="current-password" required maxLength={72} value={passcode} disabled={busy} onChange={event => setPasscode(event.target.value)} className="h-12" /></div><Button disabled={busy || !passcode} className="h-12 w-full bg-emerald-800 hover:bg-emerald-900">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Open examination administration</Button></form><p className="mt-4 text-xs leading-5 text-slate-500">The institution administrator sets this passcode from the admin exam page.</p></>}
        </section><Link className="block text-center text-sm text-emerald-800 underline" href={`/hifz/exam/${encodeURIComponent(slug)}`}>Back to examiner sign in</Link>
    </div>}</main>
}
