import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/sadath_hifz',
  },
  verbose: true,
  strict: true,
} satisfies Config;