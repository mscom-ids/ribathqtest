import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres://')).or(z.string().startsWith('postgresql://')),
  JWT_SECRET: z.string().min(24),
  JWT_ISSUER: z.string().default('sadath-hifz-api'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  FRONTEND_ORIGIN: z.string().default('http://localhost:3000'),
  BOOTSTRAP_TENANT_ENABLED: z.coerce.boolean().default(false),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PHONE: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config = envSchema.parse(process.env);