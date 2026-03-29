# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Institution OS** — a Hifz (Quran memorization) ERP system for an Islamic boarding institution. It manages students, staff (Usthaads/mentors), Quran progress tracking, attendance, finance, leaves, and exams across multiple user portals (Admin, Principal, Staff, Parent).

## Architecture Overview

This is a **monorepo** with two separate applications:

### Frontend — Next.js App (`/src`)
- Next.js 16 with App Router, React 19, TypeScript (strict)
- Three portals: `/admin`, `/staff`, `/parent` — each with its own layout and auth guard
- UI built with **Shadcn/UI** + **Radix UI** + **Tailwind CSS 4**
- Forms: **React Hook Form** + **Zod** validation
- Charts: **Recharts**
- API calls go through `src/proxy.ts` → `http://127.0.0.1:5000/api`
- Path alias: `@/*` maps to `./src/*`

### Backend — Express API (`/backend/src`)
- Express 5 + TypeScript, runs on port **5000**
- All routes mounted under `/api/` prefix
- JWT authentication via `Authorization: Bearer <token>` header
- Role-based access control middleware: `verifyToken` + `requireRole(roles[])`
- Direct PostgreSQL via `pg` pool (`backend/src/config/db.ts`) — **not** using Supabase JS client
- File uploads handled by `multer`

### Database — Supabase (PostgreSQL)
- Hosted on Supabase (AWS ap-southeast-2)
- Schema migrations in `supabase/migrations/` (SQL files)
- Row Level Security (RLS) is enabled on all tables
- The backend connects via raw `pg` pool using `DATABASE_URL`

## Key Domain Concepts

- **Student ID format**: `R001`, `R002`, ... (auto-generated)
- **Attendance edit window**: Staff can edit for 7 days; Admin/Principal have no limit
- **Hifz progress metric**: Completion % = (Total completed Juz / 30) × 100. A Juz is only "complete" when the final verse is recorded in "New Verses" mode.
- **Hifz study modes**:
  1. New Verses — Surah + verse range
  2. Recent Revision — last 5–10 pages (start_page / end_page)
  3. Juz Revision — by Juz with portion (Full / Half / Q1 / Q2 / Q3 / Q4)
- **Roles**: `admin`, `principal`, `vice_principal`, `controller`, `staff`, `parent`
- **Sessions**: Subh / Breakfast / Lunch (3 daily Hifz sessions)

## Development Commands

### Frontend
```bash
# From repo root
npm run dev       # Start Next.js dev server (port 3000)
npm run build     # Build for production
npm run lint      # Run ESLint
```

### Backend
```bash
# From /backend directory
npm run dev       # Start Express with nodemon + ts-node (port 5000)
npm run build     # Compile TypeScript → dist/
npm start         # Run compiled output
```

### Running Both
You need **two terminals** — one for frontend, one for backend. The frontend proxies API requests to `http://127.0.0.1:5000/api`.

## Environment Variables

**Root `.env.local`** (Next.js):
```
DATABASE_URL=...        # Supabase PostgreSQL URL
NEXT_PUBLIC_API_URL=http://127.0.0.1:5000/api
```

**`backend/.env`** (Express):
```
DATABASE_URL=...        # Same Supabase PostgreSQL URL
JWT_SECRET=...
```

## Auth Flow

1. Frontend POSTs credentials to `/api/auth/login`
2. Backend verifies password (bcrypt), returns JWT
3. JWT is stored client-side (cookies via `js-cookie`)
4. All subsequent API calls include `Authorization: Bearer <token>`
5. Backend middleware (`verifyToken`) decodes JWT and attaches `req.user` with `id` and `role`

## Backend Route → Controller Pattern

Each domain has a `routes/*.routes.ts` that wires Express routes to handler functions in `controllers/*.controller.ts`. All DB queries are raw SQL via `db.query(sql, params)` — there is no ORM.

## Supabase Migrations

New schema changes go in `supabase/migrations/` as timestamped SQL files (e.g., `20260327000000_description.sql`). The backend does **not** use Supabase JS client — it uses direct PostgreSQL connections, so RLS policies affect the Supabase dashboard but not backend queries.
