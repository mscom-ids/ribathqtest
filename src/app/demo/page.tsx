"use client"

import { useState } from "react"
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  DollarSign,
  DoorOpen,
  FileText,
  GraduationCap,
  LayoutDashboard,
  MessageCircle,
  Moon,
  School,
  Search,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
} from "lucide-react"

type DemoView = "dashboard" | "students" | "hifz" | "attendance" | "leaves" | "reports" | "finance"

const navSections = [
  {
    label: "Main",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "students", label: "Students", icon: Users },
      { id: "attendance", label: "Attendance Dashboard", icon: ClipboardCheck },
      { id: "hifz", label: "Hifz Recording", icon: BookOpen },
      { id: "reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Management",
    items: [
      { id: "finance", label: "Finance", icon: DollarSign },
      { id: "leaves", label: "Leaves", icon: DoorOpen },
      { id: "dashboard", label: "Mentor Locks", icon: ShieldCheck },
      { id: "dashboard", label: "Chat", icon: MessageCircle },
    ],
  },
]

const stats = [
  { title: "Total Students", value: "348", sub: "On Campus : 312", subRight: "Out Campus : 36", icon: Users, tint: "bg-pink-50 text-pink-500" },
  { title: "Total Staff", value: "32", sub: "Active : 30", subRight: "Inactive : 02", icon: UserCheck, tint: "bg-blue-50 text-blue-500" },
  { title: "Total Alumni", value: "164", sub: "Completed : 151", subRight: "Dropout : 13", icon: GraduationCap, tint: "bg-orange-50 text-orange-500" },
  { title: "Fee Collection", value: "82%", sub: "Cleared : 286", subRight: "Pending : 62", icon: DollarSign, tint: "bg-emerald-50 text-emerald-500" },
]

const students = [
  { id: "RQ-1024", name: "Muhammad Fadil", className: "Hifz 4", mentor: "Usthad Saleem", status: "On campus", progress: "Juz 18" },
  { id: "RQ-1088", name: "Ahmed Rihan", className: "Madrasa 7", mentor: "Usthad Kareem", status: "On campus", progress: "92% attendance" },
  { id: "RQ-1162", name: "Abdul Hannan", className: "School 8", mentor: "Usthad Niyas", status: "Out campus", progress: "Term report ready" },
  { id: "RQ-1197", name: "Ibrahim Zayd", className: "Hifz 2", mentor: "Usthad Shafi", status: "On leave", progress: "Juz 06" },
]

const hifzRows = [
  ["Muhammad Fadil", "New sabaq", "Al-Mu'minun 1-18", "Excellent", "Recorded"],
  ["Ibrahim Zayd", "Revision", "Juz 06", "Needs repeat", "Follow-up"],
  ["Hamza Riyaz", "Daur", "Juz 12-13", "Steady", "Recorded"],
  ["Yusuf Ali", "New sabaq", "An-Nur 35-45", "Good", "Recorded"],
]

const leaveRows = [
  ["Abdul Hannan", "Out-campus", "Parent pickup", "Pending"],
  ["Muhsin CP", "Outdoor", "Medical visit", "Approved"],
  ["Rishad PK", "Institutional", "Competition", "Returned"],
]

function SideNav({ activeView, setActiveView }: { activeView: DemoView; setActiveView: (view: DemoView) => void }) {
  return (
    <aside className="hidden w-[324px] shrink-0 border-r border-slate-200 bg-white lg:block">
      <div className="border-b border-slate-200 p-5">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <img src="/logo.png" alt="Ribathul Quran" className="h-11 w-11 rounded-xl object-contain ring-1 ring-slate-100" />
          <div className="min-w-0">
            <p className="truncate text-[18px] font-black text-slate-800">Ribathul Quran</p>
            <p className="truncate text-sm font-medium text-slate-500">Demo Admin Portal</p>
          </div>
        </div>
      </div>

      <nav className="h-[calc(100vh-134px)] overflow-y-auto px-5 py-4">
        {navSections.map((section) => (
          <div key={section.label} className="mb-7">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-[13px] font-black uppercase tracking-[0.14em] text-slate-400">{section.label}</span>
              <span className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="space-y-2">
              {section.items.map(({ id, label, icon: Icon }) => {
                const isActive = activeView === id && !(id === "dashboard" && label !== "Dashboard")
                return (
                  <button
                    key={`${section.label}-${label}`}
                    type="button"
                    onClick={() => setActiveView(id as DemoView)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-extrabold transition ${
                      isActive ? "bg-[#eef4ff] text-[#1262ff]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? "text-[#1262ff]" : "text-slate-400"}`} />
                    <span className="flex-1">{label}</span>
                    <ChevronRight className={`h-4 w-4 ${isActive ? "text-[#1262ff]" : "text-slate-300"}`} />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}

function TopBar({ setActiveView }: { setActiveView: (view: DemoView) => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-[74px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative hidden w-full max-w-md sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value="Search demo records"
            readOnly
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-semibold text-slate-500 outline-none"
          />
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Demo mode, no password</span>
      </div>
      <div className="flex items-center gap-3">
        <button className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-500" type="button" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </button>
        <button className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-500" type="button" aria-label="Theme preview">
          <Moon className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => setActiveView("dashboard")} className="hidden items-center gap-3 sm:flex">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#06452f] text-sm font-black text-white">DU</span>
          <span className="text-left">
            <span className="block text-sm font-black text-slate-900">Demo User</span>
            <span className="block text-xs font-semibold text-slate-500">visitor@ribathul.demo</span>
          </span>
        </button>
      </div>
    </header>
  )
}

function MobileTabs({ activeView, setActiveView }: { activeView: DemoView; setActiveView: (view: DemoView) => void }) {
  const tabs = [
    { id: "dashboard", label: "Dash", icon: LayoutDashboard },
    { id: "students", label: "Students", icon: Users },
    { id: "hifz", label: "Hifz", icon: BookOpen },
    { id: "leaves", label: "Leaves", icon: DoorOpen },
    { id: "reports", label: "Reports", icon: FileText },
  ]
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setActiveView(id as DemoView)}
          className={`flex min-w-24 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-black ${
            activeView === id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

function StatCard({ stat }: { stat: (typeof stats)[number] }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className={`grid h-[84px] w-[84px] place-items-center rounded-[24px] ${stat.tint}`}>
          <stat.icon className="h-10 w-10" />
        </div>
        <div className="text-right">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-600">+1.2%</span>
          <strong className="mt-3 block text-[42px] font-black leading-none text-slate-900">{stat.value}</strong>
          <span className="mt-2 block text-[15px] font-extrabold text-slate-500">{stat.title}</span>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-extrabold text-slate-500">
        <span>{stat.sub}</span>
        <span>{stat.subRight}</span>
      </div>
    </div>
  )
}

function DashboardPanel({ setActiveView }: { setActiveView: (view: DemoView) => void }) {
  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[30px] font-black tracking-normal text-slate-900">Admin Dashboard</h1>
          <p className="mt-1 text-base font-medium text-slate-500">Dashboard / Public Demo Workspace</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setActiveView("students")} className="rounded-2xl bg-blue-600 px-6 py-3 text-base font-black text-white shadow-sm hover:bg-blue-700">
            + Add New Student
          </button>
          <button type="button" onClick={() => setActiveView("finance")} className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-base font-black text-slate-700 shadow-sm hover:bg-slate-50">
            Fees Details
          </button>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-[28px] bg-[#20293b] px-7 py-8 text-white shadow-sm">
        <div className="absolute right-8 top-0 h-40 w-40 rounded-full border-[22px] border-white/5" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[34px] font-black tracking-normal">Welcome Back, Admin</h2>
            <p className="mt-3 text-lg font-medium text-slate-300">Have a good day at work</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-5 py-3 text-sm font-bold text-slate-200">
            <CalendarDays className="h-4 w-4" /> Updated recently on Jun 20, 2026
          </span>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <StatCard key={stat.title} stat={stat} />)}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_1fr_1fr]">
        <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-900">Schedules</h3>
            <button type="button" className="text-sm font-black text-blue-600">+ Add New</button>
          </div>
          <div className="mb-5 flex items-center justify-between">
            <button className="grid h-10 w-10 place-items-center rounded-full border border-slate-200" type="button">‹</button>
            <strong className="text-lg font-black">June 2026</strong>
            <button className="grid h-10 w-10 place-items-center rounded-full border border-slate-200" type="button">›</button>
          </div>
          <div className="grid grid-cols-7 gap-y-4 text-center text-sm font-black text-slate-600">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <span key={d}>{d}</span>)}
            {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => (
              <span key={day} className={`mx-auto grid h-9 w-9 place-items-center rounded-full ${day === 20 ? "bg-blue-600 text-white" : "text-slate-500"}`}>{day}</span>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-900">Attendance</h3>
            <button type="button" onClick={() => setActiveView("attendance")} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Today</button>
          </div>
          <div className="mb-6 flex gap-8 border-b border-slate-100 text-base font-black">
            <button className="border-b-4 border-blue-600 pb-3 text-blue-600" type="button">Students</button>
            <button className="pb-3 text-slate-500" type="button">Mentors</button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[["326", "Present"], ["18", "Absent"], ["04", "Late"]].map(([value, label]) => (
              <div key={label} className="rounded-2xl bg-slate-50 py-4">
                <strong className="block text-2xl font-black text-slate-900">{value}</strong>
                <span className="text-sm font-bold text-slate-500">{label}</span>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-8 grid h-44 w-44 place-items-center rounded-full border-[22px] border-blue-600 border-r-slate-200">
            <span className="text-2xl font-black">94.7%</span>
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-xl font-black text-slate-900">Quick Links</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              [CalendarDays, "Calendar", "bg-emerald-50 text-emerald-600"],
              [BarChart3, "Exam Result", "bg-blue-50 text-blue-600"],
              [UserCheck, "Attendance", "bg-amber-50 text-amber-600"],
              [DollarSign, "Fees", "bg-cyan-50 text-cyan-600"],
              [FileText, "Reports", "bg-sky-50 text-sky-600"],
              [ShieldCheck, "Mentor Locks", "bg-indigo-50 text-indigo-600"],
            ].map(([Icon, label, tint]) => (
              <button key={String(label)} type="button" onClick={() => label === "Reports" ? setActiveView("reports") : label === "Attendance" ? setActiveView("attendance") : label === "Fees" ? setActiveView("finance") : setActiveView("dashboard")} className={`min-h-32 rounded-2xl ${String(tint)} p-4 text-center font-black transition hover:scale-[1.02]`}>
                <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-white/80 shadow-sm"><Icon className="h-6 w-6" /></span>
                {String(label)}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function StudentsPanel() {
  return (
    <PanelShell title="Students" crumb="Dashboard / Students" action="Create student">
      <div className="grid gap-4 lg:grid-cols-3">
        {["Active students 348", "On campus 312", "Out campus 36"].map((label) => <MiniMetric key={label} label={label} />)}
      </div>
      <DataTable headings={["ID", "Name", "Class", "Mentor", "Status", "Progress"]} rows={students.map((s) => [s.id, s.name, s.className, s.mentor, s.status, s.progress])} />
    </PanelShell>
  )
}

function HifzPanel() {
  return (
    <PanelShell title="Hifz Recording" crumb="Dashboard / Hifz / Recording" action="New entry">
      <div className="grid gap-4 lg:grid-cols-4">
        {["Today entries 42", "Revision due 11", "Monthly steady 87%", "Mentors active 14"].map((label) => <MiniMetric key={label} label={label} />)}
      </div>
      <DataTable headings={["Student", "Session", "Portion", "Rating", "Status"]} rows={hifzRows} />
    </PanelShell>
  )
}

function AttendancePanel() {
  return (
    <PanelShell title="Attendance Dashboard" crumb="Dashboard / Attendance" action="Export">
      <div className="grid gap-4 lg:grid-cols-4">
        {["Students present 326", "Students absent 18", "Mentors present 30", "Late marks 04"].map((label) => <MiniMetric key={label} label={label} />)}
      </div>
      <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-5 text-xl font-black">Section wise presence</h3>
        {[["Hifz", "96%"], ["Madrasa", "93%"], ["School", "91%"], ["Mentors", "94%"]].map(([label, pct]) => (
          <div key={label} className="mb-5 last:mb-0">
            <div className="mb-2 flex justify-between text-sm font-black text-slate-600"><span>{label}</span><span>{pct}</span></div>
            <div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-blue-600" style={{ width: pct }} /></div>
          </div>
        ))}
      </div>
    </PanelShell>
  )
}

function LeavesPanel() {
  return (
    <PanelShell title="Leaves" crumb="Dashboard / Leaves" action="New leave">
      <div className="grid gap-4 lg:grid-cols-4">
        {["Pending 07", "Approved 19", "Outside 12", "Returned today 05"].map((label) => <MiniMetric key={label} label={label} />)}
      </div>
      <DataTable headings={["Student", "Type", "Reason", "Status"]} rows={leaveRows} />
    </PanelShell>
  )
}

function ReportsPanel() {
  return (
    <PanelShell title="Reports" crumb="Dashboard / Reports" action="Generate report">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {[
          [GraduationCap, "Student Reports", "Academic, attendance, hifz, leaves, and fee status in one report."],
          [UserCog, "Mentor Reports", "Assigned students, progress pace, attendance, and follow-up workload."],
          [FileText, "Yearly Reports", "Academic year summaries for principal and administration review."],
        ].map(([Icon, title, detail]) => (
          <article key={String(title)} className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
            <Icon className="mb-5 h-9 w-9 text-blue-600" />
            <h3 className="text-xl font-black">{String(title)}</h3>
            <p className="mt-3 leading-7 text-slate-600">{String(detail)}</p>
            <button className="mt-6 rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700" type="button">Open demo report</button>
          </article>
        ))}
      </div>
    </PanelShell>
  )
}

function FinancePanel() {
  return (
    <PanelShell title="Finance" crumb="Dashboard / Finance" action="Record payment">
      <div className="grid gap-4 lg:grid-cols-4">
        {["Collected 82%", "Pending fees 62", "Monthly fees 286", "Salary entries 32"].map((label) => <MiniMetric key={label} label={label} />)}
      </div>
      <DataTable headings={["Student", "Month", "Amount", "Status"]} rows={[["Muhammad Fadil", "June", "Rs 2,500", "Paid"], ["Ahmed Rihan", "June", "Rs 2,500", "Pending"], ["Abdul Hannan", "June", "Rs 2,500", "Paid"]]} />
    </PanelShell>
  )
}

function PanelShell({ title, crumb, action, children }: { title: string; crumb: string; action: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[30px] font-black tracking-normal text-slate-900">{title}</h1>
          <p className="mt-1 text-base font-medium text-slate-500">{crumb}</p>
        </div>
        <button type="button" className="rounded-2xl bg-blue-600 px-6 py-3 text-base font-black text-white shadow-sm hover:bg-blue-700">{action}</button>
      </div>
      {children}
    </div>
  )
}

function MiniMetric({ label }: { label: string }) {
  const firstSpace = label.indexOf(" ")
  const title = firstSpace >= 0 ? label.slice(0, firstSpace) : label
  const value = firstSpace >= 0 ? label.slice(firstSpace + 1) : ""
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
      <span className="text-sm font-black uppercase tracking-[0.12em] text-slate-400">{title}</span>
      <strong className="mt-2 block text-3xl font-black text-slate-900">{value}</strong>
    </div>
  )
}

function DataTable({ headings, rows }: { headings: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead className="bg-slate-50 text-sm font-black uppercase tracking-[0.08em] text-slate-500">
            <tr>{headings.map((heading) => <th key={heading} className="px-5 py-4">{heading}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm font-bold text-slate-700">
            {rows.map((row) => (
              <tr key={row.join("-")} className="hover:bg-slate-50/70">
                {row.map((cell) => <td key={cell} className="px-5 py-4">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DemoPage() {
  const [activeView, setActiveView] = useState<DemoView>("dashboard")

  const panel = {
    dashboard: <DashboardPanel setActiveView={setActiveView} />,
    students: <StudentsPanel />,
    hifz: <HifzPanel />,
    attendance: <AttendancePanel />,
    leaves: <LeavesPanel />,
    reports: <ReportsPanel />,
    finance: <FinancePanel />,
  }[activeView]

  return (
    <main className="min-h-screen bg-[#f4f7f4] text-slate-950">
      <div className="flex min-h-screen">
        <SideNav activeView={activeView} setActiveView={setActiveView} />
        <div className="min-w-0 flex-1">
          <TopBar setActiveView={setActiveView} />
          <MobileTabs activeView={activeView} setActiveView={setActiveView} />
          <div className="mx-auto w-full max-w-[1680px] p-4 sm:p-6 lg:p-8">
            <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-bold text-blue-800">
              This is a public demo of the inside project workspace. It uses sample data, so visitors can click around without a password.
            </div>
            {panel}
          </div>
        </div>
      </div>
    </main>
  )
}



