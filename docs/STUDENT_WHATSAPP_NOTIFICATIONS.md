# Student departure and arrival WhatsApp notifications

NewRQP queues family notifications for actual Out-Campus or Outdoor movements,
and institutional leaves explicitly marked Outside Campus. On-Campus,
internal, personal, and institutional Inside Campus leaves are excluded.
This rule applies to both departure and arrival notifications. The worker
rechecks the current leave type and institutional location before claiming an
existing queued notification, and skips excluded pending records. Individual,
group, bulk-return, and mobile
sync paths use the same queue. On-campus leave, approvals, existing historical
leaves, and edits to already-processed notifications do not create new messages.

## Enable in the NewRQP backend

For the passcode-protected admin page, sender dropdown, persistent pause/resume
and app usage limits, follow `docs/WHATSAPP_ADMIN_CONTROLS.md` instead of the
legacy environment-only activation steps below. Admin-control mode records its
permanent production cutoff on first portal enable and starts paused.

During setup keep `WHATSAPP_SENDING_ENABLED=false` and
`N8N_STUDENT_MOVEMENT_ENABLED=false`. An absent master flag also means off.
The master flag blocks both student movement webhooks and the older staff-event
WhatsApp service, even if API credentials or a valid n8n URL are configured.
No movement notifications are queued during this setup period. Changes to
environment variables on a hosted backend require redeploying it.

Also unpublish/deactivate the n8n workflow during setup. The ERP's safety switch
does not prevent a manual or external request directly to a published workflow,
nor does it pause independent Cevox campaigns. Do not execute test sends until
the setup is ready and you explicitly choose to enable sending.

1. Apply `supabase/migrations/20261012000000_student_movement_notifications.sql`
   to the **NewRQP ERP database**, not the Cevox database. The table has RLS
   enabled and no browser access. The backend database role needs insert,
   select, and update access; the existing owner connection has these rights.
2. In Coolify, open the **NewRQP backend** application's environment variables.
   Set the values below as runtime variables, then redeploy the backend:

```dotenv
WHATSAPP_SENDING_ENABLED=false
WHATSAPP_STAFF_SENDING_ENABLED=false
N8N_STUDENT_MOVEMENT_ENABLED=false
N8N_STUDENT_MOVEMENT_PRODUCTION_START_AT=
N8N_STUDENT_MOVEMENT_WEBHOOK_URL=https://server.n8n.zvntorai.in/webhook/erp-student-movement
N8N_STUDENT_MOVEMENT_WEBHOOK_SECRET=<same private value as n8n ERP Webhook Secret>
N8N_STUDENT_MOVEMENT_PHONE_FIELD=phone_number
N8N_STUDENT_MOVEMENT_WA_NUMBER_ID=
```

`backend/.env.notifications.example` contains these settings with notifications
disabled by default. For local development, put the values in the root
`.env.local`; the example file is not loaded automatically.

Only after the setup is complete and sending is explicitly authorized, change
`WHATSAPP_SENDING_ENABLED` and `N8N_STUDENT_MOVEMENT_ENABLED` to `true`, set
`N8N_STUDENT_MOVEMENT_TEST_ENABLED=false`, and set the fixed production cutoff
described below before redeploying. Keep `WHATSAPP_STAFF_SENDING_ENABLED=false`
so enabling student leave notifications does not enable unrelated staff-event
messages. Configuring URLs, credentials, or applying the migration by themselves
does not enable sending.

### Future-only production launch

Production sending requires `N8N_STUDENT_MOVEMENT_PRODUCTION_START_AT`, an ISO
timestamp including a timezone (`Z` or `+05:30`). Set it to the actual go-live
instant once, after deploying the updated backend with sending still disabled.
Do not use an old example date, move it backwards, or regenerate it on restart.
A missing or malformed cutoff prevents production sending from starting.

Both the student leave's `created_at` and recorded departure time must be on or
after this cutoff. The event time must also be on or after it. Institutional
leave plans may already exist, but each student's actual outside-campus leave
record must be new. Earlier student leave records are excluded entirely,
including returns recorded after launch and historical records edited later.
Future-dated student leave records created before launch are also excluded;
the rollout intentionally applies only to newly recorded leaves.

The worker refuses queue rows created before launch, test-marked notifications,
and marked test students such as R999. It marks excluded pending records
`skipped`, without deleting leave history or resending accepted/uncertain rows.
There is no backfill of old leaves. The cutoff persists in the hosted environment
through pauses, restarts and redeployments; only future qualifying records can
be sent when notifications are enabled.

The webhook secret must be at least 32 characters long. If the secret currently
configured in n8n is shorter, replace it in n8n and the backend together. Never
set these variables with a `NEXT_PUBLIC_` prefix or place secrets in Git/chat.
The Cevox API key remains exclusively in the n8n credential.

`phone_number` is the contact field used by the current NewRQP student create
and edit forms. Confirm these contacts are the intended guardians and have
agreed to receive notifications before enabling. If the guardians instead live
in the legacy `students.phone` field, set `N8N_STUDENT_MOVEMENT_PHONE_FIELD=phone`.
There is no fallback between fields, and no automatic guardian verification.
Ten-digit national numbers are interpreted as Indian numbers. International
contacts should include their country code, preferably with `+`.

## n8n and Cevox

Use the already imported and published student movement workflow. Its webhook
credential must use `x-erp-webhook-secret`; its Cevox credential must use
`x-api-key`. They are different secrets. The worker expects the final node to
return `notification_id`, `cevox_http_status`, and `cevox_response`, as provided
by the imported JSON. No changes to the workflow are needed.

The backend calls only the configured HTTPS production webhook and refuses
redirects. n8n builds both messages using the recorded time in Asia/Kolkata.
Leave reasons, addresses, and other student details are not sent. The current
workflow accepts student/companion names and relationships up to 150 characters;
longer or malformed values are marked skipped locally.

## Queue behavior

Queue insertion uses the movement's existing database transaction: no committed
movement can lose its queue entry while notifications are enabled. Missing queue
migration or lost database permissions are configuration errors, not transport
outages; apply the migration before enabling. An n8n/Cevox outage does not delay
the leave request, because HTTP sending runs only in the background.

The worker polls every five seconds, sends sequentially within each backend
process, and uses row locks to stop two replicas claiming the same record.
Cevox remains responsible for pacing across different backend replicas.
Each leave/event pair is unique. Future-dated movements wait until their recorded
time, and a return waits for its pending departure notification to be processed.
Pending notifications survive restarts. Editing a leave updates pending message
details without resending messages already processed. Deleting a leave deletes
its queue rows; cancelling a leave skips pending rows.

| Status | Meaning |
| --- | --- |
| `pending` | Waiting; unpublished webhook (HTTP 404) retries up to five times, five minutes apart |
| `processing` | Claimed by a worker; HTTP request may have started |
| `api_accepted` | Cevox reports sent/queued/success; does not prove delivery or reading |
| `failed` | Explicit rejection or invalid webhook credentials; review before retrying |
| `uncertain` | Timeout, interrupted worker, unrecognized response, or ambiguous failure; may already have sent |
| `skipped` | Invalid/missing contact or message details, or a cancelled leave |

Unknown outcomes never automatically resend because the current Cevox API has no
event-based idempotency. Workers interrupted for more than three minutes are
marked uncertain. Keep n8n HTTP Request automatic retries disabled. A transport
failure might not appear in saved n8n executions because this workflow disables
execution payload retention. Inspect the ERP queue and backend logs instead.

## Verify before using family contacts

Use test-only mode for the first live check. Keep the master switch **false**,
so staff-event messages and normal family sending remain blocked:

```dotenv
WHATSAPP_SENDING_ENABLED=false
N8N_STUDENT_MOVEMENT_ENABLED=true
N8N_STUDENT_MOVEMENT_TEST_ENABLED=true
N8N_STUDENT_MOVEMENT_TEST_STUDENT_ID=R999
N8N_STUDENT_MOVEMENT_TEST_PHONE=<your own +countrycode number>
```

Test mode is a separate, explicit authorization for student test messages only.
The configured student must have `comprehensive_details.whatsapp_notification_test`
set to `true`. The queue only inserts and claims that test student's records;
previously queued real-family records are not sent. Before each HTTP call, the
worker checks the test student and the test marker again and forces the recipient
to the configured test number, ignoring the stored family contact. A stale
normal-mode worker cannot send when test mode is enabled. Staff-event sending
remains disabled by the master switch.
The shared WhatsApp service also blocks non-test sends whenever test mode is
enabled, even if the master flag was accidentally set to `true`.

`prepare-whatsapp-test-student.ts` creates or finds a dedicated marked test
student without creating a guardian login or storing a parent phone number.
Run it with `npx ts-node src/scripts/prepare-whatsapp-test-student.ts` from
`backend`. During this setup, test student **R999** was created. A private,
Git-ignored `.env.whatsapp-test.local` file contains the test-only settings;
it still requires the webhook secret to be entered privately.

For the controlled command-line check, run
`npx ts-node src/scripts/test-whatsapp-student.ts` from `backend`. This loads
only the private test settings for notification sending, requires the named
and marked test student, creates synthetic exit/return movements for that
student, and sends only the two corresponding notification IDs. Re-running
does not create another test leave or resend API-accepted messages. Uncertain
results stop the check and are never automatically retried. An API-accepted
result must still be confirmed on the tester's WhatsApp device.

The controlled script additionally pins R999 and the originally authorized
test recipient, so changing the private test settings cannot redirect this
particular check. Its `--retry-confirmed-no-number` option is a one-time recovery
for the original departure notification only, after the matching n8n execution
confirmed Cevox rejected it with `no_number` before sending. It requires that
record to have exactly one attempt and never resets other uncertain records.

### Single departure template

`docs/n8n-student-movement-message.js` now uses one fixed departure message,
with no random selection, variant indexes or bundles. It starts "Dear Parent",
lists student, companion, relationship, date and time, and signs "Ribathul Quran".
WhatsApp bold labels use single asterisks. The latest requested departure format
includes the visible IST suffix; dates and times still use `Asia/Kolkata`.
Arrival remains the existing "Dear Parent, {student_name} arrived back on campus
on {return_date} at {return_time}." message, without an IST suffix.

The node still returns `notification_id` and the Cevox `payload`. Publish the
updated code in n8n's Validate and Build Message node without executing it.
Local source changes alone do not update the live workflow. Preserve the
webhook path, credentials and production cutoff. Obsolete `test_template_index`
and `test_template_bundle` requests are rejected rather than sending variants.

For an explicitly authorized isolated CLI preview, run from `backend`:
`node node_modules/ts-node/dist/bin.js src/scripts/test-whatsapp-templates.ts --workflow-updated --single`.
It reads only the marked R999 synthetic departure, forces the verified personal
test recipient and sends at most one preview. Its ignored ledger is
`tmp/whatsapp-template-test-state.json.single`. Accepted or uncertain attempts
are never automatically replayed. Old `--random` and `--bundle` modes are no
longer supported. The portal's R999-only test also uses the fixed template.

After deployment with the test-only settings, record departure and return for
**R999 only** in the ERP. Turn `N8N_STUDENT_MOVEMENT_TEST_ENABLED=false` and
`N8N_STUDENT_MOVEMENT_ENABLED=false` off after the check, keeping
`WHATSAPP_SENDING_ENABLED=false`. Do not enable the master flag to run this test.

1. In test mode, use R999 and the explicit test recipient; no family contact needs
   to be populated on the student. For staging without test mode, use only
   contacts owned by the tester.
2. Record an actual exit with companion name and relationship. Verify the
   WhatsApp message, India time, and `api_accepted` queue status.
3. Record return and verify the arrival message.
4. Check an on-campus leave produces no queue entries. Test bulk and mobile
   movements using test contacts before rolling out those paths.
5. Check a duplicate submission does not produce duplicate queue entries.

Use this read-only query in the ERP database to inspect outcomes without showing
phone numbers or message payloads:

```sql
SELECT id, leave_id, event, status, attempts, last_error, created_at, updated_at
FROM public.student_movement_notifications
ORDER BY created_at DESC
LIMIT 50;
```

Do not reset uncertain rows until checking Cevox's message history. For rows
confirmed not sent, an administrator can reset an individual record:

```sql
UPDATE public.student_movement_notifications
SET status = 'pending', attempts = 0, next_attempt_at = now(),
    processing_started_at = NULL, last_error = NULL, updated_at = now()
WHERE id = '<confirmed-unsent-notification-uuid>'
  AND status IN ('failed', 'uncertain');
```

Setting `WHATSAPP_SENDING_ENABLED=false` and redeploying stops all outgoing
WhatsApp calls from NewRQP. Setting `N8N_STUDENT_MOVEMENT_ENABLED=false` stops
only student movement notifications. Either setting stops new movement queue
entries and the worker. Already queued entries remain and will resume when enabled
again, so review them before re-enabling after a long pause. This integration
does not restart Cevox, delete Cevox users/data, or guarantee WhatsApp account
protection.

Local regression tests: `cd backend` then `npm run test:movement-notifications`.
These use fake HTTP and database clients and never send real WhatsApp messages.
