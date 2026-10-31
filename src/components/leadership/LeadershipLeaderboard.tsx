"use client"
import { Dialog } from "radix-ui"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/** Opaque shared leaderboard panel; admin can opt into a slide-in entrance. */
export function LeadershipLeaderboard({ open, onOpenChange, children, trigger, slide = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode
  trigger?: React.ReactNode; slide?: boolean
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
    <Dialog.Portal>
      <Dialog.Overlay className="leadership-leaderboard-overlay fixed inset-0 z-[90] bg-black/40" />
      <Dialog.Content aria-describedby={undefined} className={cn(slide ? "admin-leaderboard" : "leadership-leaderboard", "fixed inset-y-0 right-0 z-[100] flex w-full max-w-[560px] flex-col border-l border-slate-200 bg-white text-slate-900 shadow-xl outline-none dark:border-neutral-800 dark:bg-[#0d0d0d] dark:text-white")}>
        <Dialog.Title className="sr-only">Top Performers</Dialog.Title>
        <Dialog.Close aria-label="Close leaderboard" className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></Dialog.Close>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-12 [touch-action:pan-y]">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
