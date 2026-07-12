import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const userRoleEnum = pgEnum('user_role', ['super_admin', 'admin', 'mentor', 'parent']);
export const userStatusEnum = pgEnum('user_status', ['active', 'inactive']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  role: userRoleEnum('role').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  passwordHash: text('password_hash').notNull(),
  status: userStatusEnum('status').notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantRoleIdx: index('users_tenant_role_idx').on(table.tenantId, table.role),
  tenantStatusIdx: index('users_tenant_status_idx').on(table.tenantId, table.status),
  phoneIdx: uniqueIndex('users_tenant_phone_unique_idx').on(table.tenantId, table.phone),
  emailIdx: uniqueIndex('users_tenant_email_unique_idx').on(table.tenantId, table.email),
}));

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('refresh_tokens_user_idx').on(table.userId),
  tenantIdx: index('refresh_tokens_tenant_idx').on(table.tenantId),
}));