import fs from 'node:fs/promises';
import path from 'node:path';
import { closeDatabasePool, db } from '../config/db';

const STAGING_PROJECT_REF = 'ayrzgpoxbvwtdkzqktze';

async function main() {
  const migrationArgument = process.argv[2];
  if (!migrationArgument) throw new Error('Pass a migration path relative to the repository root.');
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  if (!supabaseUrl.includes(STAGING_PROJECT_REF)) {
    throw new Error('Refusing migration: the loaded environment is not the approved staging Supabase project.');
  }

  const repositoryRoot = path.resolve(__dirname, '../../..');
  const migrationPath = path.resolve(repositoryRoot, migrationArgument);
  if (!migrationPath.startsWith(path.join(repositoryRoot, 'supabase', 'migrations') + path.sep)) {
    throw new Error('Refusing migration outside supabase/migrations.');
  }
  const sql = await fs.readFile(migrationPath, 'utf8');
  await db.query(sql);
  console.log(`Applied ${path.basename(migrationPath)} to staging ${STAGING_PROJECT_REF}.`);
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabasePool());
