/**
 * Supabase Database Backup Script
 * Exports all table data as JSON and CSV files into a local "backup" folder.
 * Uses the Supabase JS client — no pg_dump or Docker required.
 */

const { createClient } = require(require('path').resolve(__dirname, 'backend/node_modules/@supabase/supabase-js'));
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const SUPABASE_URL = 'https://jbsirxvegnxsjqoeszdj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impic2lyeHZlZ254c2pxb2VzemRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA1NzM3NCwiZXhwIjoyMDg1NjMzMzc0fQ.8iRIWPN8ULHvILhrB0gK7ZamT2ROFpoOnOcxDqqDdkk';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Create backup directory with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const BACKUP_DIR = path.join(__dirname, `backup_${timestamp}`);

// --- Helper: Convert array of objects to CSV string ---
function jsonToCsv(data) {
  if (!data || data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  for (const row of data) {
    const values = headers.map(h => {
      let val = row[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') val = JSON.stringify(val);
      // Escape quotes and wrap in quotes if it contains comma, quote, or newline
      val = String(val);
      if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
}

// --- Fetch all rows from a table (handles pagination for large tables) ---
async function fetchAllRows(tableName) {
  const PAGE_SIZE = 1000;
  let allRows = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`  ❌ Error fetching "${tableName}": ${error.message}`);
      return null;
    }

    if (data && data.length > 0) {
      allRows = allRows.concat(data);
      from += PAGE_SIZE;
      if (data.length < PAGE_SIZE) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

// --- Main backup function ---
async function backup() {
  console.log('===========================================');
  console.log('   Supabase Database Backup');
  console.log(`   ${new Date().toLocaleString()}`);
  console.log('===========================================\n');

  // Step 1: Get list of all tables in the public schema
  console.log('📋 Fetching list of tables...');
  const { data: tables, error: tablesError } = await supabase.rpc('get_table_names');

  let tableNames = [];

  if (tablesError) {
    console.log('⚠️  Could not use RPC to get table names. Trying information_schema...');
    
    // Fallback: query information_schema directly
    const { data: schemaData, error: schemaError } = await supabase
      .from('information_schema.tables' /* won't work via PostgREST */)
      .select('table_name')
      .eq('table_schema', 'public');

    if (schemaError) {
      console.log('⚠️  information_schema not accessible via PostgREST either.');
      console.log('📝 Using manually specified table list. Let me discover tables...\n');
      
      // We'll try a list of common/known table names from your project
      // First, let's try to get them from pg_catalog via raw SQL
      const { data: pgData, error: pgError } = await supabase.rpc('exec_sql', {
        query: "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
      });

      if (!pgError && pgData) {
        tableNames = pgData.map(r => r.tablename);
      } else {
        // Last resort: try known tables from your project
        console.log('🔍 Attempting to discover tables by trying known names...\n');
        const possibleTables = [
          'profiles', 'students', 'staff', 'mentors', 'users',
          'attendance', 'attendance_records', 'attendance_marks',
          'hifz_entries', 'hifz_logs', 'hifz_records',
          'academic_records', 'academics', 'academic_calendar',
          'events', 'calendar_events', 'announcements',
          'leaves', 'leave_requests', 'leave_records',
          'delegations', 'delegation_records',
          'chat_messages', 'messages', 'conversations',
          'exam_results', 'exams', 'exam_schedules',
          'classes', 'sections', 'subjects',
          'daily_progress', 'progress_records',
          'breaks', 'break_schedules',
          'notifications', 'settings', 'app_settings',
          'quran_progress', 'recitation_records',
          'timetable', 'schedules'
        ];

        for (const name of possibleTables) {
          const { data, error } = await supabase.from(name).select('*').limit(1);
          if (!error) {
            tableNames.push(name);
          }
        }
      }
    } else if (schemaData) {
      tableNames = schemaData.map(r => r.table_name);
    }
  } else if (tables) {
    tableNames = tables.map(r => r.table_name || r.tablename || r);
  }

  if (tableNames.length === 0) {
    console.error('❌ Could not discover any tables. Exiting.');
    process.exit(1);
  }

  console.log(`✅ Found ${tableNames.length} tables: ${tableNames.join(', ')}\n`);

  // Step 2: Create backup directory
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(path.join(BACKUP_DIR, 'json'), { recursive: true });
  fs.mkdirSync(path.join(BACKUP_DIR, 'csv'), { recursive: true });
  console.log(`📁 Backup directory: ${BACKUP_DIR}\n`);

  // Step 3: Export each table
  const summary = [];

  for (const tableName of tableNames) {
    process.stdout.write(`⏳ Backing up "${tableName}"...`);

    const rows = await fetchAllRows(tableName);

    if (rows === null) {
      summary.push({ table: tableName, rows: 'ERROR', status: '❌' });
      continue;
    }

    // Save JSON
    const jsonPath = path.join(BACKUP_DIR, 'json', `${tableName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), 'utf8');

    // Save CSV
    const csvContent = jsonToCsv(rows);
    const csvPath = path.join(BACKUP_DIR, 'csv', `${tableName}.csv`);
    fs.writeFileSync(csvPath, csvContent, 'utf8');

    console.log(` ✅ ${rows.length} rows`);
    summary.push({ table: tableName, rows: rows.length, status: '✅' });
  }

  // Step 4: Print summary
  console.log('\n===========================================');
  console.log('   BACKUP SUMMARY');
  console.log('===========================================');
  console.log(`${'Table'.padEnd(35)} ${'Rows'.padStart(8)}  Status`);
  console.log('-'.repeat(55));
  for (const s of summary) {
    console.log(`${s.table.padEnd(35)} ${String(s.rows).padStart(8)}  ${s.status}`);
  }
  console.log('-'.repeat(55));
  console.log(`\n📁 Files saved to: ${BACKUP_DIR}`);
  console.log(`   📂 json/  — Full data in JSON format`);
  console.log(`   📂 csv/   — Data in CSV format (spreadsheet-compatible)`);
  console.log('\n✅ Backup complete!');
}

backup().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
