"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MessageCircle, Pause, RefreshCw, Send, ShieldCheck } from "lucide-react"
import api from "@/lib/api"

type Settings = { enabled: boolean; sender_id: string | null; production_started_at: string | null; hourly_limit: number; daily_limit: number; min_interval_seconds: number; max_age_hours: number }
type Sender = { id: string; displayName: string; phone: string; status: string; liveStatus: string; cap: number; used: number; remaining: number; coldCap: number; coldUsed: number }
type Readiness = { migration_ready: boolean; control_mode: boolean; production_environment_ready: boolean; cevox_configured: boolean; test_recipient_configured: boolean; test_recipient_hint: string }
type Dashboard = { settings: Settings; provider: { numbers: Sender[]; policy: { inQuietHours: boolean; quietHours: string | null; perContactHourly: number } } | null; provider_error: string | null;
  usage: { sent_today: number; hourly_reserved: number; daily_reserved: number }; queue: { status: string; count: number }[];
  recent: { id: string; kind: string; status: string; error_code: string | null; created_at: string }[];
  audit: { actor_id: string; action: string; details: Record<string, unknown>; created_at: string }[] }

const dateText = (value: string | null) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Not activated yet"
const errorText = (error: unknown) => {
  const result = error as { response?: { data?: { error?: string } } }
  return (result.response?.data?.error || "Unable to reach the notification service").replaceAll("_", " ")
}
const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"

export default function WhatsAppNotificationsPage() {
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [draft, setDraft] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [loaded, setLoaded] = useState(false)
  const testRequest = useRef<string | null>(null)
  const [testBlocked, setTestBlocked] = useState(false)
  const refresh = useCallback(async (resetDraft = false) => {
    try {
      const response = await api.get("/whatsapp-admin")
      setDashboard(response.data)
      if (resetDraft) setDraft(response.data.settings)
    } catch (reason) { setError(errorText(reason)) }
  }, [])

  useEffect(() => {
    api.get("/whatsapp-admin/session")
      .then(response => setReadiness(response.data))
      .then(() => refresh(true))
      .catch(reason => setError(errorText(reason)))
      .finally(() => setLoaded(true))
  }, [refresh])

  useEffect(() => {
    if (!dashboard) return
    const poll = setInterval(() => { void refresh() }, 30_000)
    return () => clearInterval(poll)
  }, [dashboard, refresh])

  const save = async (enabled: boolean) => {
    if (!draft) return
    if (enabled && !window.confirm("Enable notifications only for new eligible leaves? Historical leaves and R999 are excluded. Messages may start immediately if the launch cutoff already exists.")) return
    setBusy(true); setError(""); setNotice("")
    try {
      await api.put("/whatsapp-admin", { ...draft, enabled })
      await refresh(true)
      setNotice(enabled ? "Sending enabled. The original launch cutoff is preserved." : "Settings saved. Parent sending remains paused.")
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  const pause = async () => {
    setBusy(true); setError("")
    try {
      await api.post("/whatsapp-admin/pause")
      await refresh(true)
      setNotice("Sending paused. A message already submitted to WhatsApp cannot be recalled. New leaves during the pause will not be queued.")
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  const test = async () => {
    if (!window.confirm(`Send the departure template preview for R999 only to the configured test number ${readiness?.test_recipient_hint}? No other parents are targeted.`)) return
    setBusy(true); setError(""); setNotice("")
    testRequest.current ||= crypto.randomUUID()
    try {
      const response = await api.post("/whatsapp-admin/test", { request_id: testRequest.current }, { timeout: 95_000 })
      setTestBlocked(true)
      setNotice(response.data.status === "api_accepted" ? "Cevox accepted the R999 test. Confirm delivery on your phone." : `Test outcome: ${response.data.status}. Do not resend until reviewed.`)
      await refresh()
    } catch (reason) {
      setTestBlocked(true)
      setError(`${errorText(reason)}. Check recent attempts before trying again; delivery may be uncertain.`)
    } finally { setBusy(false) }
  }

  const connected = dashboard?.provider?.numbers.filter(number => number.status === "connected" && number.liveStatus === "connected") || []
  const selected = dashboard?.provider?.numbers.find(number => number.id === (draft?.sender_id || dashboard.settings.sender_id))
  const canEnable = readiness?.control_mode && readiness.production_environment_ready && !!dashboard?.provider && !!draft?.sender_id
  const queueCount = (status: string) => dashboard?.queue.find(item => item.status === status)?.count || 0

  return <div className="mx-auto max-w-6xl space-y-6 text-slate-900 dark:text-slate-100">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold">WhatsApp Notifications</h1><p className="mt-1 text-sm text-slate-500">Admin-only controls for Ribathul Quran student departures and arrivals.</p></div>
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm text-emerald-700"><ShieldCheck size={17} /> Admin restricted</span>
    </header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">{notice}</div>}
    {!loaded && <p>Checking admin access…</p>}
    {readiness && (!readiness.migration_ready || !readiness.cevox_configured || !readiness.control_mode) &&
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <h2 className="font-bold">One-time backend setup required</h2>
        <ul className="mt-2 list-inside list-disc space-y-1">
          {!readiness.migration_ready && <li>Apply the WhatsApp admin-controls database migration.</li>}
          {!readiness.cevox_configured && <li>Configure the server-side Cevox control API key for the same workspace as n8n.</li>}
          {!readiness.control_mode && <li>Enable backend admin-control mode. Its database switch starts paused.</li>}
        </ul><p className="mt-2">Never paste API keys or webhook secrets into this page.</p>
      </section>}
    {dashboard && draft && <>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <div><h2 className="font-bold">Parent sending: {!readiness?.control_mode ? "Admin controls not configured" : dashboard.settings.enabled && readiness.production_environment_ready ? "Enabled" : "Paused / blocked"}</h2>
          <p className="mt-1 text-sm text-slate-500">Launch cutoff: {dateText(dashboard.settings.production_started_at)} · Historical leaves and R999 are excluded.</p></div>
        <div className="flex gap-2"><button className={`${buttonClass} bg-slate-100 text-slate-700`} onClick={() => void refresh()} disabled={busy}><RefreshCw size={16} /> Refresh</button>
          <button className={`${buttonClass} bg-red-50 text-red-700`} onClick={pause} disabled={busy || !readiness?.control_mode}><Pause size={16} /> Pause sending</button></div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[['Sent today (ERP)', dashboard.usage.sent_today], ['Pending', queueCount('pending')], ['Failed', queueCount('failed')], ['Uncertain', queueCount('uncertain')]].map(([label, value]) =>
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>)}
      </section>
      <section className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 lg:grid-cols-2 dark:border-slate-800 dark:bg-slate-950">
        <div><h2 className="mb-4 flex items-center gap-2 font-bold"><MessageCircle size={20} /> Sender and limits</h2>
          {dashboard.provider_error && <p className="mb-3 text-sm text-red-700">Cevox: {dashboard.provider_error.replaceAll('_', ' ')}. Enable and test remain unavailable.</p>}
          <label className="text-sm font-medium" htmlFor="sender">Connected sending number</label>
          <select id="sender" className={`${fieldClass} mt-2`} value={draft.sender_id || ''} disabled={busy || dashboard.settings.enabled} onChange={event => setDraft({ ...draft, sender_id: event.target.value })}>
            <option value="">Select a connected number</option>
            {draft.sender_id && !connected.some(number => number.id === draft.sender_id) && <option value={draft.sender_id}>Saved sender unavailable / disconnected</option>}
            {connected.map(number => <option key={number.id} value={number.id}>{number.displayName} · +{number.phone.replace(/^\+/, '')}</option>)}
          </select><p className="mt-2 text-xs text-slate-500">Pause before switching. The original production cutoff never resets.</p>
          <div className="mt-4 grid grid-cols-2 gap-4">{([
            ['hourly_limit', 'App hourly allowance', 1, 500], ['daily_limit', 'App daily allowance', 1, 2000],
            ['min_interval_seconds', 'Gap between sends (seconds)', 20, 3600], ['max_age_hours', 'Expire messages after (hours)', 1, 48],
          ] as const).map(([field, label, minimum, maximum]) => <label key={field} className="text-sm">{label}<input className={`${fieldClass} mt-2`} type="number" min={minimum} max={maximum} step={1} value={draft[field]} disabled={busy} onChange={event => setDraft({ ...draft, [field]: Number(event.target.value) })} /></label>)}</div>
          <div className="mt-5 flex flex-wrap gap-3"><button className={`${buttonClass} bg-slate-100 text-slate-700`} disabled={busy || !draft.sender_id || !dashboard.provider} onClick={() => void save(false)}>Save paused</button>
            <button className={`${buttonClass} bg-emerald-600 text-white`} disabled={busy || !canEnable} onClick={() => void save(true)}>Save and enable</button></div>
          {!readiness?.production_environment_ready && <p className="mt-3 text-sm text-amber-700">Backend production readiness is off. The page cannot override that safety switch.</p>}
        </div>
        <div className="space-y-4"><h2 className="font-bold">Capacity and safe testing</h2>
          <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900"><p>ERP hourly reserved: {dashboard.usage.hourly_reserved} / {dashboard.settings.hourly_limit}</p><p>ERP daily reserved: {dashboard.usage.daily_reserved} / {dashboard.settings.daily_limit} (Indian calendar day)</p>
            <p className="mt-2 text-xs text-slate-500">Uncertain and in-flight attempts count against the allowance to prevent accidental repeat sends.</p></div>
          {selected && <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900"><p>Cevox daily usage: {selected.used} / {selected.cap} · Remaining: {selected.remaining}</p><p>First-contact usage: {selected.coldUsed} / {selected.coldCap}</p><p>Per-parent hourly ceiling: {dashboard.provider?.policy.perContactHourly}</p><p className="mt-2 text-xs">Cevox reports its own provider-day totals (UTC). These limits cannot be overridden here.</p></div>}
          {dashboard.provider?.policy.inQuietHours && <p className="text-sm text-amber-700">Cevox quiet hours are active ({dashboard.provider.policy.quietHours}). Messages wait.</p>}
          <p className="text-sm text-slate-500">Institutional leave days use the persistent queue, not simultaneous sends. Expired departure notifications or departures already followed by a recorded return are skipped.</p>
          <button className={`${buttonClass} bg-blue-600 text-white`} disabled={busy || testBlocked || !dashboard.settings.sender_id || !dashboard.provider || !readiness?.test_recipient_configured || draft.sender_id !== dashboard.settings.sender_id} onClick={test}><Send size={16} /> Send R999 test only</button>
          <p className="text-xs text-slate-500">One fixed-template preview to the backend-configured test number {readiness?.test_recipient_hint}. Save the sender first. This does not enable parent sending.</p>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"><h2 className="font-bold">Recent attempts</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Time (India)</th><th>Type</th><th>Outcome</th><th>Reason</th></tr></thead><tbody>{dashboard.recent.map(attempt => <tr key={attempt.id} className="border-b border-slate-100"><td className="p-2">{dateText(attempt.created_at)}</td><td>{attempt.kind}</td><td>{attempt.status}</td><td>{attempt.error_code?.replaceAll('_', ' ') || '—'}</td></tr>)}</tbody></table>{!dashboard.recent.length && <p className="py-3 text-slate-500">No portal-controlled attempts yet.</p>}</div><p className="mt-3 text-xs text-slate-500">API acceptance is not proof of delivery. Uncertain attempts require review and are not automatically resent.</p></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"><h2 className="font-bold">Control audit history</h2><ul className="mt-3 space-y-2 text-sm text-slate-500">{dashboard.audit.map((entry, index) => <li key={index}>{dateText(entry.created_at)} · {entry.action.replaceAll('_', ' ')} · Admin {entry.actor_id}</li>)}</ul></section>
      <p className="text-sm text-slate-500">Out-Campus, Outdoor and Institutional → Outside Campus departures and actual returns are eligible. On-Campus and Institutional → Inside Campus leaves are excluded.</p>
    </>}
  </div>
}
