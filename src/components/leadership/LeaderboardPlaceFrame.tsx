"use client"

import { useId } from "react"
import { rankLabel } from "@/lib/leaderboard-ranking"

/** Four code-native award designs; dynamic ranks preserve shared places. */
export function LeaderboardPlaceFrame({ rank, tied }: { rank: number; tied: boolean }) {
    const id = useId().replace(/:/g, "")
    const silver = rank === 2
    const bronze = rank === 3
    const kind = rank === 1 ? "champion" : silver ? "silver" : bronze ? "bronze" : "honour"
    const count = bronze ? 10 : 9
    const leaves = Array.from({ length: count }, (_, index) => 102 + index * 128 / (count - 1))
    // Broad, overlapping laurel leaves for gold, smaller olive leaves for silver,
    // and pointed wheat leaves for bronze. The row honours use a single sprig.
    const leafPath = (angle: number, inward: boolean) => {
        const theta = angle * Math.PI / 180
        const rx = Math.cos(theta), ry = Math.sin(theta)
        const x = 60 + 35 * rx, y = 54 + 42 * ry
        const tangentLength = Math.hypot(35 * ry, 42 * rx)
        const tx = -35 * ry / tangentLength, ty = 42 * rx / tangentLength
        const taper = 1 - Math.max(0, (angle - 180) / 65) * .35
        const reach = (inward ? -8 : 11) * taper
        const lengthAlongBranch = (bronze ? 18 : silver ? 17 : 20) * taper
        const tipX = x + tx * lengthAlongBranch + rx * reach, tipY = y + ty * lengthAlongBranch + ry * reach
        const dx = tipX - x, dy = tipY - y, length = Math.hypot(dx, dy)
        const width = (silver ? 5.4 : bronze ? 4.5 : 7.2) * taper
        const nx = -dy / length, ny = dx / length
        const p = (value: number) => value.toFixed(2)
        const at = (along: number, across: number) => `${p(x + dx * along + nx * across)} ${p(y + dy * along + ny * across)}`
        return bronze
            ? `M${at(0, 0)}L${at(.28, width)}L${at(.72, width * .65)}L${at(1, 0)}L${at(.5, -width * .6)}Z`
            : `M${at(0, 0)}C${at(.16, width)} ${at(.68, width)} ${at(1, 0)}C${at(.68, -width)} ${at(.16, -width)} ${at(0, 0)}Z`
    }
    const suffix = rankLabel(rank).slice(String(rank).length)
    return <span className="points-place-frame" data-place={rank} data-award={kind} role="img" aria-label={`${rankLabel(rank, tied)} place distinction`}>
        <svg viewBox="0 0 120 112" fill="none" aria-hidden="true">
            <defs><linearGradient id={`laurel-${id}`} x1="22" y1="12" x2="94" y2="98" gradientUnits="userSpaceOnUse">
                <stop stopColor={silver ? "#e2eafa" : "#ffe17a"} /><stop offset=".48" stopColor={silver ? "#a5b9d7" : "#ffc224"} /><stop offset="1" stopColor={silver ? "#839fc3" : "#e5a21c"} />
            </linearGradient></defs>
            {[false, true].map(mirror => <g key={String(mirror)} transform={mirror ? "translate(120 0) scale(-1 1)" : undefined} fill={`url(#laurel-${id})`}>
                <path d="M52.7 95.1A35 42 0 0 1 37.5 21.8" fill="none" stroke={`url(#laurel-${id})`} strokeWidth={rank === 1 ? 1.8 : 1.3} strokeLinecap="round" />
                {leaves.map(angle => <g key={angle} stroke={silver ? "#6984ad" : "#ae7816"} strokeWidth=".4" strokeLinejoin="round"><path d={leafPath(angle, false)} />{rank <= 3 && <path d={leafPath(angle, true)} />}</g>)}
            </g>)}
            {rank === 1 ? <g fill={`url(#laurel-${id})`}><rect x="51" y="92" width="5" height="11" rx="2" /><rect x="58" y="90" width="5" height="15" rx="2" /><rect x="65" y="92" width="5" height="11" rx="2" /></g>
                : rank <= 3 ? <g stroke={silver ? "#a5bad7" : "#9aa8bb"} strokeWidth="2" strokeLinecap="round"><path d="M48 94l24 10M72 94l-24 10" /><path d="M60 96c-15-12-17 3-5 2M60 96c15-12 17 3 5 2" /></g>
                    : <path d="M51 96h18" stroke={`url(#laurel-${id})`} strokeWidth="2.5" strokeLinecap="round" />}
        </svg>
        <span className="points-frame-number"><b>{rank}</b><sup>{suffix}</sup></span>
        {tied && <small>Joint</small>}
    </span>
}
