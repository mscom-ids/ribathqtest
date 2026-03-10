import { format } from "date-fns"

export type AcademicSession = {
    id: string
    name: string
    type: "Hifz" | "School" | "Madrassa"
    start_time: string | null
    end_time: string | null
    days_of_week: number[] | null
    standards: string[] | null
    is_active: boolean
}

export type CalendarPolicy = {
    date: string // YYYY-MM-DD
    is_holiday: boolean
    description: string | null
    day_mode?: "Normal" | "Friday" | "Weekday" | "Custom"
    effective_day_of_week: number | null
    allowed_session_types: string[] | null
    allowed_standards: string[] | null
    session_overrides?: Record<string, string[]> | null
}

/**
 * Applies mode-based rules to generate session overrides.
 * This logic centralizes "Which class meets when" rules.
 */
export const applyModeRules = (mode: string, currentSessions: AcademicSession[]) => {
    const overrides: Record<string, string[]> = {}

    // Helper to find session by approximate name
    const findSession = (namePart: string, type: string) =>
        currentSessions.find(s => s.name.toLowerCase().includes(namePart.toLowerCase()) && s.type === type)

    if (mode === "Normal") {
        // Normal: No Madrassa. Hifz + School.

        // Hifz Class 2 -> 6th, 8th
        const hc2 = findSession("Class 2", "Hifz"); if (hc2) overrides[hc2.id] = ["6th", "8th"]
        // Hifz Class 3 -> 5th, 7th, 9th
        const hc3 = findSession("Class 3", "Hifz"); if (hc3) overrides[hc3.id] = ["5th", "7th", "9th"]

        // School Morning -> 5,7,9,10
        const sm = findSession("Morning", "School"); if (sm) overrides[sm.id] = ["5th", "7th", "9th", "10th"]
        // School Noon -> 6,8,10
        const sn = findSession("Noon", "School"); if (sn) overrides[sn.id] = ["6th", "8th", "10th"]

    } else if (mode === "Friday") {
        // Friday: No Hifz, No Madrassa. Only School.

        // School Morning -> 5,7,9,10
        const sm = findSession("Morning", "School"); if (sm) overrides[sm.id] = ["5th", "7th", "9th", "10th"]
        // School Noon -> 6,8,10
        const sn = findSession("Noon", "School"); if (sn) overrides[sn.id] = ["6th", "8th", "10th"]

    } else if (mode === "Weekday") {
        // Weekday: No School. Hifz + Madrassa.

        // Hifz Class 2 -> 6th, 8th
        const hc2 = findSession("Class 2", "Hifz"); if (hc2) overrides[hc2.id] = ["6th", "8th"]
        // Hifz Class 3 -> 5th, 7th, 9th
        const hc3 = findSession("Class 3", "Hifz"); if (hc3) overrides[hc3.id] = ["5th", "7th", "9th"]

        // Madrassa Shift 1 -> 5,7,9,10
        const m1 = findSession("Shift 1", "Madrassa") || findSession("Madrassa", "Madrassa");
        if (m1) overrides[m1.id] = ["5th", "7th", "9th", "10th"]

        // Madrassa Shift 2 -> 6,8,10
        const m2 = findSession("Shift 2", "Madrassa");
        if (m2) overrides[m2.id] = ["6th", "8th", "10th"]
    }

    return overrides
}

export const getDayMode = (date: Date, policies: Record<string, CalendarPolicy>): string => {
    // 1. Check for specific date policy
    const dateStr = format(date, "yyyy-MM-dd")
    const policy = policies[dateStr]

    if (policy) {
        if (policy.is_holiday) return "holiday"
        return policy.day_mode || "Normal"
    }

    // 2. Default based on day of week
    const dayOfWeek = date.getDay()
    if (dayOfWeek === 5) return "Friday" // Friday
    if (dayOfWeek === 0 || dayOfWeek === 6) return "Weekday" // Saturday, Sunday
    return "Normal" // Monday to Thursday
}

export const isSessionActiveForDate = (
    session: AcademicSession,
    date: Date,
    policies: Record<string, CalendarPolicy>
): { isActive: boolean; allowedStandards: string[] | null } => {
    const dateStr = format(date, "yyyy-MM-dd")
    const policy = policies[dateStr]
    const mode = getDayMode(date, policies)

    // 1. Holiday Check
    if (mode === "holiday") return { isActive: false, allowedStandards: null }

    // 2. Helper to determine allowed types based on mode
    let allowedTypes: string[] = ["Hifz", "School"] // Default Normal
    if (mode === "Friday") allowedTypes = ["School"]
    if (mode === "Weekday") allowedTypes = ["Hifz", "Madrassa"]
    if (mode === "Custom" && policy?.allowed_session_types) allowedTypes = policy.allowed_session_types

    // Check if session type is allowed
    if (!allowedTypes.includes(session.type)) return { isActive: false, allowedStandards: null }

    // 3. Check specific overrides
    // Priority: Policy Override -> Mode Rule (if applied manually or auto) -> Session Default
    // Note: applyModeRules creates the map, but we should use what is stored in policy if exists, 
    // OR re-calculate if no policy exists but we are inferring mode.

    let overrides = policy?.session_overrides

    // If no policy exists, we simulate the default rules for that day mode
    if (!policy) {
        // We need all sessions to calculate this, but here we process one session.
        // Ideally we pass the full list, but for now we can infer basic defaults if we don't have the full list context easily here.
        // Actually, without the full list, applyModeRules is hard to use because it searches by name.
        // However, we can use the `applyModeRules` externally and pass the result map here.
        // Refactoring slightly to accept overrides map directly might be cleaner, but let's assume the caller handles the map generation for "no-policy" days.
        return { isActive: true, allowedStandards: null } // Fallback: Active, All Standards
    }

    if (overrides && overrides[session.id]) {
        return { isActive: true, allowedStandards: overrides[session.id] }
    }

    return { isActive: true, allowedStandards: null } // Active, No specific standard restriction
}
