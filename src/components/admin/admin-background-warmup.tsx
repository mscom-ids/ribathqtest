"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { cachedGet } from "@/lib/api-cache"

type WarmupTask = {
    url: string
    params?: Record<string, unknown>
    ttlMs?: number
}

type NetworkAwareNavigator = Navigator & {
    connection?: { saveData?: boolean }
}

const WARMUP_DISABLED = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DISABLE_ADMIN_WARMUP === "true"
const WARMUP_EXCLUDED_PATHS = [
    "/admin/academic/enrollments",
]

const ROUTES_TO_PREFETCH = [
    "/admin/students",
    "/admin/alumni",
    "/admin/calendar",
    "/admin/timetable/setup",
    "/admin/timetable/view",
    "/admin/student-attendance",
    "/admin/staff",
    "/admin/chat",
    "/admin/finance/dashboard",
    "/admin/leaves",
    "/admin/reports/students",
    "/admin/reports/mentors",
    "/admin/setup/academic-years",
    "/admin/setup/classes",
    "/admin/mentor-access",
]

function formatLocalDate(date: Date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 10)
}

function getReportRange() {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())

    return {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        startDate: formatLocalDate(weekStart),
        endDate: formatLocalDate(now),
        today: formatLocalDate(now),
    }
}

function buildWarmupTasks(): WarmupTask[] {
    const dates = getReportRange()

    return [
        { url: "/students/counts", ttlMs: 60_000 },
        { url: "/students", params: { light: "true", status: "active", limit: 15, offset: 0, sort: "name", count: "false" }, ttlMs: 60_000 },
        { url: "/staff", ttlMs: 5 * 60_000 },
        { url: "/events", ttlMs: 60_000 },
        { url: "/classes/academic-years", ttlMs: 5 * 60_000 },
        { url: "/attendance/schedules", ttlMs: 5 * 60_000 },
        { url: "/attendance/breaks", ttlMs: 5 * 60_000 },
        { url: "/finance/active-students", ttlMs: 60_000 },
        { url: "/leaves/outside-students", ttlMs: 30_000 },
        { url: "/attendance/daily-stats", params: { start_date: dates.today, end_date: dates.today }, ttlMs: 30_000 },
        { url: "/chat/conversations", ttlMs: 60_000 },
        { url: "/delegations/admin/all", params: { pending_only: "true", limit: 5 }, ttlMs: 60_000 },
        { url: "/access-control/mentor-policies", ttlMs: 60_000 },
    ]
}

function shouldSkipWarmup(pathname?: string | null) {
    if (WARMUP_DISABLED) return true
    if (pathname && WARMUP_EXCLUDED_PATHS.some(path => pathname.startsWith(path))) return true
    if (document.visibilityState === "hidden") return true

    const connection = (navigator as NetworkAwareNavigator).connection
    return connection?.saveData === true
}

function scheduleAfterIdle(callback: () => void, delayMs: number) {
    let idleHandle: number | null = null
    let fallbackHandle: ReturnType<typeof globalThis.setTimeout> | null = null

    const timer = window.setTimeout(() => {
        if ("requestIdleCallback" in window) {
            idleHandle = window.requestIdleCallback(callback, { timeout: 4_000 })
            return
        }

        fallbackHandle = globalThis.setTimeout(callback, 300)
    }, delayMs)

    return () => {
        window.clearTimeout(timer)
        if (idleHandle !== null && "cancelIdleCallback" in window) {
            window.cancelIdleCallback(idleHandle)
        }
        if (fallbackHandle !== null) {
            globalThis.clearTimeout(fallbackHandle)
        }
    }
}

async function runWarmupQueue(tasks: WarmupTask[], concurrency = 2) {
    let nextIndex = 0
    const workers = Array.from({ length: concurrency }, async () => {
        while (nextIndex < tasks.length) {
            if (document.visibilityState === "hidden") return

            const task = tasks[nextIndex]
            nextIndex += 1

            await cachedGet(task.url, task.params, task.ttlMs).catch(() => null)
        }
    })

    await Promise.all(workers)
}

export function AdminBackgroundWarmup() {
    const router = useRouter()
    const pathname = usePathname()
    const hasStarted = useRef(false)

    useEffect(() => {
        if (hasStarted.current || typeof window === "undefined") return
        if (shouldSkipWarmup(pathname)) return
        hasStarted.current = true

        const cancelRoutePrefetch = scheduleAfterIdle(() => {
            if (shouldSkipWarmup(pathname)) return

            ROUTES_TO_PREFETCH.forEach((route, index) => {
                window.setTimeout(() => router.prefetch(route), index * 120)
            })
        }, 1_000)

        const cancelDataWarmup = scheduleAfterIdle(() => {
            if (shouldSkipWarmup(pathname)) return

            const tasks = buildWarmupTasks()
            const firstBatch = tasks.slice(0, 11)
            const reportBatch = tasks.slice(11)

            void runWarmupQueue(firstBatch, 2).then(() => {
                window.setTimeout(() => {
                    if (!shouldSkipWarmup(pathname)) void runWarmupQueue(reportBatch, 1)
                }, 2_500)
            })
        }, 1_600)

        return () => {
            cancelRoutePrefetch()
            cancelDataWarmup()
        }
    }, [pathname, router])

    return null
}
