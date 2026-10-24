"use client"

import Link from "next/link"
import { Dialog } from "radix-ui"
import { MoreHorizontal, X, type LucideIcon } from "lucide-react"

export type LeadershipNavItem = { href: string; label: string; icon: LucideIcon }

export function LeadershipMobileMenu({ items, pathname }: { items: LeadershipNavItem[]; pathname: string }) {
  const active = items.some(item => pathname === item.href || pathname.startsWith(item.href + "/"))
  return <Dialog.Root>
    <Dialog.Trigger className={`leadership-mobile-nav-item ${active ? "is-active" : ""}`} aria-label="More leadership options"><span className="leadership-mobile-nav-icon"><MoreHorizontal className="h-5 w-5" /></span><span>More</span></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="leadership-menu-overlay fixed inset-0 z-[110] bg-slate-950/40" />
      <Dialog.Content aria-describedby={undefined} className="leadership-mobile-menu fixed inset-x-0 bottom-0 z-[120] rounded-t-[28px] border-t border-slate-200 bg-white px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 text-slate-900 shadow-xl outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="mb-5 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-500">Leadership workspace</p><Dialog.Title className="mt-1 text-xl font-bold">More options</Dialog.Title></div><Dialog.Close aria-label="Close more options" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500 dark:bg-slate-800"><X className="h-5 w-5" /></Dialog.Close></div>
        <div className="grid grid-cols-2 gap-3">{items.map(item => { const Icon = item.icon; const selected = pathname === item.href || pathname.startsWith(item.href + "/"); return <Dialog.Close key={item.href} asChild><Link href={item.href} aria-current={selected ? "page" : undefined} className={`flex min-h-24 flex-col justify-center gap-3 rounded-2xl border p-4 text-sm font-semibold ${selected ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}><Icon className="h-5 w-5 text-indigo-500" />{item.label}</Link></Dialog.Close> })}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
