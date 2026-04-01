const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });

async function deleteMentors() {
    try {
        // Find usthad IDs
        const res = await pool.query("SELECT id, profile_id FROM staff WHERE role IN ('usthad', 'mentor')");
        const staffList = res.rows;
        
        if (staffList.length === 0) {
            console.log("No mentors found.");
            return;
        }

        const staffIds = staffList.map(s => `'${s.id}'`).join(',');
        const profileIds = staffList.map(s => s.profile_id ? `'${s.profile_id}'` : null).filter(Boolean).join(',');
        console.log("Found staff IDs:", staffList.map(s=>s.id));

        // 1. Unassign mentors from students
        const cols = ['_legacy_usthad_id', 'hifz_mentor_id', 'school_mentor_id', 'madrasa_mentor_id', 'assigned_usthad_id'];
        for (const col of cols) {
            try { await pool.query(`UPDATE students SET ${col} = NULL WHERE ${col} IN (${staffIds})`); console.log(`Cleared ${col} in students`); } catch (e) { }
        }

        // 2. Delete all other dependent records
        const allFksRes = await pool.query(`
            SELECT kcu.table_name, kcu.column_name 
            FROM information_schema.table_constraints tco
            JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tco.constraint_name AND kcu.constraint_schema = tco.constraint_schema
             JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tco.constraint_name AND ccu.constraint_schema = tco.constraint_schema
            WHERE tco.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'staff';
        `);
        
        // Remove chat_messages and others
        for (const fk of allFksRes.rows) {
            if (fk.table_name === 'students') continue;
            try { await pool.query(`DELETE FROM chat_receipts WHERE message_id IN (SELECT id FROM chat_messages WHERE sender_id IN (${staffIds}))`); } catch(e){}
            try { await pool.query(`DELETE FROM chat_reactions WHERE message_id IN (SELECT id FROM chat_messages WHERE sender_id IN (${staffIds}))`); } catch(e){}
            try { await pool.query(`DELETE FROM ${fk.table_name} WHERE ${fk.column_name} IN (${staffIds})`); console.log(`Cleared ${fk.table_name}.${fk.column_name}`); } catch(e){}
        }

        // 3. Delete staff
        await pool.query(`DELETE FROM staff WHERE id IN (${staffIds})`);
        console.log("Deleted mentors from staff table.");

        // 4. Delete profiles
        if (profileIds.length > 0) {
            const profFks = await pool.query(`
                SELECT kcu.table_name, kcu.column_name 
                FROM information_schema.table_constraints tco
                JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tco.constraint_name
                 JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tco.constraint_name
                WHERE tco.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'profiles';
            `);
            for (const fk of profFks.rows) {
                if (fk.table_name === 'staff') continue; 
                try { await pool.query(`DELETE FROM ${fk.table_name} WHERE ${fk.column_name} IN (${profileIds})`); } catch(e){}
            }
            try { await pool.query(`DELETE FROM profiles WHERE id IN (${profileIds})`); console.log("Deleted profiles."); } catch(e){console.log('Error deleting profiles:', e.message)}
            try { await pool.query(`DELETE FROM auth.users WHERE id IN (${profileIds})`); console.log("Deleted auth.users."); } catch(e){}
        }

        console.log("Success: Mentors removed successfully.");
    } catch (err) { 
        console.log('Final Error:', err.message); 
    }
    finally { pool.end(); }
}
deleteMentors();
