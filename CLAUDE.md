# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Institution OS** — a Hifz (Quran memorization) ERP system for an Islamic boarding institution. It manages students, staff (Usthaads/mentors), Quran progress tracking, attendance, finance, leaves, and exams across multiple user portals (Admin, Principal, Staff, Parent).

## Architecture Overview

This is a **monorepo** with two separate applications:

### Frontend — Next.js App (`/src`)
- Next.js with App Router, React 19, TypeScript (strict)
- Three portals: `/admin`, `/staff`, `/parent` — each with its own layout and auth guard
- UI built with **Shadcn/UI** + **Radix UI** + **Tailwind CSS 4**
- Forms: **React Hook Form** + **Zod** validation
- Charts: **Recharts**
- All API calls use the axios instance at `src/lib/api.ts` → `http://127.0.0.1:5000/api`
- Path alias: `@/*` maps to `./src/*`

### Backend — Express API (`/backend/src`)
- Express 5 + TypeScript, runs on port **5000**
- All routes mounted under `/api/` prefix in `backend/src/index.ts`
- JWT authentication: `verifyToken` middleware reads `Authorization: Bearer` header or `auth_token` httpOnly cookie
- Role-based access: `requireRole(roles[])` middleware
- Direct PostgreSQL via `pg` pool (`backend/src/config/db.ts`) — **not** using Supabase JS client
- File uploads via `multer`; static files served at `/public`

### Database — Supabase (PostgreSQL)
- Hosted on Supabase (AWS ap-southeast-2)
- Schema migrations in `supabase/migrations/` (SQL files, timestamped)
- RLS is enabled but does **not** affect backend queries (backend uses direct `pg` pool bypassing RLS)

## Development Commands

### Both apps together (from repo root)
```bash
npm run dev           # Runs frontend + backend concurrently (uses `concurrently`)
npm run dev:frontend  # Next.js only (port 3000)
npm run dev:backend   # Express only (port 5000) — equivalent to `cd backend && npm run dev`
```

### Frontend-only commands (from repo root)
```bash
npm run build     # Next.js production build
npm run lint      # Run ESLint
```

### Backend-only commands (from `/backend`)
```bash
npm run dev       # Express with nodemon + ts-node (port 5000)
npm run build     # Compile TypeScript → dist/
npm start         # Run compiled output
```

There are **no test scripts** in this repo — neither app has Jest/Vitest configured. Don't claim a fix is "tested" via test runner; verify changes by running the app and exercising the feature in the browser.

## Environment Variables

**Root `.env.local`** (Next.js):
```
NEXT_PUBLIC_API_URL=http://127.0.0.1:5000/api
```

**`backend/.env`** (Express):
```
DATABASE_URL=...    # Supabase PostgreSQL URL
JWT_SECRET=...
```

## Auth & Identity

- JWT payload: `{ id: staff.id, profile_id, email, role, name }` — `id` is the `staff` table UUID
- `staff.profile_id` = Supabase auth UUID (different from `staff.id`)
- `getStaffId(req)` in `backend/src/utils/staff.utils.ts` resolves the actual `staff.id` from JWT (handles delegation context too)
- Roles: `admin`, `principal`, `vice_principal`, `controller`, `staff`, `usthad`, `mentor`, `parent`
- **MENTOR_ROLES** = `['staff', 'usthad', 'mentor']` — all three have identical filtered access (only see their assigned students)

### Delegation System
A parent can grant a staff member delegation access. Delegation tokens are issued server-side and stored in `sessionStorage` as `delegationToken`. The frontend attaches them as `x-delegation-token` header; `verifyDelegation` middleware (must run after `verifyToken`) attaches `req.delegation` with `actingAsStaffId`.

## Backend Route → Controller Pattern

Each domain: `routes/*.routes.ts` wires routes → `controllers/*.controller.ts`. All DB queries are raw SQL via `db.query(sql, params)` — no ORM.

Route prefixes: `/api/auth`, `/api/students`, `/api/staff`, `/api/attendance`, `/api/hifz`, `/api/leaves`, `/api/finance`, `/api/exams`, `/api/classes`, `/api/academics`, `/api/reports`, `/api/delegations`, `/api/parent`, `/api/chat`, `/api/upload`, `/api/events`

## Key Domain Concepts

### Attendance System

Two separate DB tables:
- `student_attendance_marks` — per-student records `(schedule_id, student_id, date, status, marked_by)`
- `attendance_marks` — master completion marker per `(schedule_id, date, marked_by)` — used to show "Marked" badge in the UI

**Per-mentor isolation**: `attendance_marks` has `UNIQUE (schedule_id, date, marked_by)`. Each mentor's mark is independent. Dashboard queries filter by `marked_by = user.id` for mentor roles, while admin/principal see all marks.

**Admin marking on behalf of a mentor**: Pass `on_behalf_of: mentorId` in the POST `/api/attendance/mark` body. Backend uses this as `marked_by` so the session appears as "Marked" in the mentor's portal.

**Attendance edit windows** (`ROLE_LIMITS` in `attendance_dashboard.controller.ts`):
- `staff` / `usthad` / `mentor`: 3 days
- `admin` / `principal` / `vice_principal` / `controller`: 30 days

**Day of week**: System uses 1=Mon, 2=Tue ... 6=Sat. Sunday (0) has no classes.

### Leave Lifecycle

`pending → approved → outside → completed` (also: `cancelled`, `rejected`)

- `approved`: leave granted, student has not yet exited
- `outside`: student has physically exited — mark as OUTSIDE in attendance **regardless of end_datetime** (student may be overdue past expected return)
- `completed`: student has returned

When checking if a student is absent due to leave, the backend query covers both cases:
```sql
(status = 'approved' AND start_datetime::date <= $date AND end_datetime::date >= $date)
OR (status = 'outside')
```

### Hifz Progress

- Completion % = (completed Juz / 30) × 100
- A Juz is only "complete" when its final verse is recorded in **New Verses** mode
- Study modes: (1) New Verses — Surah + verse range; (2) Recent Revision — last 5–10 pages; (3) Juz Revision — by Juz with portion (Full / Half / Q1/Q2/Q3/Q4)
- Sessions: **Subh / Breakfast / Lunch** (3 daily)

### Mentor–Student Assignment

Three mentor columns on `students`: `hifz_mentor_id`, `school_mentor_id`, `madrasa_mentor_id`. Class type maps to mentor column:
```
hifz → hifz_mentor_id
school → school_mentor_id
madrasa / madrassa → madrasa_mentor_id
```

### Other Domain Notes

- **Student ID format**: `R001`, `R002`, ... (auto-generated)
- **Schedule standards** are stored as JSON arrays; normalize display labels → DB values via `normalizeScheduleStandard()` in `attendance_dashboard.controller.ts`
- **Photo URLs**: backend stores relative paths (e.g. `/public/avatars/x.jpg`). Use `resolveBackendUrl(url)` from `@/lib/utils` to convert — it derives the origin from `NEXT_PUBLIC_API_URL` so dev and prod both work. **Never hardcode `http://localhost:5000`** — that breaks production.
- **Staff portal** (`/staff`) is the "Mentor Portal" — same codebase for `staff`, `usthad`, and `mentor` roles

## Shared Frontend Helpers

- **`@/lib/api`** — the configured axios instance. Use for one-off requests and all writes (POST/PUT/DELETE). Logs every request in dev only (gated on `NODE_ENV`).
- **`@/lib/api-cache`** — `cachedGet(url, params?, ttlMs?)` for static-ish endpoints (`/staff`, `/classes/academic-years`, `/events`, etc.) plus an in-flight request dedup so multiple components requesting the same data share one network call. Call `invalidateCache(urlPrefix)` after a write that affects the cached resource. Already wired into the notification bell, admin home, admin/staff, admin/student-attendance, and academic-years pages.
- **`@/lib/utils`** — `cn()` for class merging, `resolveBackendUrl()` for photo/file URLs, `BACKEND_ORIGIN` constant.

## Backend Performance Patterns

Several patterns are used consistently throughout controllers — keep them when adding new endpoints:

- **Transactions**: always use `const client = await db.getClient()` + `client.query('BEGIN'/'COMMIT'/'ROLLBACK')` + `client.release()` in `finally`. **Never** use `db.query('BEGIN')` on the pool directly — the pool routes statements to different clients, silently breaking atomicity.
- **Bulk inserts/updates**: use Postgres `unnest($1::text[], $2::uuid[]) AS t(a, b)` to insert N rows in one round trip rather than looping with per-row queries. Examples: `markAttendance`, `bulkCreateHifzLogs`, `createGroupLeave`, `bulkRecordReturn`.
- **Parallel independent queries**: wrap them in `Promise.all` — applied to `getMyStudentsWithStats` (5 queries), `getStudentsForSchedule` (3 phases), and all 3 reports endpoints.
- **N+1 avoidance**: when a query needs an aggregate per N rows, fetch once and build a JS `Map` for O(1) lookup, OR use a `LATERAL JOIN`. Examples: `getMentorStudentCounts` in `attendance_dashboard.controller.ts`, `getHifzStudents` LATERAL joins.
- **Dev-only logging**: import `devLog` from `backend/src/utils/logger` for trace/debug noise. Keep `console.error` for actual errors. Don't add raw `console.log` to controllers.
- **PG pool config** (in `backend/src/config/db.ts`): tuned to `max: 20`, `idleTimeoutMillis: 30s`, `connectionTimeoutMillis: 5s` for multi-mentor concurrent load.

## Hot-Path Indexes

The migration `supabase/migrations/20260417120000_perf_hot_path_indexes.sql` adds composite indexes on the hot tables (`student_attendance_marks`, `attendance_marks`, `attendance_schedules`, `hifz_logs`, `mentor_delegations`, `student_leaves`, `staff_attendance`) and partial indexes on `students.{hifz,school,madrasa}_mentor_id`. Most existing query patterns assume these indexes exist. When writing new queries on these tables, prefer column orderings that match the existing indexes rather than adding new ones for marginal gains.

## Polling

Background polling intervals are intentionally tuned — don't tighten without reason:
- `NotificationBell` (`src/components/admin/top-nav.tsx`): 120s, uses `cachedGet` (60s TTL).
- `ChatLayout` conversation list: 15s. Active-conversation message poll: 3s (real-time chat).
- Admin students page auto-refresh: 3 min.

## Duplicate Admin Attendance Pages

There are **two separate admin attendance implementations** that must be kept in sync:
- `src/app/admin/student-attendance/page.tsx` — main admin attendance page (URL: `/admin/student-attendance`)
- `src/components/admin/department-attendance.tsx` — reusable component used in other admin views

Both share identical logic for: `openRoster`, `toggleStudent`, `submitRoster`, `statusBadgeStyle`, `statusIcon`, and the roster modal student rendering. When fixing bugs in one, check the other.

## Supabase Migrations

New schema changes go in `supabase/migrations/` as timestamped SQL files (e.g., `20260413000000_description.sql`). Apply them manually to the live database — there is no auto-migration runner.