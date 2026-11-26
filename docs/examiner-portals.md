# Hifz examiner portals

The examiner portal extends the existing Next.js frontend, Express API and PostgreSQL exam tables. External examiners use a center code and passcode, without an institution account or access to the campus admin screens.

## November 2026 exam

The supplied workbook is preserved in `backend/src/exam-allocation-nov26.json`. It contains exactly 132 unique admission numbers. All names and admission numbers were matched to existing student records. Centers A–E and H–J have 13 students each; F and G have 14 each. Serial numbers restart at 1 for each center. Workbook class labels, including Plus One, Plus Two and Non-class, remain in the exam roster. Import never changes campus student records or academic placements.

The prepared exam is **HALF YEARLY HIFZ EXAMINATION NOV 26**. Its examiner URL is `/hifz/exam/half-yearly-hifz-nov26`, with administration at `/hifz/exam/half-yearly-hifz-nov26/administration`. On the deployed site, the same paths use your site's hostname.

## First use

1. Start the project with `npm run dev`, or deploy both frontend and backend using the existing project deployment process.
2. Sign in to the main admin portal with an existing institution administrator account.
3. Open **Admin → Hifz → Exams → HALF YEARLY HIFZ EXAMINATION NOV 26**. In **Examination administration passcode**, set a passcode of at least 8 characters or generate one. Share it privately with this exam’s administrators. The standalone **Examination administration** link asks only for this passcode and grants access to this exam only. Changing the passcode ends its existing administration sessions.
4. Under **Centers & examiners**, enter an examiner name and set a passcode for any center you want to use. Use **Set examiner passcode** to type your own (at least 6 characters), or click **Use HYEN00A** for Center A and then **Set passcode**. The same suggestion follows each center’s letter, through HYEN00J for Center J. **Generate random** remains available as an alternative. Centers can be set up one at a time. Copy the login details and give them privately to that examiner. Passcodes are displayed only when set or generated. Changing a passcode immediately invalidates that center's existing sessions.
5. Under **Portal & subjects**, review the default **Hifz Valuation** subject for every roster standard: 10 questions, 10 marks each, maximum 100 and pass mark 40. Configure different subjects or question counts before marking starts. A subject with saved marks cannot be reconfigured.
6. Check **Open examiner access** and save whenever you want to open the portal. This switch works independently of student, subject and center setup; you do not have to generate passcodes for all centers first.
7. Send examiners the exam URL and their passcode. Examiners select their center from the dropdown and enter the passcode. Only centers with generated passcodes appear. Examiner login remains separate from your administrator login.

The administration page shows a **Center access** summary of centers with generated passcodes. The remaining centers can be configured later, even while the portal is open. If no passcodes have been generated, the open portal shows an empty state. Examiners can use **Refresh available centers** to load newly enabled centers. Closing access hides the center list and prevents examiner login and session access. Ticking the access checkbox is an unsaved change until **Save settings** succeeds.

Examiners see only their assigned students. They enter the Juz/portion, whole-number question marks and optional remarks. Blank marks stay blank; zero is a valid mark. Drafts persist after logout. Final submission requires every question, the Juz and an examiner confirmation, then locks that subject valuation.

Submitted totals are saved to the existing `exam_results` table in the same transaction as the detailed valuation. They appear in the usual admin exam marks screen. Drafts are excluded from official results. Manual total entry is blocked for students and subjects managed by the question-marking portal, keeping the two views consistent.

## Administration

- **Progress:** student and valuation counts, pending/draft/submitted status, center progress and class summaries. A student is complete only when all configured subjects are submitted. Average/highest/lowest percentages use completed students only.
- **Portal & subjects:** customize the URL name, enable/disable access, verify/import allocations and configure questions. Future Hifz exams automatically receive a unique URL when created in the normal exam screen.
- **Centers & examiners:** name examiners, generate/reset passcodes, lock/unlock centers, create/delete empty centers and move students. Moving students works between centers that already have generated passcodes, preserves marks and renumbers the source center. Open examiner pages refresh automatically within about 10 seconds and when focused. The initial import never redistributes students.
- **Results & reports:** filter by center/class/name/admission number; print student lists, individual results, blank or completed valuation sheets; export the complete register and center sheets as Excel. Center lists print two centers side by side. Browser Print → Save as PDF produces PDF copies.
- **Reopen:** confirm reopening a submitted valuation under Results & reports. Its previous details remain in Activity. Its published result is removed until the examiner submits again. Reopen the exam/center too if either is locked.
- **Reset a student’s exam marks:** under Results & reports, search/select one student and confirm **Reset student marks**. This deletes that student’s drafts and published results for every subject in the current exam, clears prior mark snapshots from the marking history, and keeps the student and center assignment. Other students and other exams are unchanged. Old open forms cannot restore the cleared marks; the examiner opens the student again to start blank.
- **Activity:** inspect the latest 100 administrative and marking events, including prior mark values. Passcodes and session tokens are never included.

The existing campus student-management screens remain the place to add, edit or deactivate students. Exam allocation uses existing admission numbers and keeps a separate roster snapshot.

## New exam allocation

Create a Hifz exam in the normal admin exam screen, then open **Manage examiner portal**. Verify and import the bundled November allocation, or upload a workbook with sheets named `Exam Center A`, `Exam Center B`, etc. The first five columns are serial number, admission number, name, class/standard and Juz. Question columns are not imported as saved marks. Missing admission numbers, duplicate students, repeated/gapped serial numbers and unknown campus admission numbers are rejected. Import is atomic and refuses to replace an existing roster. After importing, manage individual changes using the move control.

## Database installation and repeatable setup

Apply `supabase/migrations/20261126000000_examiner_portals.sql` once to the application's existing database. The migration adds exam URLs/question settings, centers, allocations, hashed sessions, valuations and an audit log. New portal tables have RLS enabled with no direct anon/authenticated access; the existing backend enforces authorization.

Also apply `supabase/migrations/20261126010000_exam_administration_access.sql` for administration passcodes, separate exam administration sessions and reset revisions. Administration sessions are separate from institution and examiner sessions, expire after 8 hours, and cannot change their own administration passcode or access any other exam. Passcode configuration remains on the institution admin exam page.

Alternatively, the setup command checks existing admissions, applies the migration if absent, creates the November exam, and imports the verified allocation:

```powershell
# Read-only preview, using the existing database environment:
node backend/node_modules/ts-node/dist/bin.js backend/src/scripts/prepare-exam-portal.ts

# Apply migration and prepare the November exam:
node backend/node_modules/ts-node/dist/bin.js backend/src/scripts/prepare-exam-portal.ts --apply
```

Repeating setup verifies the existing allocation and refuses to overwrite differences. Examiner access starts closed. Dates/name can be adjusted for future exams using normal exam creation. Existing database connection variables and administrator authentication are reused; no new environment variables are required. HTTPS is required in production for secure examiner cookies.

## Running during the examination

Use the production server for live marking. Stop the development servers, then run:

```powershell
npm run build:exam
npm run start:exam
```

This builds and starts both the frontend and backend without development compilation or hot reload. Keep the backend close to the PostgreSQL region when deploying; database network latency still affects response time.

The login screens use one bootstrap request, including session detection, with no expected pre-login 401 requests. Successful login returns the dashboard or assigned roster directly. These reads use a single database statement rather than serial queries, and activity history loads when its tab is opened. Session cleanup runs outside the login response. Login requests time out after 15 seconds with a retry message if the connection fails. Session access, transfers, resets, passcode rotation and final-submission checks remain server-enforced.

## Verification commands

```powershell
npm run build --prefix backend
npx tsc --noEmit
npm run build

# Use a disposable LOCAL PostgreSQL cluster only (default port 55439):
$env:EXAM_TEST_DATABASE_URL = 'postgres://postgres@127.0.0.1:55439/postgres'
node scripts/test-exam-portal.cjs 'C:\path\to\Exam Center Valuation Sheets with Serial Numbers.xlsx'
```

The integration test creates a uniquely named temporary database, installs the migration, tests exact allocations, authorization, validation, concurrent edits, persistence, submission, normal admin results, reopening, locking, passcode revocation, center moves and Excel exports, then drops only its own temporary database. It refuses remote database hosts. The optional `EXAM_PORTAL_UI_CHECKS=1` additionally runs mobile and desktop browser checks using the bundled Playwright runtime and Edge. Browser checks use temporary test data; none is inserted into the project database.
