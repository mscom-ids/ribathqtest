/** Competition ranking at the same two-decimal precision displayed to users.
 * Equal scores share a place: 90, 90, 90, 89 -> 1, 1, 1, 4.
 * Input order is retained within ties; it never changes their rank.
 */
export function rankLeaderboard<T extends { totalPoints: number }>(students: readonly T[]): (T & { rank: number; tied: boolean })[] {
    const score = (student: T) => Math.round((student.totalPoints + Number.EPSILON) * 100)
    const sorted = [...students].sort((a, b) => score(b) - score(a))
    const counts = new Map<number, number>()
    sorted.forEach(student => counts.set(score(student), (counts.get(score(student)) || 0) + 1))
    let rank = 0
    let previous: number | undefined
    return sorted.map((student, index) => {
        const value = score(student)
        if (value !== previous) rank = index + 1
        previous = value
        return { ...student, rank, tied: (counts.get(value) || 0) > 1 }
    })
}

export function rankLabel(rank: number, tied = false) {
    const mod100 = rank % 100
    const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }
    const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : (suffixes[rank % 10] || 'th')
    return `${tied ? 'Joint ' : ''}${rank}${suffix}`
}
