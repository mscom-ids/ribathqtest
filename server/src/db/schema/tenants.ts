import { relations } from 'drizzle-orm';
import { boolean, date, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'inactive']);
export const academicYearStatusEnum = pgEnum('academic_year_status', ['open', 'locked', 'archived']);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: tenantStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantSettings = pgTable('tenant_settings', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  newLessonLabel: text('new_lesson_label').notNull().default('New Lesson'),
  revisionLabel: text('revision_label').notNull().default('Revision'),
  retentionLabel: text('retention_label').notNull().default('Retention'),
  parentAudioEnabled: boolean('parent_audio_enabled').notNull().default(false),
  parentDisciplineVisibility: boolean('parent_discipline_visibility').notNull().default(false),
  lateFeedsDiscipline: boolean('late_feeds_discipline').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const academicYears = pgTable('academic_years', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  isActive: boolean('is_active').notNull().default(false),
  status: academicYearStatusEnum('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantLabelIdx: uniqueIndex('academic_years_tenant_label_idx').on(table.tenantId, table.label),
  activeIdx: uniqueIndex('academic_years_one_active_per_tenant_idx').on(table.tenantId).where(sql`is_active = true`),
}));

export const tenantRelations = relations(tenants, ({ many, one }) => ({
  academicYears: many(academicYears),
  settings: one(tenantSettings),
}));

import { sql } from 'drizzle-orm';