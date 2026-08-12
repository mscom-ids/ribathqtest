# Prompt: Build/Extend the Institution OS Finance Setup Module

Use this as a standalone brief when asking a developer or AI assistant to build a new
finance-setup feature, or replicate this pattern in another module. It assumes no
prior context beyond the codebase itself.

## Project context

This is **Institution OS**, a Hifz (Quran memorization) ERP for an Islamic boarding
institution — Next.js (App Router, React 19, TS strict) frontend + Express 5 backend,
raw SQL over `pg` (no ORM), Supabase-hosted Postgres. See root `CLAUDE.md` for the
full architecture map before starting.

## What "Finance Setup" means here

Finance Setup is the **admin configuration surface** for the finance ledger — it does
not itself record money movement. It has four tabs, all under
`src/components/finance/finance-setup.tsx` → `<FinanceSetupPanel>`:

1. **Monthly billing** — trigger and preview the monthly fee generation run (calls
   `finance.billing.ts`'s `previewMonthlyFees` / `publishMonthlyFees`).
2. **Fee rules** — two independent forms:
   - *Base fee revisions*: create a new effective-dated institution-wide (or
     standard/division-scoped) fee amount. Historical schedules are **never edited**,
     only superseded by a new row with a later `effective_from`.
   - *Individual fee agreement*: a dated override for one student (fixed amount,
     discount %, discount amount, surcharge, or waiver).
3. **Categories & access** — two panels:
   - *Charge categories*: the authorized charge types (Medical, Laundry, Store,
     Exam Fees, etc.) — each has `allocation_priority`, `requires_approval`,
     `allow_staff_entry`.
   - *Staff finance access*: grant a specific staff member one capability
     (`charge:create` / `payment:collect` / `ledger:view`) scoped to a category and
     student-scope (`assigned` vs `all`), with an optional per-entry amount cap.
4. **Opening balances** — bulk-stage historical pending amounts into the new ledger
   without fabricating fake payment history (`obligation_type = 'opening_balance'`).

## Non-negotiable design rules (violate these and the ledger breaks)

1. **Immutability.** Every finance table has a `BEFORE DELETE` trigger
   (`finance_reject_delete()`) and, for `finance_fee_schedules` /
   `finance_student_fee_agreements`, a `BEFORE UPDATE` guard trigger that only
   permits touching `archived_at/archived_by/status` — never the substantive
   columns. **Never write a feature that mutates a posted obligation, payment, or
   fee schedule row.** Corrections happen via a new effective-dated row, a void
   (`finance_obligations.status = 'void'`), or a reversal
   (`finance_payments.status = 'reversed'`), each with a reason and actor recorded.
2. **Idempotency.** Every mutating endpoint accepts an `idempotency_key` and the
   service layer checks for a duplicate before inserting. Copy this pattern for any
   new mutation — see `createCharge` in `finance.service.ts` for the reference
   implementation (duplicate-detection SELECT before the INSERT, inside a
   transaction).
3. **Role vs. seat authority.** `resolveFinanceActor()` resolves privileges from the
   **role itself** for admin/controller/principal/vice_principal — an admin governs
   finance because they are the admin, not because their staff seat is
   `is_active = true`. Regular staff acting on granted permissions must be
   active. Do not regress this — it was a deliberate fix (see
   `backend/src/modules/finance/finance.auth.ts` comments).
4. **Transactions.** Any multi-statement write path uses
   `const client = await db.getClient()` +
   `BEGIN`/`COMMIT`/`ROLLBACK` + `client.release()` in `finally`. Never
   `db.query('BEGIN')` on the pool directly.
5. **Money as decimal strings, not floats.** Amounts are `numeric(12,2)` in
   Postgres and validated/converted via `backend/src/utils/finance-money.ts`
   (`moneyToPaise`, etc.) to avoid floating-point drift. Never do arithmetic on a
   JS `number` parsed from a currency field without going through that utility.
6. **Delegation is blocked.** Every mutating finance route is wrapped in
   `rejectFinanceDelegation` — a parent-granted mentor delegation token can never be
   used to touch finance data, even read. Keep this on any new mutating route.
7. **Data-scope profiles, not ad-hoc filtering.** Visibility (`assigned` vs `all`
   students, which categories a given staff member can see) is computed once via
   `buildFinanceAccessProfile` / `buildLedgerViewAccessProfile` in
   `finance.scope.ts`. New read endpoints should build a profile the same way
   rather than re-deriving scope logic inline.

## Where to add a new setup capability

- **New settings table** → new timestamped file in `supabase/migrations/`, follow
  the guard-trigger + `legacy_source/legacy_id` + `BEFORE DELETE reject` pattern
  used in `20260806010000_finance_ledger_foundation.sql`.
- **New service function** → `finance.service.ts`, name it as a verb
  (`createX`, `voidX`, `listX`) and thread `actor: FinanceActor` as the first
  argument so capability checks are enforced at the call site, not in the
  controller.
- **New controller export** → `finance.controller.ts`, wrap in `financeHandler()`,
  keep it a one-liner that calls the service and shapes the response.
- **New route** → `backend/src/routes/finance.routes.ts`, add
  `rejectFinanceDelegation` to any POST/PUT/DELETE.
- **New setup tab / form** → extend `FinanceSetupPanel`'s `SetupSection` union and
  add a `<SetupCard>` block; reuse `<SearchableSelect>` from
  `src/components/finance/searchable-select.tsx` for any student/staff picker
  instead of a plain `<select>` — it's already wired for type-to-filter and is the
  established pattern across the module.
- **New API client method** → `src/lib/finance-api.ts`, follow the existing
  `financeApi.addCharge` shape: typed input, `normalizeMutation(...)`, auto-generated
  `idempotency_key` if the caller didn't supply one.

## Verification checklist for any change here

1. `npx tsc --noEmit` clean.
2. Confirm the mutation is rejected for a delegated mentor session
   (`x-delegation-token` header present) — should 403 with
   `FINANCE_DELEGATION_FORBIDDEN`.
3. Confirm a duplicate submit (same `idempotency_key`) returns the original result,
   not a second row — check via the `duplicate: true` flag in the response.
4. Confirm the new/changed table still rejects a raw `DELETE` (the guard trigger
   should throw).
5. If it touches money, sanity-check the amount is stored as it was typed (no
   float rounding) by reading the row back from Postgres directly.
6. No manual test runner exists in this repo — verify by running the app
   (`npm run dev`) and exercising the feature in the browser, not by claiming
   "tested".

## Reference implementation to imitate

`createCharge()` in `finance.service.ts` is the canonical example of this module's
conventions end-to-end: capability check → transaction → idempotency-duplicate
check → insert → commit → return `{ duplicate, account }`. Model any new write
path on it.
