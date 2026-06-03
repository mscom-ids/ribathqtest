import { db } from '../config/db';

export function normalizeHifzStandard(label: string): string {
    const l = String(label || '').trim();
    if (l === 'Hifz Only') return 'Hifz';
    if (l === '+1 (Plus One)') return 'Plus One';
    if (l === '+2 (Plus Two)') return 'Plus Two';
    if (l.endsWith(' Standard')) return l.replace(' Standard', '');
    return l;
}

export function parseHifzStandardList(value: any): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value || '[]');
            return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
            return [];
        }
    }
    return [];
}

function norm(value: unknown) {
    return String(value || '').trim().toLowerCase();
}

function dateWindowSql(alias: string) {
    return `(${alias}.effective_from IS NULL OR ${alias}.effective_from <= COALESCE($3::date, CURRENT_DATE))
            AND (${alias}.effective_until IS NULL OR ${alias}.effective_until >= COALESCE($3::date, CURRENT_DATE))`;
}

export function isHifzSchedule(schedule: any) {
    return String(schedule?.class_type || '').toLowerCase() === 'hifz';
}

export async function findHifzSessionForSchedule(schedule: any, academicYearId?: string | null) {
    if (!academicYearId || !isHifzSchedule(schedule)) return null;

    const result = await db.query(
        `SELECT id, name, code
         FROM hifz_sessions
         WHERE academic_year_id = $1
           AND is_active = true
         ORDER BY sort_order, name`,
        [academicYearId]
    );

    const scheduleName = norm(schedule.name);
    if (!scheduleName) return null;

    return result.rows.find((session: any) => {
        const name = norm(session.name);
        const code = norm(session.code);
        return (name && scheduleName.includes(name)) || (code && scheduleName.includes(code));
    }) || null;
}

export async function resolveHifzStandardsForSchedule(schedule: any, academicYearId?: string | null, date?: string | null) {
    const fallbackStandards = parseHifzStandardList(schedule?.standards).map(normalizeHifzStandard).filter(Boolean);
    if (!academicYearId || !isHifzSchedule(schedule)) {
        return { standards: fallbackStandards, usedRules: false, session: null };
    }

    const session = await findHifzSessionForSchedule(schedule, academicYearId);
    if (!session) return { standards: fallbackStandards, usedRules: false, session: null };

    const result = await db.query(
        `SELECT DISTINCT standard
         FROM hifz_session_rules
         WHERE academic_year_id = $1
           AND hifz_session_id = $2
           AND is_active = true
           AND ${dateWindowSql('hifz_session_rules')}
         ORDER BY standard`,
        [academicYearId, session.id, date || null]
    );

    const standards = result.rows.map((row: any) => String(row.standard || '').trim()).filter(Boolean);
    if (standards.length === 0) return { standards: fallbackStandards, usedRules: false, session };
    return { standards, usedRules: true, session };
}

export async function getEligibleHifzStudentsForSchedule(options: {
    schedule: any;
    academicYearId?: string | null;
    date?: string | null;
    mentorId?: string | null;
}) {
    const { schedule, academicYearId, date, mentorId } = options;
    const fallbackStandards = parseHifzStandardList(schedule?.standards).map(normalizeHifzStandard).filter(Boolean);

    if (!academicYearId || !isHifzSchedule(schedule)) {
        return { usedRules: false, students: null as any[] | null, standards: fallbackStandards, session: null };
    }

    const session = await findHifzSessionForSchedule(schedule, academicYearId);
    if (!session) return { usedRules: false, students: null as any[] | null, standards: fallbackStandards, session: null };

    const rulesRes = await db.query(
        `SELECT COUNT(*)::integer AS total
         FROM hifz_session_rules
         WHERE academic_year_id = $1
           AND hifz_session_id = $2
           AND is_active = true
           AND ${dateWindowSql('hifz_session_rules')}`,
        [academicYearId, session.id, date || null]
    );
    if (Number(rulesRes.rows[0]?.total || 0) === 0) {
        return { usedRules: false, students: null as any[] | null, standards: fallbackStandards, session };
    }

    const params: any[] = [academicYearId, session.id, date || null];
    let mentorFilter = '';
    if (mentorId) {
        params.push(mentorId);
        mentorFilter = `AND eligible.hifz_mentor_id = $${params.length}`;
    }

    const result = await db.query(
        `WITH base_students AS (
            SELECT s.adm_no, s.name, s.photo_url, s.standard AS legacy_standard,
                   COALESCE(sys.school_standard, s.standard) AS effective_standard,
                   sys.school_section AS effective_section,
                   COALESCE(sys.hifz_mentor_id, s.hifz_mentor_id) AS hifz_mentor_id
            FROM students s
            LEFT JOIN student_year_snapshots sys
              ON sys.student_id = s.adm_no
             AND sys.academic_year_id = $1
            WHERE COALESCE(LOWER(s.status), 'active') = 'active'
        ),
        rule_matches AS (
            SELECT DISTINCT b.*
            FROM base_students b
            JOIN hifz_session_rules r
              ON r.academic_year_id = $1
             AND r.hifz_session_id = $2
             AND r.is_active = true
             AND ${dateWindowSql('r')}
             AND r.standard = b.effective_standard
             AND (r.section IS NULL OR r.section = '' OR COALESCE(b.effective_section, '') = r.section)
             AND (r.mentor_id IS NULL OR r.mentor_id = b.hifz_mentor_id)
        ),
        includes AS (
            SELECT DISTINCT b.*
            FROM base_students b
            JOIN student_hifz_session_assignments a
              ON a.academic_year_id = $1
             AND a.hifz_session_id = $2
             AND a.student_id = b.adm_no
             AND a.assignment_type = 'include'
             AND a.is_active = true
             AND ${dateWindowSql('a')}
        ),
        eligible AS (
            SELECT * FROM rule_matches
            UNION
            SELECT * FROM includes
        )
        SELECT eligible.adm_no, eligible.name,
               COALESCE(eligible.effective_standard, eligible.legacy_standard) AS standard,
               eligible.photo_url,
               false AS is_temp
        FROM eligible
        WHERE NOT EXISTS (
            SELECT 1
            FROM student_hifz_session_assignments a
            WHERE a.academic_year_id = $1
              AND a.hifz_session_id = $2
              AND a.student_id = eligible.adm_no
              AND a.assignment_type = 'exclude'
              AND a.is_active = true
              AND ${dateWindowSql('a')}
        )
        ${mentorFilter}
        ORDER BY standard, name`,
        params
    );

    const standards = Array.from(new Set(result.rows.map((row: any) => row.standard).filter(Boolean)));
    return { usedRules: true, students: result.rows, standards, session };
}
