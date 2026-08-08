"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Label } from "@/components/ui/label"

export function SearchableSelect({
    label,
    placeholder,
    searchPlaceholder,
    items,
    value,
    onChange,
    hint,
    required,
    inputClassName,
}: {
    label: string
    placeholder: string
    searchPlaceholder: string
    items: { id: string; label: string }[]
    value: string
    onChange: (value: string) => void
    hint?: string
    required?: boolean
    inputClassName?: string
}) {
    const [search, setSearch] = useState("")
    const [open, setOpen] = useState(false)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const filtered = useMemo(() => {
        if (!search.trim()) return items
        const q = search.toLowerCase()
        return items.filter(item => item.label.toLowerCase().includes(q))
    }, [items, search])

    const selectedLabel = items.find(item => item.id === value)?.label || ""

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const btnClass = inputClassName || "flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-blue-950"

    return (
        <div className="space-y-2" ref={wrapperRef}>
            <Label>{label}</Label>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 0) }}
                    className={btnClass}
                >
                    <span className={selectedLabel ? "" : "text-slate-400"}>{selectedLabel || placeholder}</span>
                    <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {open && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        <div className="border-b border-slate-100 p-2 dark:border-slate-800">
                            <input
                                ref={inputRef}
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                            {!filtered.length && <p className="px-3 py-3 text-center text-xs text-slate-400">No matches found</p>}
                            {filtered.map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => { onChange(item.id); setOpen(false); setSearch("") }}
                                    className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-950 ${item.id === value ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "text-slate-700 dark:text-slate-200"}`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {hint && <p className="text-xs text-slate-500">{hint}</p>}
            {required && <input type="hidden" required value={value} />}
        </div>
    )
}
