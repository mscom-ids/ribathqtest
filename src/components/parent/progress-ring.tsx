
"use client"

import { LogIn } from "lucide-react"

export function ProgressRing({
    percentage,
    size = 120,
    strokeWidth = 10,
    color = "text-emerald-500"
}: {
    percentage: number
    size?: number
    strokeWidth?: number
    color?: string
}) {
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const offset = circumference - (percentage / 100) * circumference

    return (
        <div className="relative flex items-center justify-center font-bold text-xl" style={{ width: size, height: size }}>
            <svg
                className="transform -rotate-90 w-full h-full"
                width={size}
                height={size}
            >
                <circle
                    className="text-slate-200 dark:text-slate-800"
                    strokeWidth={strokeWidth}
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
                <circle
                    className={`${color} transition-all duration-1000 ease-out`}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
            </svg>
            <span className="absolute text-2xl text-emerald-800 dark:text-emerald-400">
                {Math.round(percentage)}%
            </span>
        </div>
    )
}
