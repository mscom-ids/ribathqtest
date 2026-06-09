# Institution OS Technical Audit

Audit date: 2026-06-04  
Repository: `D:\NewRQP`  
Scope: frontend, backend, database schema/migrations, dependencies, scripts, assets, environment setup, build/lint posture, and live database shape.

## Executive Summary

Institution OS is a multi-portal ERP for a Hifz/Quran memorization institution. It supports Admin, Principal/Vice Principal, Staff/Usthad/Mentor, Parent, attendance, Hifz progress, leaves, finance, exams, chat, reports, academic year history, promotions, class setup, and Hifz session eligibility.

The system is functional and has a lot of domain logic already implemented. The main risk is that the project is mid-migration: old production tables still drive attendance, Hifz, leaves, and many reports, while the new academic-year/history/enrollment layer is only partially adopted. This is the biggest production-readiness concern because reports can silently mix current `students.standard` data with historical snapshots/enrollments.

Overall health score: 68/100

Security score: 66/100  
Performance score: 70/100  
Scalability score: 72/100  
Maintainability score: 58/100  
Code quality score: 55/100  
Data model safety score: 74/100

## Remediation Update - 2026-06-04

Completed high-impact fixes from the first health pass:

- Browser auth is now cookie-only. The frontend no longer stores or reads `auth_token` from `localStorage`, and logout no longer tries to clear httpOnly cookies from JavaScript.
- Backend login responses no longer return JWTs in the JSON body; the httpOnly `auth_token` cookie remains the auth transport.
- Next.js route protection was moved from deprecated `middleware.ts` to `proxy.ts` for Next 16.
- Admin/principal/staff shell components now load identity through `/auth/me` instead of decoding JWTs in the browser.
- Hifz daily single-entry saves now call `/api/hifz/logs` instead of forcing a one-row request through `/api/hifz/logs/bulk`.
- Hifz entry uses the current `students.hifz_mentor_id` field instead of the old `assigned_usthad_id` alias when admin/principal records on behalf of a student.
- Hifz log create/bulk endpoints now validate mode, student, date, Juz number, verse range, and Juz portion before insert, and return actionable error messages for FK/check constraint failures.
- Generated/debug artifact lint scope was cleaned up, including `backend/dist`, scratch scripts, text/log dumps, and isolated Next build output.
- Verification:
  - `backend: npm run build` passed.
  - `frontend: NEXT_DIST_DIR=.next-build-check npm run build` passed when network access was allowed for Google Fonts.
  - `GET /api/hifz-session-rules` now resolves to the mounted route and returns `401` without auth, not `404`, confirming the route exists in the running API shape.

Current verified blockers:

- Root lint still fails with 1147 source problems: 913 errors and 234 warnings. Most are broad `any` typing, React hook dependency/state-in-effect rules, unused values, and image optimization warnings.
- This pass does not make the project 100/100. A real 100% health target still requires typed request/response contracts, route-level validation schemas, test coverage for core workflows, and completing academic-year read migration across reports/attendance/finance/exams.

## Audit Evidence

Commands and checks performed:

- File inventory with `rg --files`, excluding `node_modules`, `.next`, `backend/dist`, and `.git`.
- Live database introspection through `information_schema`, `pg_indexes`, and row counts.
- Route extraction from `backend/src/routes`.
- Dependency review from root `package.json`, backend `package.json`, and `npm audit --json`.
- Build checks:
  - `backend: npm run build` passed.
  - `frontend: npm run build` passed when network access was enabled for Google Fonts.
  - Root `npm run lint` failed with 1479 problems, heavily inflated by generated `backend/dist` and scratch/debug scripts being linted.

Important caveat: I did not expose secret values. `.env.local` and `backend/.env` are ignored by `.gitignore`, which is good, but they are present locally and should be handled carefully during deployment.

## Project Inventory

Total inventoried files excluding dependency/build folders: 483

By extension:

| Type | Count | Notes |
|---|---:|---|
| `.tsx` | 142 | Frontend pages/components |
| `.ts` | 89 | Frontend libs, backend controllers/routes/utils |
| `.js` | 67 | Many one-off debug/migration/repair scripts |
| `.png` | 48 | UI references, assets, screenshots |
| `.sql` | 45 | Schema and migrations |
| `.json` | 36 | Data, package locks, backups/debug output |
| `.csv` | 13 | Backup exports |
| `.txt` | 13 | Logs/errors/debug output |
| `.log` | 12 | Runtime/build logs |
| Other | 18 | SVG, MJS, MD, TOML, PY, HTML, JPEG, CSS |

Directory inventory:

| Area | Files | Purpose |
|---|---:|---|
| `src/app` | 94 | Next.js App Router pages and layouts |
| `src/components` | 52 | Shared UI, admin, staff, reports, chat components |
| `src/lib` | 10 | API client, auth helpers, Quran/Hifz utilities |
| `src/hooks` | 1 | Toast hook |
| `backend/src/controllers` | 24 | Express route handlers and business logic |
| `backend/src/routes` | 19 | Express route declarations and RBAC wiring |
| `backend/src/utils` | 11 | Shared backend helpers |
| `backend/src/config` | 2 | Postgres and Supabase admin clients |
| `backend/src/middleware` | 1 | JWT/delegation/RBAC middleware |
| `supabase/migrations` | 41 | Database migration history |
| `scripts` | 4 | Utility scripts |
| `public` | 50 | Static files and reference screenshots |

## Technology Stack

Frontend:

- Next.js 16.1.6 App Router
- React 19.2.3
- TypeScript 5
- Tailwind CSS 4
- Radix UI / shadcn-style components
- React Hook Form + Zod
- Axios API client
- Recharts
- Lucide React icons
- `next/font/google` for fonts

Backend:

- Express 5.2.1
- TypeScript 5.9.3
- PostgreSQL via `pg`
- Supabase Admin client for auth/storage integration
- JWT authentication
- bcrypt for legacy password fallback
- multer for file uploads
- express-rate-limit for auth and parent-login throttling
- xlsx for student exports

Database:

- Supabase PostgreSQL
- Raw SQL migrations
- RLS exists in schema, but the Express backend uses direct PostgreSQL/service access, so backend security depends primarily on Express middleware and query scoping.

Architecture style:

- Monorepo with two apps: Next.js frontend plus Express API backend.
- Modular monolith, not microservices.
- Backend is route-controller oriented, not clean architecture. Controllers directly contain SQL and business logic.
- Database is the main integration boundary.

## High-Level System Flow

```
Browser
  -> Next.js pages under /admin, /principal, /staff, /parent
  -> src/lib/api.ts Axios client
  -> Express API at /api/*
  -> verifyToken / verifyDelegation / requireRole
  -> controller raw SQL
  -> Supabase PostgreSQL
  -> JSON response
  -> page/component state updates
```

Authentication flow:

1. User submits credentials in `src/components/login-form.tsx`.
2. Backend `backend/src/controllers/auth.controller.ts` attempts:
   - local staff lookup,
   - legacy bcrypt password fallback,
   - Supabase Auth sign-in.
3. Backend signs a 7-day JWT.
4. Backend sets `auth_token` httpOnly cookie.
5. Backend also returns token in response body.
6. Frontend stores token in `localStorage` and also writes a non-httpOnly cookie through `document.cookie`.
7. `src/lib/api.ts` sends `Authorization: Bearer <token>` on API calls.
8. Backend `verifyToken` validates JWT cryptographically.
9. Next middleware only decodes JWT payload to choose portal redirects. It does not verify the signature.

Authorization flow:

- Backend role checks are centralized in `backend/src/middleware/auth.middleware.ts`.
- Domain route files define role groups, for example:
  - Students manage: admin, principal, vice_principal, controller
  - Finance: admin, principal, controller
  - Attendance: admin, principal, vice_principal, staff, usthad, mentor, controller
  - Parent: parent-only after `/api/parent/login`
- Mentor scoping is implemented inside controllers and helpers, not globally.

## Frontend Architecture

Main portals:

- Admin: `src/app/admin/*`
- Principal: `src/app/principal/*`
- Staff: `src/app/staff/*`
- Parent: `src/app/parent/page.tsx`
- Login: `src/app/login/page.tsx`

Major frontend modules:

| Module | Files | Notes |
|---|---|---|
| Admin dashboard | `src/app/admin/page.tsx` | Large page, institution summary and admin actions |
| Students | `src/app/admin/students/page.tsx`, `src/app/admin/students/[id]/page.tsx`, `src/components/admin/student-profile/*` | Student list/profile/editing |
| Principal portal | `src/app/principal/page.tsx`, `src/app/principal/_components/principal-ui.tsx`, `src/app/principal/students/*`, `src/app/principal/reports/page.tsx`, `src/app/principal/leaves/page.tsx` | Separate principal workspace was introduced, but still depends on legacy report data in places |
| Attendance | `src/components/admin/department-attendance.tsx`, `src/app/admin/student-attendance/page.tsx`, `src/app/staff/attendance/page.tsx` | Large components with complex schedule/mark/cancel logic |
| Hifz | `src/app/admin/hifz/*`, `src/components/staff/daily-entry-form.tsx`, `src/components/staff/HifzProgressModal.tsx` | Production Hifz logs and monthly calculations |
| Academic module | `src/app/admin/academic/*`, `src/app/admin/promotions/page.tsx`, `src/app/admin/academic-history/page.tsx` | New year/class/enrollment/history layer |
| Leaves | `src/app/admin/leaves/page.tsx`, `src/app/admin/leaves/*modal.tsx`, `src/app/admin/leaves/tabs/*` | Operational leave workflows |
| Finance | `src/app/admin/finance/*`, `src/app/staff/finance/page.tsx` | Fee plans, monthly fees, ledger, salary |
| Chat | `src/components/chat/ChatLayout.tsx`, `src/app/admin/chat/page.tsx`, `src/app/staff/chat/page.tsx` | Conversation, polling, image messages |
| Shared UI | `src/components/ui/*` | shadcn/Radix wrappers |

Largest frontend files:

- `src/app/parent/page.tsx` - 1174 lines
- `src/components/admin/department-attendance.tsx` - 1101 lines
- `src/components/staff/daily-entry-form.tsx` - 1011 lines
- `src/app/admin/staff/page.tsx` - 996 lines
- `src/app/staff/page.tsx` - 888 lines
- `src/app/staff/attendance/page.tsx` - 814 lines
- `src/app/admin/students/page.tsx` - 739 lines
- `src/components/chat/ChatLayout.tsx` - 709 lines
- `src/app/admin/student-attendance/page.tsx` - 686 lines
- `src/app/admin/page.tsx` - 660 lines

Frontend risks:

1. Many pages are doing data fetching, state management, UI layout, validation, and business logic in the same file.
2. `src/lib/api.ts` stores JWT in `localStorage`, increasing XSS blast radius.
3. Many UI actions use `alert()` / `confirm()` instead of controlled modals/toasts.
4. Many components use `any`, which weakens TypeScript safety.
5. Several components rely on legacy `student.standard`.
6. `next/font/google` requires network during build. Production build should either allow font fetches or self-host fonts.
7. `src/middleware.ts` uses deprecated middleware convention in Next.js 16; build warns to migrate to `proxy`.

## Backend Architecture

Backend entrypoint:

- `backend/src/index.ts`

Core middleware:

- CORS with configured `FRONTEND_URL` fallback to localhost.
- Compression.
- JSON parser.
- Cookie parser.
- Request timing / slow API logging.
- Auth route rate limiter.

Backend route files:

| Route file | Handlers | Prefix | Domain |
|---|---:|---|---|
| `academics.routes.ts` | 17 | `/api/academics` | Calendar, academic sessions, legacy attendance, discipline |
| `academic_history.routes.ts` | 9 | `/api/academic-history` | Years, snapshots, promotions, migration health |
| `access_control.routes.ts` | 3 | `/api/access-control` | Mentor recording/access policies |
| `attendance_dashboard.routes.ts` | 14 | `/api/attendance` | Production attendance schedules/marks/cancellations |
| `auth.routes.ts` | 3 | `/api/auth` | Login, logout, current user |
| `chat.routes.ts` | 13 | `/api/chat` | Conversations/messages |
| `classes.routes.ts` | 19 | `/api/classes` | Academic years, class setup, enrollments, schedules, class events |
| `delegations.routes.ts` | 9 | `/api/delegations` | Mentor delegation |
| `events.routes.ts` | 4 | `/api/events` | Calendar events |
| `exams.routes.ts` | 9 | `/api/exams` | Exams, subjects, marks |
| `finance.routes.ts` | 19 | `/api/finance` | Fee plans, payments, ledger, charges |
| `hifz.routes.ts` | 14 | `/api/hifz` | Hifz students, logs, monthly reports |
| `hifz_session_rules.routes.ts` | 4 | `/api/hifz-session-rules` | Hifz session setup/rules/assignments |
| `leaves.routes.ts` | 18 | `/api/leaves` | Leave lifecycle |
| `parent.routes.ts` | 4 | `/api/parent` | Parent login/dashboard/leave request |
| `reports.routes.ts` | 3 | `/api/reports` | Student/mentor/unified reports |
| `staff.routes.ts` | 14 | `/api/staff` | Staff records, mentor assignments, staff portal |
| `students.routes.ts` | 12 | `/api/students` | Student CRUD/export/discipline |
| `upload.routes.ts` | 1 | `/api/upload` | Avatar upload |

Total Express route handlers: 189.

Largest backend files:

- `backend/src/controllers/leaves.controller.ts` - 1282 lines
- `backend/src/controllers/attendance_dashboard.controller.ts` - 1229 lines
- `backend/src/controllers/hifz.controller.ts` - 800 lines
- `backend/src/controllers/academic_history.controller.ts` - 730 lines
- `backend/src/controllers/staff.controller.ts` - 663 lines
- `backend/src/controllers/reports.controller.ts` - 613 lines
- `backend/src/controllers/parent.controller.ts` - 584 lines
- `backend/src/controllers/students.controller.ts` - 528 lines
- `backend/src/controllers/chat.controller.ts` - 525 lines
- `backend/src/controllers/classes.controller.ts` - 498 lines

Backend strengths:

- Most SQL uses parameter binding.
- JWT verification is centralized.
- Role checks are explicitly declared in routes.
- Slow DB/API logging exists.
- Postgres pool has timeouts and retry logic for transient read errors.
- Heavy student list path has a light-column mode.
- Some hot-path indexes exist for attendance, reports, leaves, staff, and students.

Backend risks:

1. Controllers are too large and mix routing, validation, authorization, query building, transformation, and business rules.
2. No repository/service layer; duplicated logic appears across reports, attendance, staff, students, parent, and leaves.
3. Input validation is inconsistent. Some frontend forms use Zod, but backend endpoints mostly trust `req.body` and query params.
4. Several dynamic SQL fragments are safe only because internal whitelist maps are used. They must stay locked down.
5. Some destructive endpoints are permanent deletes where soft delete/archive would be safer, for example selected exam/disciplinary/event/enrollment operations.
6. Broad route-level role access requires every controller to correctly scope mentor/parent data.

## Database Analysis

Live public base tables: 59

Live row counts:

| Table | Rows | Purpose / status |
|---|---:|---|
| `students` | 397 | Master student records; still contains legacy operational fields |
| `staff` | 16 | Staff/mentor/admin records |
| `profiles` | 16 | Auth/profile role layer |
| `attendance_schedules` | 18 | Production attendance schedule definitions |
| `attendance_marks` | 429 | Per-schedule/day/mentor completion markers |
| `student_attendance_marks` | 4350 | Production student attendance facts |
| `attendance_cancellations` | 18 | Full/partial session cancellations |
| `hifz_logs` | 3710 | Production Hifz progress facts |
| `hifz_log_session_legacy` | 3710 | Archived legacy `session_type` values |
| `hifz_monthly_report_settings` | 2 | Monthly expected class-day settings |
| `student_leaves` | 429 | Production leave records |
| `student_movements` | 803 | Movement logs for outside/return tracking |
| `institutional_leaves` | 3 | Institution-level leaves |
| `leave_exceptions` | 4 | Leave exceptions |
| `academic_years` | 2 | Year definitions |
| `academic_year_settings` | 2 | Year lock/promotion/fee setting metadata |
| `academic_year_migration_reports` | 2 | History-layer migration logs |
| `student_school_enrollments` | 389 | New school enrollment history |
| `student_madrasa_enrollments` | 0 | New madrasa enrollment history, not yet populated |
| `student_hifz_profiles` | 132 | New Hifz profile/mentor/history preparation |
| `student_year_snapshots` | 529 | Academic-year snapshots |
| `promotion_batches` | 1 | Promotion batch metadata |
| `promotion_logs` | 131 | Promotion log rows |
| `promotion_previews` | 0 | Promotion preview table exists but unused |
| `classes` | 17 | New class setup rows |
| `enrollments` | 0 | Generic enrollment table exists but unused |
| `weekly_schedule` | 0 | New timetable schedule table exists but unused |
| `class_events` | 0 | New class event attendance architecture exists but unused |
| `attendance` | 0 | Old/new alternate attendance table exists but unused |
| `academic_sessions` | 0 | Older session model exists but unused |
| `academic_calendar` | 0 | Calendar policies empty |
| `academic_breaks` | 0 | Breaks empty |
| `exams` | 1 | Exam headers |
| `exam_subjects` | 1 | Exam subjects |
| `exam_results` | 0 | Exam marks currently empty |
| `fee_plans` | 1 | Fee plan |
| `monthly_fees` | 397 | Monthly fee generated rows |
| `payments` | 0 | Payment records |
| `payment_accounts` | 1 | Payment accounts |
| `charge_categories` | 8 | Charge categories |
| `student_charges` | 0 | Manual charges |
| `chat_conversations` | 12 | Chat conversations |
| `chat_messages` | 30 | Chat messages |
| `chat_participants` | 37 | Chat membership |
| `mentor_access_policies` | 2 | Hifz/attendance access windows |
| `mentor_delegations` | 1 | Delegation records |
| `staff_attendance` | 174 | Staff attendance |
| `events` | 0 | Events |
| `disciplinary_records` | 0 | Discipline |
| `hifz_sessions` | 1 | New Hifz session rule setup |
| `hifz_session_rules` | 0 | Rules not yet configured |
| `student_hifz_session_assignments` | 0 | Overrides not yet configured |
| `monthly_reports` | 0 | Older monthly report table unused |
| `deprecated_finance_settings_20260430` | 0 | Deprecated archive table |
| `deprecated_leaves_20260430` | 0 | Deprecated archive table |
| `deprecated_store_transactions_20260430` | 0 | Deprecated archive table |
| `deprecated_store_wallet_20260430` | 0 | Deprecated archive table |

Current academic-year state:

| Metric | Value |
|---|---:|
| Active students | 114 |
| Alumni students | 0 |
| Active students with legacy `students.standard` | 113 |
| Active students with `hifz_mentor_id` | 105 |
| School enrollments | 389 |
| Madrasa enrollments | 0 |
| Hifz profiles | 132 |
| Hifz session rules | 0 |
| Hifz session assignments | 0 |

Academic years:

| Year | Current | Locked | Notes |
|---|---|---|---|
| 2025-2026 | Yes | No | Holds historical/production data |
| 2026-2027 | No | No | New class setup/promotion target |

Class setup:

| Year | Type | Count |
|---|---|---:|
| 2026-2027 | School | 8 |
| 2026-2027 | Madrassa | 6 |
| 2026-2027 | Hifz | 3 |

Important correction: Subh/Morning/Noon should be attendance sessions, not exclusive Hifz classes. Existing `classes(type='Hifz')` should not drive attendance until the Hifz domain model is clarified.

## ERD-Style Relationship Map

Core identity:

```
profiles 1--0/1 staff
staff 1--many students via students.hifz_mentor_id
staff 1--many students via students.school_mentor_id
staff 1--many students via students.madrasa_mentor_id
students.adm_no is the main student FK target
```

Academic history:

```
academic_years 1--1 academic_year_settings
academic_years 1--many classes
academic_years 1--many student_school_enrollments
academic_years 1--many student_madrasa_enrollments
academic_years 1--many student_year_snapshots
students 1--many student_school_enrollments
students 1--many student_madrasa_enrollments
students 1--many student_year_snapshots
promotion_batches 1--many promotion_logs
```

Attendance production path:

```
attendance_schedules 1--many attendance_marks
attendance_schedules 1--many student_attendance_marks
students 1--many student_attendance_marks
staff 1--many attendance_marks through marked_by
attendance_schedules 1--many attendance_cancellations
```

Hifz production path:

```
students 1--many hifz_logs
staff 1--many hifz_logs through usthad_id
hifz_logs 1--1 hifz_log_session_legacy
```

Hifz session rules preparation:

```
academic_years 1--many hifz_sessions
hifz_sessions 1--many hifz_session_rules
hifz_sessions 1--many student_hifz_session_assignments
students 1--many student_hifz_session_assignments
```

Leaves:

```
students 1--many student_leaves
students 1--many student_movements
institutional_leaves 1--many student_leaves
student_leaves 1--many student_movements
```

Finance:

```
students 1--many monthly_fees
students 1--many payments
students 1--many student_charges
fee_plans influence generated monthly_fees
charge_categories 1--many student_charges
payment_accounts 1--many payments
```

Exams:

```
exams 1--many exam_subjects
exams 1--many exam_results
exam_subjects 1--many exam_results
students 1--many exam_results
```

Chat:

```
chat_conversations 1--many chat_messages
chat_conversations 1--many chat_participants
staff/profiles participate through chat_participants
```

## Data Model Findings

Critical:

1. `students.standard` is still a core operational dependency.
   - Found 158 code references to legacy standard/class fields.
   - Affects `students.controller.ts`, `attendance_dashboard.controller.ts`, `reports.controller.ts`, `leaves.controller.ts`, `staff.controller.ts`, multiple admin/principal/staff frontend pages.

2. The system has two attendance architectures:
   - Production: `attendance_schedules`, `attendance_marks`, `student_attendance_marks`.
   - Unused/future: `attendance`, `class_events`, `weekly_schedule`.
   - Recommendation: officially mark production tables as canonical until class-events architecture is fully migrated.

3. `student_madrasa_enrollments` is empty.
   - Madrasa class history is not reliable yet.
   - Do not generate historical Madrasa reports from enrollments until backfilled/verified.

4. `enrollments` is empty while specific enrollment tables are populated.
   - Generic `enrollments` may be redundant or a future bridge table.
   - Avoid using it for production reports unless a clear migration plan exists.

5. `classes(type='Hifz')` exists but should not represent Subh/Morning/Noon.
   - Hifz sessions can be multiple per student.
   - Current table rows must be audited/renamed/archived before users assume they are real cohorts.

6. Academic year boundaries look timezone-shifted in raw DB output.
   - `2025-2026` start displayed as `2025-12-31T18:30:00.000Z`, which likely represents `2026-01-01` IST.
   - All date APIs should consistently emit date-only strings, not timezone-shifted Date objects.

High:

7. `academic_years.is_locked` and `academic_year_settings.year_locked` duplicate the same concept.
8. `academic_year_settings.school_fee_plan_id` and `madrasa_fee_plan_id` exist, but finance still primarily uses generic/current fee plans.
9. Historical reports must never infer historical class from `students.standard`.
10. `hifz_log_session_legacy` now preserves old session type, but most Hifz reporting does not surface it.
11. Deprecated finance/store tables exist and are empty; they should be archived to a separate schema or documented as intentionally retained.

## API Analysis

Total route handlers: 189.

API strengths:

- Most domains are separated by route file.
- Protected routes generally use `verifyToken` and `requireRole`.
- Login and parent login are rate limited.
- Attendance, Hifz, reports, and leaves have domain-specific access logic.

API risks:

1. Some route groups grant broad access, then rely on controller-level filtering.
   - Example: `/api/attendance/*`, `/api/classes/*`, `/api/hifz/*`, `/api/reports/*`.
   - Risk: one missing mentor filter can leak cross-student data.

2. Destructive endpoints exist:
   - `DELETE /api/classes/academic-years/:id`
   - `DELETE /api/classes/enrollments/:id`
   - `DELETE /api/classes/schedule/:id`
   - `DELETE /api/exams/subjects/:subject_id`
   - `DELETE /api/events/:id`
   - `DELETE /api/students/disciplinary/:id`
   - `DELETE /api/chat/messages/:messageId`
   - Recommendation: convert operational deletes to archive/soft-delete plus audit trail.

3. Exports expose large student datasets.
   - `GET /api/students/export`
   - `GET /api/students/download-excel`
   - These are management-role protected, but should have audit logging and explicit download permissions.

4. Backend validation is inconsistent.
   - Many endpoints accept raw `req.body` without Zod/Joi/class-validator equivalent.
   - Recommendation: add per-route validation schemas.

5. `auth.controller.ts` returns a JWT in the response body.
   - This supports localStorage auth, but weakens the security model.
   - Prefer httpOnly cookie-only in production.

## Security Audit

Severity legend: Critical, High, Medium, Low.

| Severity | Issue | Evidence | Recommendation |
|---|---|---|---|
| High | JWT stored in localStorage | `src/lib/api.ts`, `src/components/login-form.tsx` | Move to httpOnly cookie-only auth; remove token from response body |
| High | Frontend writes non-httpOnly auth cookie | `src/components/login-form.tsx` uses `document.cookie` | Let backend own auth cookies |
| High | Next middleware decodes but does not verify JWT | `src/middleware.ts` | Use backend session check for sensitive gating or accept it only as UX redirect |
| High | Backend bypasses Supabase RLS through direct Postgres/service access | `backend/src/config/db.ts`, `backend/src/config/supabase.ts` | Treat Express middleware as primary security boundary; add controller tests |
| High | Mentor data scoping is not centralized | Multiple controllers | Add `requireStudentScope` / `scopeQueryForUser` helper and test it |
| Medium | File upload trusts MIME and extension | `backend/src/controllers/upload.controller.ts` | Validate actual magic bytes; strip metadata; virus-scan in production |
| Medium | Broad CORS accepts no-origin requests | `backend/src/index.ts` | Keep for dev only; tighten production |
| Medium | Missing CSRF protection for cookie-auth writes | Cookie auth plus JSON writes | Add CSRF token or same-site strict production strategy |
| Medium | Destructive deletes lack explicit audit logging | Multiple routes | Add audit log table and soft deletes |
| Medium | Parent login with admission/DOB needs monitoring | `parent.routes.ts`, `parent.controller.ts` | Add stronger parent credentials or OTP eventually |
| Low | Dev logs can contain operational details | `src/lib/api.ts`, backend slow logs | Ensure production logging excludes sensitive bodies |

Positive security findings:

- `JWT_SECRET` and `DATABASE_URL` are startup-required.
- `.env*` is ignored by `.gitignore`.
- `npm audit` reported zero known vulnerabilities for both frontend and backend dependency graphs.
- Auth route rate limiting exists.
- Backend JWT verification uses `jsonwebtoken.verify`.

## Performance Audit

Observed performance signals:

- Slow DB/API logging is active.
- Logs show repeated slow queries in `students`, `leaves`, `reports`, `hifz/progress-summary`, and attendance endpoints.
- Large page/components increase client render cost.
- `student_attendance_marks` has 4350 rows and `hifz_logs` has 3710 rows, still small enough for straightforward indexes, but growth will matter.

Hot files:

- `backend/src/controllers/attendance_dashboard.controller.ts`
- `backend/src/controllers/leaves.controller.ts`
- `backend/src/controllers/hifz.controller.ts`
- `backend/src/controllers/reports.controller.ts`
- `src/components/admin/department-attendance.tsx`
- `src/app/parent/page.tsx`
- `src/components/staff/daily-entry-form.tsx`

Key bottlenecks:

1. Large frontend route components.
2. Multiple dashboards firing several independent API requests on load.
3. Repeated derivation of attendance/Hifz/leave status across controllers.
4. Reports still joining against legacy student standards.
5. Chat uses polling endpoint `/api/chat/poll/:conversationId`; acceptable short-term but not ideal long-term.
6. Root lint scans generated and scratch files, making developer feedback slow and noisy.

Recommendations:

- Add API aggregation endpoints for portal home pages.
- Keep `light=true` patterns for student lists.
- Move heavy student profile tabs to lazy-loaded child components.
- Add query-level read models for principal dashboard, attendance dashboard, and monthly Hifz report.
- Add request coalescing/client caching for repeated `staff`, `students/counts`, `classes/academic-years`, and `hifz/logs`.
- Consider replacing polling chat with WebSocket/Supabase Realtime later.

## Code Quality Review

Root ESLint result:

- 1479 total problems.
- 1218 errors.
- 261 warnings.

Important: this count is inflated because generated `backend/dist` and many scratch/debug scripts are linted. This is itself a project hygiene issue.

Main code quality issues:

1. Large files doing too many jobs.
2. `any` usage throughout frontend and backend.
3. Direct SQL inside controllers.
4. Duplicate standard/class parsing logic.
5. Duplicate date handling logic.
6. Duplicate mentor scoping logic.
7. Many `alert()` and `confirm()` calls in production UI.
8. Scratch/debug/migration scripts live in root and backend root.
9. Backup CSV/JSON/log/error files live in the application repository.
10. README is still mostly default Next.js content.

Cleanup candidates:

- Root scripts: `scratch*.js`, `debug*.json`, `temp_*.json`, `ts_errors*.txt`, `errors.txt`, `fix_*.js`, `check_*.js`, `r152_logs.json`, `hifz_students.json`.
- Backend root scripts: `fix*.ts`, `debug*.ts`, `check_*.js`, `migrate_*.js`, `reset_*.js`, `scratch_*.js`, `output.txt`, `schema_output.txt`, `rls_result.txt`.
- Generated: `backend/dist` should not be linted and should not be part of source review.
- Backups: `backup_2026-04-30T11-25-21`, `pgsql.zip`, `pgsql_bin` should be outside the app repo or ignored/documented.

## Business Logic Validation

Strong domain areas:

- Hifz progress supports New Verses, Recent Revision, Juz Revision, Juz Revision New/Old.
- Attendance production model tracks per-schedule, per-date, per-mentor marking.
- Leave lifecycle has status transitions and movement records.
- Academic-year history layer was designed additively and preserves historical rows.
- Principal portal has been separated from admin-style UI.

Main business logic risks:

1. Active/alumni logic is partially fixed but must be enforced everywhere.
   - Operational dashboards should use `status='active'`.
   - Historical/alumni views should be separate.

2. Current year and historical year modes are not uniformly implemented.
   - `students.controller.ts` has snapshot fallback for class filtering.
   - Many other endpoints still read `students.standard`.

3. Madrasa class information is not migrated.
   - `student_madrasa_enrollments = 0`.
   - Do not trust academic-year Madrasa reports until backfilled.

4. Hifz session rules exist but are not configured.
   - `hifz_session_rules = 0`.
   - `student_hifz_session_assignments = 0`.
   - Attendance falls back to `attendance_schedules.standards`.

5. Fees are not fully academic-year based.
   - `academic_year_settings` has fee plan fields, but finance generation still primarily uses current/global plan logic.

6. Date/time handling can show IST/UTC shifts.
   - Date-only fields should remain date-only through API contracts.

## DevOps and Deployment Review

Build status:

- Backend TypeScript build: passed.
- Frontend production build: passed with network access enabled.
- First frontend build failed under restricted network because Google Fonts could not be fetched.
- Root lint: failed.

Deployment risks:

1. `next/font/google` requires external font fetch at build time.
   - Self-host fonts or ensure CI has network.

2. `src/middleware.ts` is deprecated in Next.js 16.
   - Migrate to `proxy`.

3. No CI/CD config found.
   - Add GitHub Actions or equivalent for lint, typecheck, build, migration dry-run.

4. No test runner scripts.
   - `backend/src/__tests__/auth-security.test.ts` exists but is not wired to package scripts.

5. Root `npm run lint` scans generated/debug files.
   - Fix ESLint ignore patterns before making lint a gate.

6. Backups/logs/debug outputs are in the workspace.
   - Move to `/artifacts`, external storage, or ignored backup location.

7. Environment setup is not documented enough.
   - README still has default Next.js content.

## Dependency Review

Dependency audit:

- Root `npm audit --json`: 0 vulnerabilities.
- Backend `npm audit --json`: 0 vulnerabilities.

Frontend dependency notes:

- `@supabase/ssr` and `@supabase/supabase-js` are present, but frontend mostly talks to Express.
- `js-cookie` is used for token/cookie flows and should be removed once auth becomes httpOnly cookie-only.
- `framer-motion`, `recharts`, `react-phone-input-2`, and full Radix stack are reasonable but should be checked for actual usage before production bundle optimization.

Backend dependency notes:

- `@types/multer` is in dependencies, not devDependencies.
- `xlsx` is known to be a large dependency; acceptable for exports but isolate server-only usage.
- `express-rate-limit`, `compression`, `cookie-parser`, `multer`, `pg`, `bcrypt`, `jsonwebtoken` all match current architecture.

## Top 20 Critical Issues

1. Legacy `students.standard` remains heavily used despite the new academic-year architecture.
2. `student_madrasa_enrollments` is empty, so Madrasa history is incomplete.
3. Hifz session rules are not configured, so attendance still falls back to schedule standards.
4. JWT is stored in `localStorage`.
5. Frontend writes a non-httpOnly auth cookie.
6. Next middleware decodes unverified JWT payloads for routing.
7. Backend security depends on controller-level scoping because direct Postgres bypasses RLS.
8. Large controllers create high regression risk.
9. Large frontend pages/components create high UX and maintenance risk.
10. No centralized backend validation layer.
11. No automated test suite wired into package scripts.
12. Root lint is unusable as a quality gate.
13. Generated `backend/dist` and scratch/debug files are included in lint/project surface.
14. Production and future attendance architectures coexist without a clear canonical boundary.
15. Finance is not fully academic-year based.
16. Destructive delete endpoints lack consistent audit/soft-delete behavior.
17. Date-only DB fields can be exposed as timezone-shifted timestamps.
18. Parent login relies on admission/DOB style identity and needs stronger production hardening.
19. Build depends on Google Fonts network availability.
20. README/deployment docs do not describe the actual ERP system.

## Top 20 Quick Wins

1. Add `.eslintignore` or eslint config ignores for `backend/dist`, backups, logs, scratch scripts.
2. Move scratch/debug scripts into `tools/archive` or remove them after backup.
3. Replace default README with real setup/deployment/runbook.
4. Remove frontend `document.cookie` token write.
5. Stop returning JWT in login response once cookie-only auth is ready.
6. Add `SameSite`/CSRF strategy documentation for production.
7. Add backend validation schemas for auth, students, attendance, Hifz logs, leaves, finance.
8. Add a `dateOnly()` serializer utility.
9. Add a centralized `getEffectiveStudentClass(student, academicYearId)` helper.
10. Create a dependency map for all remaining `students.standard` usages and migrate by endpoint.
11. Backfill `student_madrasa_enrollments`.
12. Configure Hifz session rules or keep the feature hidden until setup is complete.
13. Archive/rename incorrect Hifz class rows if they represent sessions, not cohorts.
14. Add audit logging for finance, leave, student status, promotion, and delete actions.
15. Self-host fonts.
16. Add `npm run typecheck` scripts for frontend and backend.
17. Wire backend auth/security tests into `npm test`.
18. Split `leaves.controller.ts` into services: eligibility, lifecycle, movement, institutional.
19. Split `department-attendance.tsx` into schedule grid, roster modal, cancellation modal, data hooks.
20. Add dashboard aggregation endpoints for principal/admin/staff.

## Refactoring Roadmap

Critical, 1-2 weeks:

- Establish source-of-truth rules:
  - Attendance production source is `attendance_schedules` + `attendance_marks` + `student_attendance_marks`.
  - Hifz production source is `hifz_logs` + `students.hifz_mentor_id` until session rules are fully configured.
  - Academic-year reporting source is `student_year_snapshots` and enrollment history.
- Fix lint scope so generated/debug files do not block development.
- Remove frontend-created auth cookie.
- Add backend validation for the highest-risk write endpoints.
- Create audit logging for student status, leave returns, finance payments, and promotions.

High priority, 2-4 weeks:

- Migrate remaining report/dashboard reads away from `students.standard`.
- Backfill Madrasa enrollments safely.
- Finalize Hifz session rules setup and verify roster generation.
- Split large controllers into service modules.
- Split large frontend pages into hooks/components.
- Add test runner and first tests for auth, mentor scoping, alumni exclusion, attendance roster, leave lifecycle.

Medium priority, 1-2 months:

- Make fees academic-year aware.
- Add current-year vs historical-year mode to all report APIs.
- Add soft delete/archive for operational records.
- Add CI pipeline.
- Add API request/response DTO types shared between backend/frontend or generated from schemas.
- Add production monitoring for slow APIs and DB timeouts.

Low priority, ongoing:

- Move backup artifacts out of repo.
- Replace alert/confirm with design-system modals/toasts.
- Improve route-level code splitting and lazy loading.
- Replace chat polling with realtime transport.
- Convert default README and CLAUDE notes into official engineering docs.

## Recommended Production Gate

Before production, require:

1. `npm run build` passes for frontend and backend in CI.
2. Lint scope is fixed and app source lint is under an agreed threshold.
3. Auth token storage is hardened.
4. All dashboards exclude alumni and inactive students from operational metrics.
5. All reports explicitly accept and respect `academic_year_id`.
6. Madrasa enrollment backfill is complete or Madrasa history features are hidden.
7. Hifz session rules are configured or disabled.
8. Destructive write actions have audit logs.
9. Backup/debug files are removed from deployment package.
10. A rollback plan exists for migrations and year-start promotions.

## Appendix A: Source File Module Index

This appendix is a practical file-level map. It focuses on source files that define runtime behavior. Root scratch/debug files and backup artifacts are covered under cleanup candidates because they should not remain part of the production application surface.

### Backend Entrypoint, Config, Middleware

| File | Purpose |
|---|---|
| `backend/src/index.ts` | Express app bootstrap, CORS, compression, JSON/cookie middleware, slow API logging, route mounting, health endpoint |
| `backend/src/config/db.ts` | PostgreSQL pool, SSL config, query retry for transient read errors, slow DB logging |
| `backend/src/config/supabase.ts` | Supabase Admin client for auth/storage |
| `backend/src/middleware/auth.middleware.ts` | JWT verification, delegation-token verification, role guard |

### Backend Routes

| File | Purpose |
|---|---|
| `backend/src/routes/auth.routes.ts` | Login/logout/current-user routes |
| `backend/src/routes/students.routes.ts` | Student listing, CRUD, exports, discipline subroutes |
| `backend/src/routes/staff.routes.ts` | Staff CRUD, mentor assignment, staff portal data |
| `backend/src/routes/attendance_dashboard.routes.ts` | Production attendance schedules, rosters, marks, cancellations, breaks |
| `backend/src/routes/hifz.routes.ts` | Hifz students/logs/progress/monthly reports |
| `backend/src/routes/leaves.routes.ts` | Personal/group/institutional leave lifecycle and movement history |
| `backend/src/routes/finance.routes.ts` | Fee plans, monthly fees, payments, ledger, finance settings |
| `backend/src/routes/exams.routes.ts` | Exams, subjects, marks |
| `backend/src/routes/classes.routes.ts` | Academic years, class setup, enrollments, weekly schedule, class events |
| `backend/src/routes/academics.routes.ts` | Academic sessions, calendar policies, legacy attendance, discipline |
| `backend/src/routes/academic_history.routes.ts` | Academic-year history, snapshots, migration reports, year-start wizard |
| `backend/src/routes/hifz_session_rules.routes.ts` | Hifz sessions, standard/section rules, student overrides |
| `backend/src/routes/reports.routes.ts` | Student reports, mentor reports, unified student progress |
| `backend/src/routes/parent.routes.ts` | Parent login, parent dashboard, parent leave request |
| `backend/src/routes/chat.routes.ts` | Conversations, messages, group/private chat, polling |
| `backend/src/routes/delegations.routes.ts` | Mentor delegation request/approval/token routes |
| `backend/src/routes/access_control.routes.ts` | Mentor access policy management and decision lookup |
| `backend/src/routes/events.routes.ts` | General event CRUD |
| `backend/src/routes/upload.routes.ts` | Avatar upload |

### Backend Controllers

| File | Purpose |
|---|---|
| `backend/src/controllers/auth.controller.ts` | Staff/Supabase/legacy login, JWT issue, cookie set/clear, current user lookup |
| `backend/src/controllers/students.controller.ts` | Student list/profile/create/update/export, alumni transition validation/cleanup, academic snapshot application |
| `backend/src/controllers/students.helpers.ts` | Student helper queries such as next ID and staff list |
| `backend/src/controllers/staff.controller.ts` | Staff CRUD, login provisioning, mentor assignments, staff dashboard/student stats |
| `backend/src/controllers/attendance_dashboard.controller.ts` | Attendance schedule creation, dashboard status, roster generation, marks, cancellation, mentor scoping |
| `backend/src/controllers/hifz.controller.ts` | Hifz student list, log CRUD/bulk create, progress summary, monthly report calculation/settings |
| `backend/src/controllers/leaves.controller.ts` | Leave eligibility, personal/group/institutional leave, return recording, outside/current presence, movement history |
| `backend/src/controllers/finance.controller.ts` | Fee plan list, student ledger, payment recording |
| `backend/src/controllers/finance.admin.controller.ts` | Finance dashboard/settings, categories, accounts, fee plan admin |
| `backend/src/controllers/finance.queries.controller.ts` | Finance read models for active students, ledger search, current monthly fees |
| `backend/src/controllers/finance.actions.1.ts` | Monthly fee generation and deletion |
| `backend/src/controllers/exams.controller.ts` | Exam CRUD, subject CRUD, marks upsert/query, student list for marks |
| `backend/src/controllers/classes.controller.ts` | Academic years, classes, class students, generic enrollments, schedules, events |
| `backend/src/controllers/academics.controller.ts` | Academic sessions, calendar policy, attendance table, discipline records |
| `backend/src/controllers/academic_history.controller.ts` | Academic-year settings, history health, snapshots, year-start preview/commit, promotion logs |
| `backend/src/controllers/hifz_session_rules.controller.ts` | Hifz session/rule/assignment setup CRUD |
| `backend/src/controllers/reports.controller.ts` | Student report aggregation, mentor reporting quality, unified progress report |
| `backend/src/controllers/parent.controller.ts` | Parent auth/dashboard/report/leave request |
| `backend/src/controllers/chat.controller.ts` | Chat conversations/messages/images/read state/polling |
| `backend/src/controllers/delegations.controller.ts` | Delegation requests/admin approval/token issuing |
| `backend/src/controllers/access_control.controller.ts` | Mentor access policy read/write and date decision |
| `backend/src/controllers/events.controller.ts` | Event CRUD |
| `backend/src/controllers/upload.controller.ts` | Multer memory upload and Supabase Storage avatar upload |

### Backend Utilities

| File | Purpose |
|---|---|
| `backend/src/utils/academic-year.ts` | Resolve academic-year context and apply snapshots to student rows |
| `backend/src/utils/attendance-report.ts` | Attendance report calculations and schedule/cancellation helpers |
| `backend/src/utils/hifz-session-eligibility.ts` | Hifz session rule fallback/eligibility logic for attendance rosters |
| `backend/src/utils/hifz-calculator.ts` | Hifz points/progress calculation |
| `backend/src/utils/mentor-access-policy.ts` | Date-window access decisions for attendance/Hifz recording |
| `backend/src/utils/quran-data.ts` | Quran page/verse data helpers |
| `backend/src/utils/quran-juz.ts` | Juz completion/boundary helpers |
| `backend/src/utils/server-cache.ts` | In-memory cache helpers |
| `backend/src/utils/staff.utils.ts` | Resolve staff ID from auth/delegation context |
| `backend/src/utils/surah-list.ts` | Surah metadata |
| `backend/src/utils/logger.ts` | Dev-only logging wrapper |

### Frontend Libraries and Hooks

| File | Purpose |
|---|---|
| `src/lib/api.ts` | Axios API client, auth/delegation header injection, 401 handling |
| `src/lib/auth.ts` | Frontend role lookup and role-to-portal redirect helper |
| `src/lib/api-cache.ts` | Client cache helper |
| `src/lib/academic-rules.ts` | Academic calendar/session rule helpers |
| `src/lib/hifz-progress.ts` | Hifz progress formatting/calculation helpers |
| `src/lib/quran-pages.ts` | Quran page mapping |
| `src/lib/quran_map.json` | Quran data mapping |
| `src/lib/supabaseClient.ts` | Supabase client helper |
| `src/lib/utils.ts` | Shared UI utility helpers |
| `src/lib/data/surah-list.ts` | Frontend Surah metadata |
| `src/hooks/use-toast.ts` | Toast hook |
| `src/middleware.ts` | Next route guard and role-based portal redirects |

### Frontend Shared Components

| File | Purpose |
|---|---|
| `src/components/login-form.tsx` | Login UI and auth token handling |
| `src/components/mode-toggle.tsx` | Theme toggle |
| `src/components/theme-provider.tsx` | Theme provider |
| `src/components/shared/EventModal.tsx` | Shared event modal |
| `src/components/chat/ChatLayout.tsx` | Chat UI, conversation/message state, polling/image send |
| `src/components/reports/UnifiedReportView.tsx` | Unified student report view |
| `src/components/parent/progress-ring.tsx` | Parent dashboard progress ring |
| `src/components/staff/AssignStudentsModal.tsx` | Staff delegation/assignment modal |
| `src/components/staff/HifzProgressModal.tsx` | Hifz progress details modal |
| `src/components/staff/daily-entry-form.tsx` | Staff Hifz daily/range entry form |
| `src/components/admin/admin-background-warmup.tsx` | Admin background preload/warmup behavior |
| `src/components/admin/command-bar.tsx` | Admin command/search action UI |
| `src/components/admin/department-attendance.tsx` | Core department attendance dashboard/roster/cancel UI |
| `src/components/admin/mobile-sidebar.tsx` | Admin mobile navigation |
| `src/components/admin/sidebar.tsx` | Admin desktop navigation |
| `src/components/admin/student-card.tsx` | Student card |
| `src/components/admin/top-header.tsx` | Admin header |
| `src/components/admin/top-nav.tsx` | Admin top navigation |
| `src/components/admin/student-profile/student-profile-view.tsx` | Student profile shell |
| `src/components/admin/student-profile/profile-header.tsx` | Student profile header |
| `src/components/admin/student-profile/juz-details-dialog.tsx` | Juz details dialog |
| `src/components/admin/student-profile/tabs/attendance-tab.tsx` | Student attendance tab |
| `src/components/admin/student-profile/tabs/disciplinary-tab.tsx` | Discipline tab |
| `src/components/admin/student-profile/tabs/exams-tab.tsx` | Exam tab |
| `src/components/admin/student-profile/tabs/progress-tab.tsx` | Hifz progress tab |
| `src/components/ui/*` | shadcn/Radix UI primitives used by pages/components |

### Frontend App Routes

| Route file | Purpose |
|---|---|
| `src/app/layout.tsx` | Root app layout, fonts, providers |
| `src/app/page.tsx` | Root landing/redirect page |
| `src/app/login/page.tsx` | Login page |
| `src/app/manifest.ts` | PWA manifest |
| `src/app/admin/layout.tsx` | Admin portal layout |
| `src/app/admin/page.tsx` | Admin dashboard |
| `src/app/admin/students/page.tsx` | Admin student list |
| `src/app/admin/students/create/page.tsx` | Create student |
| `src/app/admin/students/[id]/page.tsx` | Student detail/edit page |
| `src/app/admin/students/[id]/AdmissionDetailsTab.tsx` | Admission detail tab |
| `src/app/admin/students/[id]/ReligiousEducationTab.tsx` | Religious education tab |
| `src/app/admin/students/[id]/StudentDetailsLayout.tsx` | Student details layout helper |
| `src/app/admin/alumni/page.tsx` | Alumni list |
| `src/app/admin/staff/page.tsx` | Staff list/management |
| `src/app/admin/staff/create/page.tsx` | Create staff |
| `src/app/admin/staff/[id]/page.tsx` | Staff detail/edit |
| `src/app/admin/student-attendance/page.tsx` | Cross-student attendance page |
| `src/app/admin/[department]/attendance/page.tsx` | Department attendance page |
| `src/app/admin/school/attendance/page.tsx` | School attendance shortcut |
| `src/app/admin/madrassa/attendance/page.tsx` | Madrassa attendance shortcut |
| `src/app/admin/hifz/attendance/page.tsx` | Hifz attendance shortcut |
| `src/app/admin/hifz/tracking/page.tsx` | Hifz tracking dashboard |
| `src/app/admin/hifz/monthly-report/page.tsx` | Hifz monthly report |
| `src/app/admin/[department]/exams/page.tsx` | Exam list by department |
| `src/app/admin/[department]/exams/create/page.tsx` | Create exam |
| `src/app/admin/[department]/exams/[id]/page.tsx` | Exam detail/subjects |
| `src/app/admin/[department]/exams/[id]/marks/page.tsx` | Exam marks entry |
| `src/app/admin/leaves/page.tsx` | Leave management shell |
| `src/app/admin/leaves/*modal.tsx` | Leave creation/return/movement modals |
| `src/app/admin/leaves/tabs/*` | Leave tabs for active/outside/history/dashboard |
| `src/app/admin/finance/layout.tsx` | Finance layout |
| `src/app/admin/finance/dashboard/page.tsx` | Finance dashboard |
| `src/app/admin/finance/monthly-fees/page.tsx` | Monthly fee generation |
| `src/app/admin/finance/payments/page.tsx` | Payment recording |
| `src/app/admin/finance/settings/page.tsx` | Fee/account/category settings |
| `src/app/admin/finance/student-ledger/page.tsx` | Student ledger |
| `src/app/admin/finance/salary/page.tsx` | Salary page |
| `src/app/admin/finance/passcode-lock.tsx` | Finance lock component |
| `src/app/admin/calendar/page.tsx` | Calendar/events UI |
| `src/app/admin/chat/page.tsx` | Admin chat page |
| `src/app/admin/delegations/page.tsx` | Delegation management |
| `src/app/admin/mentor-access/page.tsx` | Mentor access policies |
| `src/app/admin/reports/students/page.tsx` | Student report list/export |
| `src/app/admin/reports/mentors/page.tsx` | Mentor report dashboard |
| `src/app/admin/academics/page.tsx` | Older academics page |
| `src/app/admin/academic-history/page.tsx` | History layer health page |
| `src/app/admin/academic/class-setup/page.tsx` | New class setup |
| `src/app/admin/academic/class-setup/[id]/students/page.tsx` | Class enrolled students |
| `src/app/admin/academic/enrollments/page.tsx` | Student class enrollment assignment |
| `src/app/admin/academic/hifz-session-rules/page.tsx` | Hifz session rules setup |
| `src/app/admin/promotions/page.tsx` | Year-start/promotion wizard |
| `src/app/admin/setup/academic-years/page.tsx` | Legacy academic-year setup |
| `src/app/admin/setup/classes/page.tsx` | Legacy class setup |
| `src/app/admin/setup/classes/[classId]/schedule/page.tsx` | Legacy class schedule |
| `src/app/admin/setup/classes/[classId]/students/page.tsx` | Legacy class students |
| `src/app/admin/timetable/setup/page.tsx` | Timetable setup |
| `src/app/admin/timetable/view/page.tsx` | Timetable view |
| `src/app/principal/page.tsx` | Principal dashboard |
| `src/app/principal/_components/principal-ui.tsx` | Principal portal UI and widgets |
| `src/app/principal/students/page.tsx` | Principal student search/list |
| `src/app/principal/students/[studentId]/page.tsx` | Principal student profile |
| `src/app/principal/reports/page.tsx` | Principal reports |
| `src/app/principal/leaves/page.tsx` | Principal leave view |
| `src/app/staff/layout.tsx` | Staff portal layout |
| `src/app/staff/page.tsx` | Staff dashboard |
| `src/app/staff/attendance/page.tsx` | Staff attendance |
| `src/app/staff/entry/[studentId]/page.tsx` | Staff Hifz entry page |
| `src/app/staff/student/[id]/page.tsx` | Staff student detail |
| `src/app/staff/assigned/page.tsx` | Assigned students/delegation |
| `src/app/staff/leaves/page.tsx` | Staff leave view |
| `src/app/staff/reports/page.tsx` | Staff reports |
| `src/app/staff/chat/page.tsx` | Staff chat |
| `src/app/staff/finance/page.tsx` | Staff finance view |
| `src/app/parent/page.tsx` | Parent dashboard |
| `src/app/parent/leave-request-modal.tsx` | Parent leave request modal |

### Database/Migration Files

| File group | Purpose |
|---|---|
| `supabase/schema.sql` | Base schema snapshot, including initial tables and RLS policies |
| `supabase/seed_admin.sql` | Admin seed data |
| `supabase/migrations/202402*` | Early monthly reports, exams, leaves, finance |
| `supabase/migrations/202403*` | Finance/RLS/student fixes |
| `supabase/migrations/202602*` | Attendance, departments, calendar, staff/student status, RLS hardening |
| `supabase/migrations/202603*` | Class overhaul, mentor system, student address fields |
| `supabase/migrations/202604*` | Attendance marks, leave types, performance/security/deprecations |
| `supabase/migrations/202605*` | Hifz modes, monthly report settings, access policies, current presence, performance indexes, session-type removal |
| `supabase/migrations/202606*` | Academic-year history, baseline backfill, class setup metadata, Hifz session rules |
