export type HifzPerformanceScoreSource = {
    percentage?: number | string | null
    totalPoints?: number | string | null
    total_points?: number | string | null
    points?: number | string | null
}

/** Actual earned points, never a percentage rescaled to an invented 70-point score. */
export function getHifzPerformancePoints(source: HifzPerformanceScoreSource): number | null {
    const value = source.totalPoints ?? source.total_points ?? source.points
    if (value === undefined || value === null || value === '') return null
    const points = Number(value)
    return Number.isFinite(points) ? Math.round((points + Number.EPSILON) * 100) / 100 : null
}
