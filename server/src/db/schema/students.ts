import { integer, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, date } from 'drizzle-orm/pg-core';
import { tenants, academicYears } from './tenants';
import { users } from './users';

export const studentStatusEnum = pgEnum('student_status', ['active', 'inactive', 'alumni']);
export const enrollmentStatusEnum = pgEnum('enrollment_status', ['active', 'promoted', 'transferred', 'left']);
export const groupTypeEnum = pgEnum('group_type', ['hifz', 'tajweed', 'school', 'madrasa', 'revision', 'custom']);

export const students = pgTable('students', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  admissionNo: text('admission_no').notNull(),
  fullName: text('full_name').notNull(),
  preferredName: text('preferred_name'),
  dateOfBirth: date('date_of_birth'),
  joinedOn: date('joined_on'),
  status: studentStatusEnum('status').notNull().default('active'),
  mentorId: uuid('mentor_id').references(() => users.id),
  parentUserId: uuid('parent_user_id').references(() => users.id),
  guardianName: text('guardian_name'),
  guardianPhone: text('guardian_phone'),
  address: text('address'),
  healthNotes: text('health_notes'),
  learningPlan: text('learning_plan'),
  currentSurah: integer('current_surah'),
  currentAyah: integer('current_ayah'),
  currentJuz: integer('current_juz'),
  currentPage: integer('current_page'),
  target: jsonb('target').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantAdmissionIdx: uniqueIndex('students_tenant_admission_no_idx').on(table.tenantId, table.admissionNo),
  tenantStatusIdx: index('students_tenant_status_idx').on(table.tenantId, table.status),
  mentorIdx: index('students_tenant_mentor_status_idx').on(table.tenantId, table.mentorId, table.status),
  parentIdx: index('students_tenant_parent_status_idx').on(table.tenantId, table.parentUserId, table.status),
}));

export const studentProgressSummary = pgTable('student_progress_summary', {
  studentId: uuid('student_id').primaryKey().references(() => students.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  currentSurah: integer('current_surah'),
  currentAyah: integer('current_ayah'),
  currentJuz: integer('current_juz'),
  currentPage: integer('current_page'),
  lastRecordId: uuid('last_record_id'),
  lastRecitedAt: timestamp('last_recited_at', { withTimezone: true }),
  approvedRecordCount: integer('approved_record_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('student_progress_summary_tenant_idx').on(table.tenantId),
}));

export const grades = pgTable('grades', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantNameIdx: uniqueIndex('grades_tenant_name_idx').on(table.tenantId, table.name),
}));

export const divisions = pgTable('divisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  gradeId: uuid('grade_id').notNull().references(() => grades.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  gradeNameIdx: uniqueIndex('divisions_grade_name_idx').on(table.gradeId, table.name),
  tenantIdx: index('divisions_tenant_idx').on(table.tenantId),
}));

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  groupType: groupTypeEnum('group_type').notNull().default('custom'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  yearNameIdx: uniqueIndex('groups_year_name_idx').on(table.academicYearId, table.name),
  tenantYearIdx: index('groups_tenant_year_idx').on(table.tenantId, table.academicYearId),
}));

export const studentEnrollments = pgTable('student_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  gradeId: uuid('grade_id').references(() => grades.id),
  divisionId: uuid('division_id').references(() => divisions.id),
  status: enrollmentStatusEnum('status').notNull().default('active'),
  promotedFromId: uuid('promoted_from_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  yearStudentIdx: uniqueIndex('student_enrollments_year_student_idx').on(table.academicYearId, table.studentId),
  tenantYearIdx: index('student_enrollments_tenant_year_idx').on(table.tenantId, table.academicYearId),
  studentIdx: index('student_enrollments_student_idx').on(table.studentId),
}));

export const groupMemberships = pgTable('group_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  groupStudentYearIdx: uniqueIndex('group_memberships_group_student_year_idx').on(table.groupId, table.studentId, table.academicYearId),
  tenantYearIdx: index('group_memberships_tenant_year_idx').on(table.tenantId, table.academicYearId),
  studentIdx: index('group_memberships_student_idx').on(table.studentId),
}));