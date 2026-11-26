import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, closeDatabasePool } from '../config/db';
import { importAllocation, verifyAllocationStudents } from '../services/exam-portal.service';
import allocation from '../exam-allocation-nov26.json';

// Default is read-only. --apply installs the migration and creates/imports the supplied exam.
async function main() {
    const rows = allocation.centers.flatMap(c => c.students.map(s => ({ ...s, code: c.code })));
    const client = await db.getClient();
    try {
        const summary = await verifyAllocationStudents(client, rows);
        console.log(JSON.stringify(summary, null, 2));
        if (!process.argv.includes('--apply')) { console.log('Preview only. Add --apply to install and import.'); return; }
        const schema = await client.query("SELECT to_regclass('public.exam_portal_allocations') AS installed");
        if (!schema.rows[0].installed) await client.query(await fs.readFile(path.resolve(__dirname, '../../..', 'supabase/migrations/20261126000000_examiner_portals.sql'), 'utf8'));
        const administration = await client.query("SELECT to_regclass('public.exam_portal_admin_credentials') AS installed");
        if (!administration.rows[0].installed) await client.query(await fs.readFile(path.resolve(__dirname, '../../..', 'supabase/migrations/20261126010000_exam_administration_access.sql'), 'utf8'));
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('prepare-exam-portal-nov26'))");
        const slug = 'half-yearly-hifz-nov26';
        const examTitle = 'HALF YEARLY HIFZ EXAMINATION NOV 26';
        let exam = (await client.query('SELECT * FROM exams WHERE portal_slug=$1 FOR UPDATE', [slug])).rows[0];
        if (!exam) {
            const existingTitle = await client.query('SELECT id FROM exams WHERE title=$1', [examTitle]);
            if (existingTitle.rows.length) throw new Error('An exam with this title already exists. Use its admin portal to import the allocation.');
            exam = (await client.query("INSERT INTO exams(id,title,type,department,start_date,is_active,portal_slug,portal_enabled) VALUES($1,$2,'Hifz','Hifz','2026-11-26',true,$3,false) RETURNING *", [randomUUID(), examTitle, slug])).rows[0];
        }
        const existing = await client.query('SELECT a.student_id,a.serial_no,a.standard,a.student_name,c.code FROM exam_portal_allocations a JOIN exam_portal_centers c ON c.id=a.center_id WHERE a.exam_id=$1', [exam.id]);
        if (!existing.rows.length) await importAllocation(client, exam.id, rows, 'November workbook setup');
        else {
            const exact = existing.rows.length === rows.length && rows.every(r => existing.rows.some(s => s.student_id === r.admission_no && s.code === r.code && s.serial_no === r.serial_no && s.standard === r.standard && s.student_name === r.name));
            if (!exact) throw new Error('The existing exam allocation differs. Refusing to replace it.');
        }
        await client.query('COMMIT');
        console.log(JSON.stringify({exam_id:exam.id,title:exam.title,portal:`/hifz/exam/${slug}`,administration:`/admin/hifz/exams/${exam.id}/portal`,students:rows.length,portal_enabled:exam.portal_enabled,next:'Open examiner access in administration and generate passcodes for the centers you want to use.'},null,2));
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
main().catch(error => {console.error(error.message);process.exitCode=1;}).finally(()=>closeDatabasePool());
