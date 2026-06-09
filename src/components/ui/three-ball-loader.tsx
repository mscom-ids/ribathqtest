"use client"

export function ThreeBallLoader({ label = "Loading..." }: { label?: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3">
            <div className="flex h-8 items-end gap-2" aria-hidden="true">
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-indigo-600 [animation-delay:-0.24s]" />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.12s]" />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-500" />
            </div>
            {label && <p className="text-sm font-medium text-slate-500">{label}</p>}
        </div>
    )
}
