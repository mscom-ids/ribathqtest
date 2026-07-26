require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    await client.connect();

    // 1. Get pre-repair counts
    const schedCountRes = await client.query("SELECT COUNT(*)::int as count FROM attendance_schedules");
    const preSchedCount = schedCountRes.rows[0].count;
    
    const markCountRes = await client.query("SELECT COUNT(*)::int as count FROM student_attendance_marks");
    const preMarkCount = markCountRes.rows[0].count;

    console.log(`Pre-repair counts: Schedules = ${preSchedCount}, Marks = ${preMarkCount}`);
    
    try {
        await client.query('BEGIN');

        // Fetch all current subjects
        const subjectsRes = await client.query(`
            SELECT id, academic_year_id, department, name, mentor_id, class_id, division
            FROM attendance_subjects
        `);

        // Group by logical identity key
        const groups = new Map();
        for (const s of subjectsRes.rows) {
            const key = [
                s.academic_year_id,
                String(s.department || '').toLowerCase(),
                String(s.name || '').trim().toLowerCase(),
                s.mentor_id || '00000000-0000-0000-0000-000000000000',
                s.class_id || '00000000-0000-0000-0000-000000000000',
                String(s.division || '').trim().toLowerCase()
            ].join('|');

            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(s);
        }

        console.log(`Unique logical subject groups found: ${groups.size} (out of ${subjectsRes.rows.length} total rows)`);

        let mergedGroupsCount = 0;

        for (const [key, rows] of groups.entries()) {
            if (rows.length > 1) {
                // Sort by ID to pick a deterministic canonical ID
                rows.sort((a, b) => a.id.localeCompare(b.id));
                const canonical = rows[0];
                const duplicates = rows.slice(1);
                const duplicateIds = duplicates.map(d => d.id);

                console.log(`Merging logical group: "${canonical.name}" for mentor ${canonical.mentor_id}`);
                console.log(`  Canonical ID: ${canonical.id}`);
                console.log(`  Duplicate IDs to remove: ${duplicateIds.join(', ')}`);

                // Repoint schedules
                const repointRes = await client.query(`
                    UPDATE attendance_schedules
                    SET subject_id = $1
                    WHERE subject_id = ANY($2::uuid[])
                `, [canonical.id, duplicateIds]);
                console.log(`  Repointed ${repointRes.rowCount} schedules.`);

                // Delete duplicate subjects
                const deleteRes = await client.query(`
                    DELETE FROM attendance_subjects
                    WHERE id = ANY($1::uuid[])
                `, [duplicateIds]);
                console.log(`  Deleted ${deleteRes.rowCount} duplicate subjects.`);

                mergedGroupsCount++;
            }
        }

        console.log(`Merged ${mergedGroupsCount} duplicate groups.`);

        // Create unique index to prevent future duplicates
        console.log("Creating unique index on attendance_subjects...");
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS attendance_subjects_logical_key_idx 
            ON attendance_subjects (
                academic_year_id,
                LOWER(department),
                LOWER(name),
                COALESCE(mentor_id, '00000000-0000-0000-0000-000000000000'::uuid),
                COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
                COALESCE(division, '')
            )
        `);

        await client.query('COMMIT');
        console.log("Transaction committed successfully.");
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Repair failed, rolled back:", err);
        throw err;
    }

    // 2. Post-repair checks
    const postSchedCountRes = await client.query("SELECT COUNT(*)::int as count FROM attendance_schedules");
    const postSchedCount = postSchedCountRes.rows[0].count;
    
    const postMarkCountRes = await client.query("SELECT COUNT(*)::int as count FROM student_attendance_marks");
    const postMarkCount = postMarkCountRes.rows[0].count;

    const subjectsCountRes = await client.query("SELECT COUNT(*)::int as count FROM attendance_subjects");
    const postSubjectsCount = subjectsCountRes.rows[0].count;

    console.log(`Post-repair counts: Schedules = ${postSchedCount}, Marks = ${postMarkCount}, Subjects = ${postSubjectsCount}`);

    if (preSchedCount !== postSchedCount || preMarkCount !== postMarkCount) {
        console.error("WARNING: Count mismatch detected!");
    } else {
        console.log("SUCCESS: Count verification passed.");
    }

    await client.end();
}

run().catch(console.error);
