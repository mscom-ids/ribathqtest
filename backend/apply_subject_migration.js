require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    await client.connect();
    
    // 1. Get pre-migration counts
    const schedCountRes = await client.query("SELECT COUNT(*)::int as count FROM attendance_schedules");
    const preSchedCount = schedCountRes.rows[0].count;
    
    const markCountRes = await client.query("SELECT COUNT(*)::int as count FROM student_attendance_marks");
    const preMarkCount = markCountRes.rows[0].count;

    console.log(`Pre-migration counts: Schedules = ${preSchedCount}, Marks = ${preMarkCount}`);
    
    try {
        await client.query('BEGIN');
        
        // 2. Create attendance_subjects table if it doesn't exist
        console.log("Creating attendance_subjects table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS attendance_subjects (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                academic_year_id UUID NOT NULL,
                department VARCHAR(100) NOT NULL,
                name VARCHAR(255) NOT NULL,
                mentor_id UUID,
                batch_id UUID,
                class_id UUID,
                division VARCHAR(100),
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. Add subject_id to attendance_schedules if it doesn't exist
        console.log("Adding subject_id column to attendance_schedules...");
        await client.query(`
            ALTER TABLE attendance_schedules 
            ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES attendance_subjects(id) ON DELETE SET NULL
        `);

        // 4. Backfill existing schedules
        console.log("Fetching existing schedules and groups...");
        const schedsRes = await client.query(`
            SELECT a.*, COALESCE(array_agg(asg.group_id ORDER BY asg.group_id) FILTER (WHERE asg.group_id IS NOT NULL), ARRAY[]::uuid[]) AS group_ids
            FROM attendance_schedules a
            LEFT JOIN attendance_schedule_groups asg ON asg.schedule_id = a.id
            GROUP BY a.id
        `);
        
        const schedules = schedsRes.rows;
        
        // Resolve group divisions so we can populate division column on subject if possible
        const groupsRes = await client.query(`
            SELECT id, division, standard FROM attendance_groups
        `);
        const groupMap = new Map(groupsRes.rows.map(g => [g.id, g]));

        const logicalSubjects = new Map();
        
        for (const s of schedules) {
            const key = [
                s.academic_year_id || 'null',
                s.class_type || 'null',
                s.name || 'null',
                s.mentor_id || 'null',
                s.class_id || 'null',
                JSON.stringify(s.standards || []),
                s.group_ids.join(',')
            ].join('|');
            
            if (!logicalSubjects.has(key)) {
                logicalSubjects.set(key, {
                    academic_year_id: s.academic_year_id,
                    department: s.class_type || 'school',
                    name: s.name || 'Unnamed Class',
                    mentor_id: s.mentor_id || null,
                    class_id: s.class_id || null,
                    group_ids: s.group_ids,
                    schedules: []
                });
            }
            logicalSubjects.get(key).schedules.push(s.id);
        }

        console.log(`Backfilling ${logicalSubjects.size} subjects...`);
        for (const [key, details] of logicalSubjects.entries()) {
            if (!details.academic_year_id) {
                // If schedule doesn't have academic_year_id, fall back to current active one
                const activeYearRes = await client.query("SELECT id FROM academic_years WHERE is_current = true LIMIT 1");
                details.academic_year_id = activeYearRes.rows[0]?.id;
            }
            
            // Determine division if any
            let division = null;
            if (details.group_ids.length > 0) {
                const divisions = details.group_ids.map(id => groupMap.get(id)?.division).filter(Boolean);
                if (divisions.length > 0 && new Set(divisions).size === 1) {
                    division = divisions[0];
                }
            }

            // Create or Find subject
            const insertSubjectRes = await client.query(`
                INSERT INTO attendance_subjects (academic_year_id, department, name, mentor_id, class_id, division)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            `, [
                details.academic_year_id,
                details.department,
                details.name,
                details.mentor_id,
                details.class_id,
                division
            ]);
            
            const subjectId = insertSubjectRes.rows[0].id;
            
            // Link schedules to this subject
            await client.query(`
                UPDATE attendance_schedules
                SET subject_id = $1
                WHERE id = ANY($2::uuid[])
            `, [subjectId, details.schedules]);
        }
        
        await client.query('COMMIT');
        console.log("Transaction committed successfully.");
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Migration failed, rolled back:", err);
        throw err;
    }

    // 5. Post-migration checks
    const postSchedCountRes = await client.query("SELECT COUNT(*)::int as count FROM attendance_schedules");
    const postSchedCount = postSchedCountRes.rows[0].count;
    
    const postMarkCountRes = await client.query("SELECT COUNT(*)::int as count FROM student_attendance_marks");
    const postMarkCount = postMarkCountRes.rows[0].count;
    
    const nullSubjectRes = await client.query("SELECT COUNT(*)::int as count FROM attendance_schedules WHERE subject_id IS NULL AND (is_deleted = false OR is_deleted IS NULL)");
    const nullSubjectsCount = nullSubjectRes.rows[0].count;

    console.log(`Post-migration counts: Schedules = ${postSchedCount}, Marks = ${postMarkCount}`);
    console.log(`Active schedules with null subject_id: ${nullSubjectsCount}`);

    if (preSchedCount !== postSchedCount || preMarkCount !== postMarkCount) {
        console.error("WARNING: Count mismatch detected!");
    } else {
        console.log("SUCCESS: Count verification passed.");
    }

    await client.end();
}

run().catch(console.error);
