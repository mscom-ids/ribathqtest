"use client"

/**
 * PhoneInput — custom country-code selector + number input.
 *
 * Uses shadcn Select (Radix UI portal) for the country dropdown so it:
 *  - Renders above ALL other elements (no overflow-hidden / z-index conflicts)
 *  - Closes automatically on outside click or selection
 *  - Works on all screen sizes
 *
 * Stores value as E.164 e.g. "+919876543210"
 *
 * KEY FIX: SelectItem value uses unique ISO country CODE (e.g. "IN", "US"),
 * NOT dialCode — this prevents the duplicate-key error for countries that
 * share a dial code (US & Canada both use +1).
 */

import { useState, useEffect } from "react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"

// ── Country list ────────────────────────────────────────────────────────────
// Each `code` is unique ISO-3166-1 alpha-2 → used as Select value/key
export const COUNTRIES = [
    { code: "IN", dialCode: "91",  flag: "🇮🇳", name: "India" },
    { code: "AE", dialCode: "971", flag: "🇦🇪", name: "UAE" },
    { code: "SA", dialCode: "966", flag: "🇸🇦", name: "Saudi Arabia" },
    { code: "QA", dialCode: "974", flag: "🇶🇦", name: "Qatar" },
    { code: "KW", dialCode: "965", flag: "🇰🇼", name: "Kuwait" },
    { code: "BH", dialCode: "973", flag: "🇧🇭", name: "Bahrain" },
    { code: "OM", dialCode: "968", flag: "🇴🇲", name: "Oman" },
    { code: "GB", dialCode: "44",  flag: "🇬🇧", name: "United Kingdom" },
    { code: "US", dialCode: "1",   flag: "🇺🇸", name: "United States" },
    { code: "CA", dialCode: "1",   flag: "🇨🇦", name: "Canada" },
    { code: "PK", dialCode: "92",  flag: "🇵🇰", name: "Pakistan" },
    { code: "BD", dialCode: "880", flag: "🇧🇩", name: "Bangladesh" },
    { code: "LK", dialCode: "94",  flag: "🇱🇰", name: "Sri Lanka" },
    { code: "MY", dialCode: "60",  flag: "🇲🇾", name: "Malaysia" },
    { code: "SG", dialCode: "65",  flag: "🇸🇬", name: "Singapore" },
    { code: "AU", dialCode: "61",  flag: "🇦🇺", name: "Australia" },
] as const

type Country = typeof COUNTRIES[number]

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a stored E.164 string into a { countryCode, localNumber } pair.
 * Tries to match the longest dial code first to avoid false matches
 * (e.g. +1 vs +91). When multiple countries share the same dial code,
 * defaults to the first one in the list (US before CA).
 */
function parseE164(stored: string): { countryCode: string; localNumber: string } {
    const DEFAULT = { countryCode: "IN", localNumber: "" }
    if (!stored) return DEFAULT

    const digits = stored.replace(/^\+/, "")
    // Sort by dial code length descending so +971 is tried before +97, etc.
    const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length)
    for (const c of sorted) {
        if (digits.startsWith(c.dialCode)) {
            return { countryCode: c.code, localNumber: digits.slice(c.dialCode.length) }
        }
    }
    return DEFAULT
}

/** Build E.164 from the selected country code + subscriber digits */
function buildE164(countryCode: string, localNumber: string): string {
    const country = COUNTRIES.find(c => c.code === countryCode) ?? COUNTRIES[0]
    const digits = localNumber.replace(/\D/g, "")
    if (!digits) return ""
    return `+${country.dialCode}${digits}`
}

// ── Validate ─────────────────────────────────────────────────────────────────

/** Validate a stored E.164 phone number (8–15 total digits). Returns true or error string. */
export function validatePhone(value: string | undefined | null): true | string {
    if (!value) return true // optional — empty is fine
    const digits = value.replace(/\D/g, "")
    if (digits.length < 8)  return "Phone number must have at least 8 digits"
    if (digits.length > 15) return "Phone number must have at most 15 digits"
    return true
}

/** Normalise any raw string to E.164 with a fallback country code */
export function normalizePhone(raw: string, fallbackDialCode = "91"): string {
    if (!raw) return ""
    const stripped = raw.replace(/[^\d+]/g, "")
    if (stripped.startsWith("+")) return stripped
    return `+${fallbackDialCode}${stripped}`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PhoneInputProps {
    /** Stored E.164 value, e.g. "+919876543210". May be empty string. */
    value: string
    /** Called with the new E.164 value on every change */
    onChange: (normalized: string) => void
    disabled?: boolean
    placeholder?: string
}

export function PhoneInput({
    value,
    onChange,
    disabled = false,
    placeholder = "Phone number",
}: PhoneInputProps) {
    const parsed = parseE164(value)
    const [selectedCode, setSelectedCode] = useState<string>(parsed.countryCode)
    const [localNumber, setLocalNumber]   = useState<string>(parsed.localNumber)

    // Sync when form.reset() or external value change fires
    useEffect(() => {
        const { countryCode, localNumber: local } = parseE164(value)
        setSelectedCode(countryCode)
        setLocalNumber(local)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    function handleCountryChange(code: string) {
        setSelectedCode(code)
        onChange(buildE164(code, localNumber))
    }

    function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
        const raw = e.target.value.replace(/\D/g, "") // digits only
        setLocalNumber(raw)
        onChange(buildE164(selectedCode, raw))
    }

    const selectedCountry = COUNTRIES.find(c => c.code === selectedCode) ?? COUNTRIES[0]

    return (
        <div className="flex w-full">
            {/* Country selector — Radix portal: always above overflow:hidden containers */}
            <Select
                value={selectedCode}
                onValueChange={handleCountryChange}
                disabled={disabled}
            >
                <SelectTrigger
                    className="w-[115px] shrink-0 rounded-r-none border-r-0 focus:z-10 bg-muted/50 font-medium text-sm"
                >
                    {/* Override SelectValue to show flag + dialCode regardless of what's "selected" */}
                    <SelectValue asChild>
                        <span className="flex items-center gap-1.5 truncate">
                            <span>{selectedCountry.flag}</span>
                            <span className="text-slate-600 dark:text-slate-300">+{selectedCountry.dialCode}</span>
                        </span>
                    </SelectValue>
                </SelectTrigger>

                {/* Rendered into document.body via Radix portal — no z-index / clipping issues */}
                <SelectContent className="z-[9999] max-h-[260px] overflow-y-auto">
                    {COUNTRIES.map((c) => (
                        // value = unique ISO code; key = unique ISO code
                        <SelectItem key={c.code} value={c.code}>
                            <span className="flex items-center gap-2">
                                <span>{c.flag}</span>
                                <span className="font-medium">{c.name}</span>
                                <span className="text-slate-400 text-xs ml-1">+{c.dialCode}</span>
                            </span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Subscriber number — digits only */}
            <Input
                type="tel"
                inputMode="numeric"
                placeholder={placeholder}
                value={localNumber}
                onChange={handleNumberChange}
                disabled={disabled}
                maxLength={12}
                className="rounded-l-none flex-1 min-w-0"
            />
        </div>
    )
}
