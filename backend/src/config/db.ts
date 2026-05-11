import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load the root .env.local file which contains the standard NEXT_PUBLIC_SUPABASE_URL
// For production, this will be set via Render/DigitalOcean env variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

// In your .env.local, we assume you add a standard POSTGRES_URL string.
// If you only have NEXT_PUBLIC_SUPABASE_URL, you must construct the Postgres string
// or manually define POSTGRES_URL.
const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!postgresUrl) {
  console.error("FATAL ERROR: POSTGRES_URL or DATABASE_URL not found in environment.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: postgresUrl,
  // If connecting to external Supabase from localhost, SSL is required
  ssl: {
    rejectUnauthorized: false
  },
  // Tuned for several concurrent mentors hitting the dashboard at once.
  // pg defaults are max=10 / no idle timeout, which causes "waiting for
  // connection" stalls under multi-user load.
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle pg client', err);
  process.exit(-1);
});

const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS || 250);

function summarizeSql(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 220);
}

export const db = {
  query: async (text: string, params?: any[]) => {
    const startedAt = Date.now();
    try {
      return await pool.query(text, params);
    } finally {
      const duration = Date.now() - startedAt;
      if (duration >= SLOW_QUERY_MS) {
        console.warn(`[SLOW DB] ${duration}ms params=${params?.length || 0} sql="${summarizeSql(text)}"`);
      }
    }
  },
  getClient: () => {
    return pool.connect();
  }
};
