# Ribath staging environment

The staging Supabase project is `Ribath Staging` (`ayrzgpoxbvwtdkzqktze`). It is
separate from the live `Ribath_det` project. Never reuse production database,
service-role, JWT, or storage credentials in these files.

## Local staging run

1. Copy `.env.staging.example` to `.env.staging.local`.
2. Copy `backend/.env.staging.example` to `backend/.env.staging.local`.
3. Fill only the credentials from the `Ribath Staging` Supabase project.
4. Run `npm run dev:staging`.

The staging launcher injects these files into the child processes without
modifying `.env.local` or `backend/.env`, so the production configuration stays
unchanged.

## Data policy

Staging starts without real users. If realistic test data is needed, copy only a
small anonymized subset. Replace names, phone numbers, email addresses, addresses,
identity numbers, photos, message text, and authentication secrets. Never restore
a raw production backup into a developer-accessible staging project.

## Deployment

Create two non-production deployments: one backend and one Next.js frontend.
Configure the backend first, then set `BACKEND_API_URL` and
`NEXT_PUBLIC_API_URL` in the frontend to the staging backend `/api` URL. Use a
different JWT secret and different Supabase credentials from production.
