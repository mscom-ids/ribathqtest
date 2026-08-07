import type { FinanceOpenItem, FinanceSummary } from "@/lib/finance-api"

export function money(value?: number | string | null) {
    const amount = typeof value === "string" ? Number(value) : Number(value || 0)
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0)
}

export function shortDate(value?: string | null) {
    if (!value) return "—"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

export function shortDateTime(value?: string | null) {
    if (!value) return "—"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
    })
}

export function summaryValue(summary: FinanceSummary | undefined, ...keys: Array<keyof FinanceSummary>) {
    for (const key of keys) {
        const value = Number(summary?.[key])
        if (Number.isFinite(value)) return value
    }
    return 0
}

export type AllocationPreview = {
    allocations: Array<{ item: FinanceOpenItem; amount: number }>
    credit: number
    applied: number
}

export function allocateOldestFirst(openItems: FinanceOpenItem[], paymentAmount: number): AllocationPreview {
    let remainingPaise = Math.max(0, Math.round((Number(paymentAmount) || 0) * 100))
    const sorted = [...openItems]
        .filter(item => Number(item.balance) > 0)
        .sort((a, b) => {
            const leftValue = a.due_date || a.service_month || a.month
            const rightValue = b.due_date || b.service_month || b.month
            const left = leftValue ? new Date(leftValue).getTime() : Number.MAX_SAFE_INTEGER
            const right = rightValue ? new Date(rightValue).getTime() : Number.MAX_SAFE_INTEGER
            if (left !== right) return left - right
            return Number(a.allocation_priority ?? a.priority ?? 100) - Number(b.allocation_priority ?? b.priority ?? 100)
        })

    const allocations: AllocationPreview["allocations"] = []
    for (const item of sorted) {
        if (remainingPaise <= 0) break
        const balancePaise = Math.max(0, Math.round((Number(item.balance) || 0) * 100))
        const appliedPaise = Math.min(remainingPaise, balancePaise)
        if (appliedPaise <= 0) continue
        allocations.push({ item, amount: appliedPaise / 100 })
        remainingPaise -= appliedPaise
    }

    return {
        allocations,
        credit: remainingPaise / 100,
        applied: Math.max(0, Math.round((paymentAmount * 100) - remainingPaise) / 100),
    }
}

export function currentMonthValue() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export function nextMonthValue() {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return next.getFullYear() + "-" + String(next.getMonth() + 1).padStart(2, "0")
}
export function todayValue() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}
