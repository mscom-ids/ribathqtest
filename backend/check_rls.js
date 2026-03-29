require('dotenv').config();
const { Client } = require('pg');

async function main() {
    const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    
    // Check RLS status on staff table
    console.log('=== RLS STATUS ===');
    const rlsCheck = await c.query(`
        SELECT relname, relrowsecurity, relforcerowsecurity 
        FROM pg_class 
        WHERE relname = 'staff'
    `);
    console.log('Staff table RLS:', rlsCheck.rows[0]);
    
    // Check RLS policies on staff table
    console.log('\n=== RLS POLICIES ===');
    const policies = await c.query(`
        SELECT policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies 
        WHERE tablename = 'staff'
    `);
    policies.rows.forEach(p => {
        console.log(`  Policy: ${p.policyname}`);
        console.log(`    permissive: ${p.permissive}`);
        console.log(`    roles: ${p.roles}`);
        console.log(`    cmd: ${p.cmd}`);
        console.log(`    qual: ${p.qual}`);
        console.log(`    with_check: ${p.with_check}`);
    });

    // Check current role
    const role = await c.query('SELECT current_user, current_setting(\'role\')');
    console.log('\n=== CURRENT USER/ROLE ===');
    console.log(role.rows[0]);

    // Check profiles RLS too
    console.log('\n=== PROFILES RLS ===');
    const profilesPolicies = await c.query(`
        SELECT policyname, permissive, roles, cmd, qual
        FROM pg_policies 
        WHERE tablename = 'profiles'
    `);
    profilesPolicies.rows.forEach(p => {
        console.log(`  Policy: ${p.policyname} | cmd: ${p.cmd} | qual: ${p.qual}`);
    });

    await c.end();
}
main().catch(console.error);
