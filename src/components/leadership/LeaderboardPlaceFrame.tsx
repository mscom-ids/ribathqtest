"use client"

import { useId } from "react"
import { rankLabel } from "@/lib/leaderboard-ranking"

/** Four code-native award designs; dynamic ranks preserve shared places. */
export function LeaderboardPlaceFrame({ rank, tied }: { rank: number; tied: boolean }) {
    const id = useId().replace(/:/g, "")
    const silver = rank === 2
    const bronze = rank === 3
    const kind = rank === 1 ? "champion" : silver ? "silver" : bronze ? "bronze" : "honour"
    const count = silver || bronze ? 10 : 8
    const leaves = Array.from({ length: count }, (_, index) => 235 - index * 133 / (count - 1))
    // Leaves follow an elliptical branch; a clear central opening keeps the rank readable.
    const leafPath = (angle: number, inward: boolean) => {
        const theta = angle * Math.PI / 180
        const rx = Math.cos(theta), ry = Math.sin(theta)
        const x = 60 + 40 * rx, y = 56 + 44 * ry
        const tx = -ry, ty = rx
        const reach = inward ? -6 : 8
        const tipX = x + tx * 12 + rx * reach, tipY = y + ty * 12 + ry * reach
        const dx = tipX - x, dy = tipY - y, length = Math.hypot(dx, dy)
        const width = silver ? 2.4 : bronze ? 2.8 : 3.6
        const mx = (x + tipX) / 2, my = (y + tipY) / 2
        const ax = mx - dy / length * width, ay = my + dx / length * width
        const bx = mx + dy / length * width, by = my - dx / length * width
        const p = (value: number) => value.toFixed(2)
        return bronze
            ? `M${p(x)} ${p(y)}L${p(ax)} ${p(ay)}L${p(tipX)} ${p(tipY)}L${p(bx)} ${p(by)}Z`
            : `M${p(x)} ${p(y)}Q${p(ax)} ${p(ay)} ${p(tipX)} ${p(tipY)}Q${p(bx)} ${p(by)} ${p(x)} ${p(y)}Z`
    }
    const suffix = rankLabel(rank).slice(String(rank).length)
    return <span className="points-place-frame" data-place={rank} data-award={kind} role="img" aria-label={`${rankLabel(rank, tied)} place distinction`}>
        <svg viewBox="0 0 120 112" fill="none" aria-hidden="true">
            <defs><linearGradient id={`laurel-${id}`} x1="22" y1="12" x2="94" y2="98" gradientUnits="userSpaceOnUse">
                <stop stopColor={silver ? "#e3ebf5" : "#ffe39a"} /><stop offset=".5" stopColor={silver ? "#a9bcd1" : bronze ? "#e2ac4e" : "#f4bb3a"} /><stop offset="1" stopColor={silver ? "#8199b5" : "#b78122"} />
            </linearGradient></defs>
            {[false, true].map(mirror => <g key={String(mirror)} transform={mirror ? "translate(120 0) scale(-1 1)" : undefined} fill={`url(#laurel-${id})`}>
                <path d="M51.7 99A40 44 0 0 1 37.1 20" fill="none" stroke={`url(#laurel-${id})`} strokeWidth={rank === 1 ? 2 : 1.5} strokeLinecap="round" />
                {leaves.map(angle => <g key={angle}><path d={leafPath(angle, false)} />{rank <= 3 && <path d={leafPath(angle, true)} />}</g>)}
            </g>)}
            {rank === 1 ? <g fill={`url(#laurel-${id})`}><rect x="51" y="96" width="5" height="11" rx="2" /><rect x="58" y="94" width="5" height="15" rx="2" /><rect x="65" y="96" width="5" height="11" rx="2" /></g>
                : rank <= 3 ? <g stroke={silver ? "#9bafc7" : "#9aa8bb"} strokeWidth="2.5" strokeLinecap="round"><path d="M48 98l24 9M72 98l-24 9" /><path d="M60 100c-15-12-17 3-5 2M60 100c15-12 17 3 5 2" /></g>
                    : <path d="M51 100h18" stroke={`url(#laurel-${id})`} strokeWidth="3" strokeLinecap="round" />}
        </svg>
        <span className="points-frame-number"><b>{rank}</b><sup>{suffix}</sup></span>
        {tied && <small>Joint</small>}
    </span>
}
