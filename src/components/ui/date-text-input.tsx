"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type DateTextInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "type" | "value"
> & {
  value?: string
  onChange?: (value: string) => void
}

function isoToDisplay(value?: string) {
  if (!value) return ""

  const [year, month, day] = value.slice(0, 10).split("-")
  if (!year || !month || !day) return value

  return `${day}/${month}/${year}`
}

function parseDisplayToIso(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function formatDateDigits(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8)
  const day = digits.slice(0, 2)
  const month = digits.slice(2, 4)
  const year = digits.slice(4, 8)

  return [day, month, year].filter(Boolean).join("/")
}

function DateTextInput({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  disabled,
  ...props
}: DateTextInputProps) {
  const [displayValue, setDisplayValue] = React.useState(() => isoToDisplay(value))
  const pickerRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    setDisplayValue(isoToDisplay(value))
  }, [value])

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextDisplayValue = formatDateDigits(event.target.value)
    setDisplayValue(nextDisplayValue)

    if (!nextDisplayValue) {
      onChange?.("")
      return
    }

    const isoValue = parseDisplayToIso(nextDisplayValue)
    if (isoValue) {
      onChange?.(isoValue)
    }
  }

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (displayValue && !parseDisplayToIso(displayValue)) {
      setDisplayValue(isoToDisplay(value))
    }

    onBlur?.(event)
  }

  const handlePickerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value
    setDisplayValue(isoToDisplay(nextValue))
    onChange?.(nextValue)
  }

  const openPicker = () => {
    const picker = pickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null
    if (!picker) return

    if (typeof picker.showPicker === "function") {
      picker.showPicker()
      return
    }

    picker.click()
  }

  return (
    <div className="relative">
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        maxLength={10}
        placeholder={placeholder ?? "dd/mm/yyyy"}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        aria-label="Select date"
        className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-50"
        disabled={disabled}
        onClick={openPicker}
      >
        <CalendarIcon className="h-4 w-4" />
      </button>
      <input
        ref={pickerRef}
        aria-hidden="true"
        tabIndex={-1}
        type="date"
        value={value || ""}
        onChange={handlePickerChange}
        className="pointer-events-none absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 opacity-0"
      />
    </div>
  )
}

export { DateTextInput }
