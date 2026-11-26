"use client"

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, GraduationCap, Loader2, LockKeyhole, LogOut, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { portalRequest, PortalRequestError as RequestError } from '@/lib/exam-portal-request'
import { errorMessage, studentStatus, type PortalStudent, type PortalSubject, type Valuation } from '@/lib/exam-portal'

type Center = { code: string; name: string; examiner_name: string; locked: boolean; is_active: boolean }
type AvailableCenter = { code: string; name: string }
type Roster = { center: Center; students: PortalStudent[]; subjects: PortalSubject[]; valuations: Valuation[] }
type EntryData = { exam: { title: string; portal_enabled: boolean; is_active: boolean }; authenticated: boolean; centers?: AvailableCenter[]; roster?: Roster }
export default function ExaminerPortal({ slug }: { slug: string }) {
    const [exam, setExam] = useState<{ title: string; portal_enabled: boolean; is_active: boolean } | null>(null)
    const [availableCenters, setAvailableCenters] = useState<AvailableCenter[]>([])
    const [roster, setRoster] = useState<Roster | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const [center, setCenter] = useState('')
    const [passcode, setPasscode] = useState('')
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState('all')
    const [selected, setSelected] = useState<{ student: PortalStudent; subject: PortalSubject } | null>(null)
    const [marks, setMarks] = useState<string[]>([])
    const [juz, setJuz] = useState('')
    const [remarks, setRemarks] = useState('')
    const [version, setVersion] = useState(0)
    const [confirmed, setConfirmed] = useState(false)
    const [dirty, setDirty] = useState(false)
    const request = useCallback(<T,>(path: string, body?: unknown) => portalRequest<T>(`/api/exam-portal/${encodeURIComponent(slug)}${path}`, body), [slug])
    const loadRoster = useCallback(async () => {
        try { setRoster(await request<Roster>('/roster')) }
        catch (e) { if (e instanceof RequestError && e.status === 401) setRoster(null); else throw e }
    }, [request])
    const loadPublicExam = useCallback(async () => {
        const data = await request<EntryData>('/bootstrap')
        const centers: AvailableCenter[] = data.centers || []
        setExam(data.exam); setAvailableCenters(centers); setRoster(data.authenticated ? data.roster || null : null)
        setCenter(current => centers.some(item => item.code === current) ? current : '')
    }, [request])
    useEffect(() => {
        let active = true
        async function load() {
            try { await loadPublicExam() }
            catch (e) { if (active) setError(errorMessage(e)) }
            finally { if (active) setLoading(false) }
        }
        void load(); return () => { active = false }
    }, [loadPublicExam])
    // Keep already-open centers in sync with transfers and administrator resets.
    useEffect(() => {
        if (!roster || busy) return
        let active = true
        async function refreshAssignments() {
            try {
                const fresh: Roster = await request<Roster>('/roster')
                if (!active) return
                setRoster(fresh)
                if (selected) {
                    const assigned = fresh.students.find(student => student.student_id === selected.student.student_id)
                    if (!assigned || (assigned.mark_revision || 0) !== (selected.student.mark_revision || 0)) {
                        setSelected(null); setDirty(false)
                        setNotice(assigned ? 'Administration reset this student’s marks. Open the student again to start with blank marks.' : 'This student was transferred to another center. The assigned student list has been updated.')
                    }
                }
            } catch (e) {
                if (active && e instanceof RequestError && e.status === 401) { setRoster(null); setSelected(null); setDirty(false); setError(e.message) }
            }
        }
        const timer = window.setInterval(() => void refreshAssignments(), 10000)
        const onFocus = () => void refreshAssignments()
        window.addEventListener('focus', onFocus)
        return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
    }, [roster, busy, request, selected])
    useEffect(() => {
        if (!dirty) return
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
        window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn)
    }, [dirty])
    async function login(event: React.FormEvent) {
        event.preventDefault()
        if (!center || !availableCenters.some(item => item.code === center)) return setError('Choose an available exam center.')
        setBusy(true); setError('')
        try { const data = await request<EntryData>('/login', { center, passcode }); if (!data.roster) throw new Error('Unable to open your center. Please try again.'); setPasscode(''); setExam(data.exam); setRoster(data.roster) }
        catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
    }
    async function refreshLogin() {
        setBusy(true); setError(''); setPasscode('')
        try { await loadPublicExam() }
        catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
    }
    function open(student: PortalStudent, subject: PortalSubject) {
        const value = roster?.valuations.find(v => v.student_id === student.student_id && v.subject_id === subject.id)
        setSelected({ student, subject }); setMarks(Array.from({ length: subject.question_count || 0 }, (_, i) => value?.marks[i] == null ? '' : String(value.marks[i])))
        setJuz(value?.juz || ''); setRemarks(value?.remarks || ''); setVersion(value?.version || 0); setConfirmed(false); setDirty(false); setError(''); setNotice('')
    }
    function back() { if (!dirty || window.confirm('Discard the unsaved changes?')) { setSelected(null); setDirty(false); setError(''); void loadRoster().catch(e => setError(errorMessage(e))) } }
    async function save(submit: boolean) {
        if (!selected || !roster) return
        const max = selected.subject.question_max || 10
        if (marks.some(v => v !== '' && (!/^\d+$/.test(v) || Number(v) > max))) return setError(`Use whole numbers from 0 to ${max}.`)
        if (submit && (marks.some(v => v === '') || !juz.trim() || !confirmed)) return setError('Enter the Juz, complete every question and confirm your valuation.')
        if (submit && !window.confirm('Submit and lock this valuation? Changes will require an administrator to reopen it.')) return
        setBusy(true); setError(''); setNotice('')
        try {
            const data = await request<{ valuation: Valuation }>('/valuation', { student_id: selected.student.student_id, subject_id: selected.subject.id, mark_revision: selected.student.mark_revision || 0, marks: marks.map(v => v === '' ? null : Number(v)), juz, remarks, version, status: submit ? 'submitted' : 'draft', confirmed })
            setVersion(data.valuation.version); setDirty(false)
            setRoster(current => current ? { ...current, valuations: [...current.valuations.filter(v => !(v.student_id === selected.student.student_id && v.subject_id === selected.subject.id)), data.valuation] } : current)
            setNotice(submit ? 'Valuation submitted. The result is now available to the administration.' : 'Draft saved. You can return and continue later.')
        } catch (e) { setError(errorMessage(e)); if (e instanceof RequestError && e.status === 401) { setSelected(null); setRoster(null) } }
        finally { setBusy(false) }
    }
    const saved = roster?.valuations.find(v => v.student_id === selected?.student.student_id && v.subject_id === selected?.subject.id)
    const readOnly = busy || saved?.status === 'submitted' || roster?.center.locked || !roster?.center.is_active
    const submitted = roster?.students.filter(s => studentStatus(s, roster.subjects, roster.valuations) === 'submitted').length || 0
    return <main className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6"><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-800 p-2.5 text-white"><GraduationCap className="h-6 w-6" /></div><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Ribathul Quran · Examination</p><h1 className="text-lg font-bold sm:text-xl">{exam?.title || 'Examiner portal'}</h1></div></div>{roster && <Button variant="ghost" disabled={busy} onClick={async () => { if (dirty && !confirm('Discard unsaved changes and sign out?')) return; setBusy(true); try { await request('/logout', {}); setRoster(null); setSelected(null); setDirty(false); setNotice(''); await loadPublicExam() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }}><LogOut className="mr-2 h-4 w-4" />Sign out</Button>}</div></header>
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
            {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}{selected && <button className="ml-3 underline" disabled={busy} onClick={async () => { if (dirty && !confirm('Reload and discard unsaved changes?')) return; try { const fresh = await request<Roster>('/roster'); setRoster(fresh); const value = fresh.valuations.find((v: Valuation) => v.student_id === selected.student.student_id && v.subject_id === selected.subject.id); setMarks(Array.from({ length: selected.subject.question_count || 0 }, (_, i) => value?.marks[i] == null ? '' : String(value.marks[i]))); setJuz(value?.juz || ''); setRemarks(value?.remarks || ''); setVersion(value?.version || 0); setConfirmed(false); setDirty(false); setError('') } catch (e) { setError(errorMessage(e)) } }}>Reload saved marks</button>}</div>}
            {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</div>}
            {loading ? <div className="flex justify-center py-24"><Loader2 className="animate-spin" aria-label="Loading exam" /></div> : !roster ? <section className="mx-auto mt-6 max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8"><LockKeyhole className="mb-4 h-8 w-8 text-emerald-800" /><h2 className="text-2xl font-bold">Examiner sign in</h2><p className="mt-2 text-sm leading-6 text-slate-500">Select your exam center and enter the passcode provided by the examination office.</p>
                {exam?.portal_enabled ? availableCenters.length ? <form onSubmit={login} className="mt-6 space-y-5">
                    <div className="space-y-2"><Label htmlFor="center-code">Exam center</Label><select id="center-code" autoComplete="username" value={center} onChange={e => { setCenter(e.target.value); setPasscode('') }} required disabled={busy} className="h-12 w-full rounded-md border border-input bg-white px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"><option value="">Choose your center</option>{availableCenters.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></div>
                    <div className="space-y-2"><Label htmlFor="exam-passcode">Passcode</Label><Input id="exam-passcode" type="password" autoComplete="current-password" value={passcode} onChange={e => setPasscode(e.target.value)} maxLength={128} required disabled={busy} className="h-12" /></div>
                    <Button className="h-12 w-full bg-emerald-800 hover:bg-emerald-900" disabled={busy || !center || !passcode}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Open my center</Button>
                </form> : <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">The portal is open. No centers have a generated passcode yet. Please contact the examination office or refresh after your passcode is issued.</p> : <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{exam ? 'This portal has not been opened. Please contact the examination office.' : 'Check the exam link and try again.'}</p>}
                <Button type="button" variant="outline" className="mt-4 w-full" disabled={busy} onClick={() => void refreshLogin()}><RefreshCw className="mr-2 h-4 w-4" />Refresh available centers</Button><Link className="mt-7 block text-center text-xs text-slate-500 underline" href={`/hifz/exam/${encodeURIComponent(slug)}/administration`}>Examination administration</Link></section> : selected ? <section>
                <Button variant="ghost" onClick={back} disabled={busy} className="mb-3 -ml-3"><ArrowLeft className="mr-2 h-4 w-4" />All assigned students</Button>
                <div className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="border-b bg-emerald-50 p-5 sm:p-6"><p className="text-sm text-emerald-800">{roster.center.name} · SL {selected.student.serial_no} · {selected.student.student_id}</p><h2 className="mt-1 text-2xl font-bold">{selected.student.student_name}</h2><p className="mt-1 text-sm text-slate-600">{selected.student.standard} · {selected.subject.name} · Examiner: {roster.center.examiner_name}</p></div>
                    <div className="space-y-6 p-5 sm:p-6">{(saved?.status === 'submitted' || roster.center.locked || !roster.center.is_active) && <p className="rounded-lg bg-slate-100 p-3 text-sm"><LockKeyhole className="mr-2 inline h-4 w-4" />{saved?.status === 'submitted' ? 'Submitted and locked. Contact administration for corrections.' : 'Mark entry is currently locked.'}{saved?.submitted_at && ` Submitted ${new Date(saved.submitted_at).toLocaleString()}`}</p>}
                        <div className="max-w-sm space-y-2"><Label htmlFor="juz">Juz / portion examined</Label><Input id="juz" value={juz} maxLength={120} disabled={readOnly} placeholder="For example, Juz 1–5" onChange={e => { setJuz(e.target.value); setDirty(true) }} /></div>
                        <div><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Question marks</h3><span className="text-sm text-slate-500">Whole numbers, 0–{selected.subject.question_max} each</span></div><div className="grid grid-cols-2 gap-3 min-[400px]:grid-cols-3 sm:grid-cols-5">{marks.map((mark, index) => <div key={index} className="rounded-xl border bg-slate-50 p-3"><Label htmlFor={`q${index}`} className="mb-2 block text-xs text-slate-600">Question {index + 1}</Label><Input id={`q${index}`} type="number" inputMode="numeric" min={0} max={selected.subject.question_max || 10} step={1} value={mark} disabled={readOnly} onChange={e => { setMarks(current => current.map((v, i) => i === index ? e.target.value : v)); setDirty(true) }} className="h-12 bg-white text-center text-xl font-bold" /></div>)}</div></div>
                        <div className="flex items-center justify-between rounded-xl bg-emerald-900 p-4 text-white"><div><p className="font-medium">{marks.every(m => m !== '') ? 'Total marks' : 'Partial total'}</p><p className="text-xs text-emerald-100">{marks.filter(m => m !== '').length} of {marks.length} questions entered</p></div><p className="text-3xl font-bold">{marks.every(m => m === '') ? '—' : marks.reduce((n, m) => n + (Number(m) || 0), 0)}<span className="ml-1 text-base font-normal text-emerald-100">/ {selected.subject.max_marks}</span></p></div>
                        <div className="space-y-2"><Label htmlFor="remarks">Remarks (optional)</Label><Textarea id="remarks" value={remarks} maxLength={2000} disabled={readOnly} onChange={e => { setRemarks(e.target.value); setDirty(true) }} /></div>
                        {saved?.status !== 'submitted' && <><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={confirmed} disabled={readOnly} onChange={e => setConfirmed(e.target.checked)} className="mt-1 h-4 w-4 accent-emerald-800" /><span>I, {roster.center.examiner_name || 'the examiner'}, confirm these marks are correct. Final submission locks this valuation.</span></label><div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:justify-end"><Button variant="outline" className="h-12" disabled={readOnly} onClick={() => void save(false)}>Save draft</Button><Button className="h-12 bg-emerald-800 hover:bg-emerald-900" disabled={readOnly || !confirmed || !juz.trim() || marks.some(m => m === '')} onClick={() => void save(true)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Submit valuation</Button></div></>}
                    </div></div>
            </section> : <section>
                <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-800">{roster.center.name}</p><h2 className="mt-1 text-2xl font-bold text-emerald-950">{roster.center.examiner_name || 'Examiner'}</h2><p className="mt-2 text-sm text-slate-500">Your assigned students</p><p className="mt-1 text-sm text-slate-500">{submitted} of {roster.students.length} completed</p></div><div className="text-sm text-slate-500">Drafts are saved until you return.</div></div>
                {(!roster.center.is_active || roster.center.locked) && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Mark entry is locked. You can still view saved valuations.</p>}
                <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${roster.students.length ? submitted / roster.students.length * 100 : 0}%` }} /></div>
                <div className="mb-4 flex flex-wrap gap-3"><div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input aria-label="Search students" className="bg-white pl-9" placeholder="Search name or admission number" value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="Filter by status" className="rounded-md border bg-white px-3 text-sm" value={filter} onChange={e => setFilter(e.target.value)}>{['all', 'pending', 'draft', 'submitted'].map(v => <option key={v} value={v}>{v === 'all' ? 'All students' : v.charAt(0).toUpperCase() + v.slice(1)}</option>)}</select><Button variant="outline" onClick={() => void loadRoster().catch(e => setError(errorMessage(e)))}>Refresh</Button></div>
                <div className="grid gap-3 sm:grid-cols-2">{roster.students.filter(s => `${s.student_id} ${s.student_name}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || studentStatus(s, roster.subjects, roster.valuations) === filter)).map(student => { const status = studentStatus(student, roster.subjects, roster.valuations); const subjects = roster.subjects.filter(s => s.standard === student.standard); return <article key={student.student_id} className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold">{student.serial_no}</span><div className="min-w-0 flex-1"><h3 className="font-bold">{student.student_name}</h3><p className="mt-1 text-xs text-slate-500">{student.student_id} · {student.standard}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${status === 'submitted' ? 'bg-emerald-50 text-emerald-700' : status === 'draft' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{status === 'submitted' ? 'Submitted' : status === 'draft' ? 'Draft' : 'Pending'}</span></div><div className="mt-4 flex flex-wrap gap-2">{subjects.length ? subjects.map(subject => <Button key={subject.id} variant="outline" className="h-10 flex-1 text-emerald-800" onClick={() => open(student, subject)}>{subject.name}{roster.valuations.some(v => v.student_id === student.student_id && v.subject_id === subject.id && v.status === 'submitted') && <CheckCircle2 className="ml-2 h-4 w-4" />}</Button>) : <p className="text-sm text-amber-800">No subject configured. Contact administration.</p>}</div></article> })}</div>
            </section>}
        </div><footer className="mx-auto max-w-5xl px-6 py-8 text-center text-xs text-slate-400">Ma&apos;din Ribathul Quran · Examination office</footer>
    </main>
}
