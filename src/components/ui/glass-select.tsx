"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

export type GlassSelectOption = { value: string; label: string; disabled?: boolean }

/** App-rendered picker: identical motion and touch targets across browsers. */
export function GlassSelect({ value, onValueChange, options, label, placeholder = "Select…", className, align = "start", disabled = false, tone = "default" }: {
  value: string
  onValueChange: (value: string) => void
  options: readonly GlassSelectOption[]
  label: string
  placeholder?: string
  className?: string
  align?: "start" | "center" | "end"
  disabled?: boolean
  tone?: "default" | "inverse"
}) {
  return <Select value={value} onValueChange={onValueChange} disabled={disabled}>
    <SelectTrigger aria-label={label} className={cn("glass-picker-trigger h-10 w-full rounded-xl border-slate-200 bg-white/80 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100", className)}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent position="popper" align={align} sideOffset={8} collisionPadding={12} className={cn("glass-picker-panel z-[240] min-w-[12rem] max-w-[calc(100vw-1.5rem)] rounded-[22px] p-1.5", tone === "inverse" && "glass-picker-inverse")}>
      <div className="glass-picker-heading px-3 pb-2 pt-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</div>
      {options.map(option => <SelectItem key={option.value} value={option.value} disabled={option.disabled} className="glass-picker-option min-h-11 cursor-pointer rounded-xl py-2.5 pl-3 pr-9 text-sm font-medium">{option.label}</SelectItem>)}
    </SelectContent>
  </Select>
}
