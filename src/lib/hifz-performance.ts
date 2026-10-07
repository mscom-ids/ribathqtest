export type HifzPerformanceScoreSource = {
    percentage?: number | string | null
    totalPoints?: number | string | null
    total_points?: number | string | null
    points?: number | string | null
}

/** Returns the comparable 70-point score used by Top Performers. */
export function getHifzPerformancePoints(source: HifzPerformanceScoreSource): number | null {
    const percentage = Number(source.percentage)
    if (source.percentage !== undefined && source.percentage !== null && Number.isFinite(percentage)) {
        return Math.round((percentage * 0.7 + Number.EPSILON) * 100) / 100
    }

    const legacyPoints = Number(source.totalPoints ?? source.total_points ?? source.points)
    return Number.isFinite(legacyPoints) ? legacyPoints : null
}
