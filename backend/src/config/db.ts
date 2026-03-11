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
  }
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle pg client', err);
  process.exit(-1);
});

export const db = {
  query: (text: string, params?: any[]) => {
    return pool.query(text, params);
  },
  getClient: () => {
    return pool.connect();
  }
};
