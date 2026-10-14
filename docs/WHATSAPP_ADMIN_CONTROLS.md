# Admin WhatsApp notification controls

The page is `/admin/whatsapp-notifications`, linked under **Management → WhatsApp
Notifications** for administrator accounts only. The Express API is
`/api/whatsapp-admin`. Do not activate production sending during installation.

## Deploy and configure once

1. Deploy the frontend and backend code together. Apply
   `supabase/migrations/20261014000000_whatsapp_admin_controls.sql` to the NewRQP
   database after the existing student-movement notification migration. Its
   single settings record starts paused. All new tables have RLS and no
   `anon`/`authenticated` access. Never delete leave history or reset uncertain
   queue rows to enable this page.
2. Set backend runtime variables privately in Coolify. Start with the master
   sending switch off:

   ```dotenv
   WHATSAPP_SENDING_ENABLED=false
   WHATSAPP_STAFF_SENDING_ENABLED=false
   N8N_STUDENT_MOVEMENT_ENABLED=true
   N8N_STUDENT_MOVEMENT_ADMIN_CONTROLS_ENABLED=true
   N8N_STUDENT_MOVEMENT_TEST_ENABLED=false
   WHATSAPP_ADMIN_PASSCODE_HASH=<bcrypt hash of a separate strong passcode>
   CEVOX_CONTROL_API_BASE_URL=https://rqwaps.ribathulquran.in
   CEVOX_CONTROL_API_KEY=<private Cevox workspace API key>
   N8N_STUDENT_MOVEMENT_WEBHOOK_URL=https://server.n8n.zvntorai.in/webhook/erp-student-movement
   N8N_STUDENT_MOVEMENT_WEBHOOK_SECRET=<existing private webhook secret>
   N8N_STUDENT_MOVEMENT_PHONE_FIELD=phone_number
   N8N_STUDENT_MOVEMENT_TEST_STUDENT_ID=R999
   N8N_STUDENT_MOVEMENT_TEST_PHONE=<verified personal test number in +countrycode format>
   ```

   Use a unique passcode of at least 12 characters and at most 72 UTF-8 bytes,
   with a bcrypt cost of 12 (supported costs 10–15). Store only its hash in the
   backend environment. Do not put passcodes or keys in frontend variables,
   Git, chat, URL parameters, or the settings form. The control API key must
   belong to the same workspace as the n8n send credential. `/api/stats` is
   used to read sender metadata and provider limits; QR/session secrets are
   not copied to NewRQP.
3. Update the existing n8n HTTP Request node so **Options → Response → Never
   Error** is on, while JSON response and **Include Response Headers and
   Status** remain on. Keep automatic retries off. Publish without executing
   the workflow. The saved workflow JSON includes this change. It makes
   explicit Cevox rejections available to the ERP's classifier rather than
   stopping before the response node. Existing credentials and the webhook
   path must remain unchanged.
4. Redeploy, sign in as an actual administrator, unlock the controls, select
   a connected sender and choose **Save paused**. Test only with the marked
   R999 student and the backend-configured personal test number. A test is
   an explicit send action and does not enable real-parent sending.
5. Only after production authorization, set `WHATSAPP_SENDING_ENABLED=true`
   and redeploy once. The database switch is still paused. Then choose
   **Save and enable** in the portal. The first enable records the fixed
   production cutoff using database time. Later pauses, sender changes,
   restarts and re-enables preserve it. The legacy environment cutoff is
   not used in admin-control mode. Do not toggle modes after launching.

The deployment remains paused unless both the server's master switch and the
portal's persisted switch allow sending. A missing migration or inaccessible
settings database fails closed. Sender selection and portal pause/resume do
not require subsequent redeployments. The master environment switch remains
an emergency stop and does require redeployment.

## Authorization

- Every request validates the login JWT and reads the current staff role.
  Only `admin` is allowed; parents, staff, controllers, principals, mobile
  access tokens and delegated sessions are rejected.
- The separate passcode unlocks controls for ten minutes. The unlock token is
  kept only in browser memory, tied to that admin's login session and the
  current passcode hash, and sent in a custom header. It is never stored in
  browser local/session storage. Passcode rotation invalidates existing
  unlocks. Five attempts per admin are allowed in a fifteen-minute window.
- API responses are non-cacheable. Keys, passcode hashes, webhook secrets,
  message text and family contacts are not returned in the dashboard.
- Enables, configuration changes, pauses, unlocks and tests have audit records.
  Pause first before switching senders; a recent reserved/in-flight send also
  blocks sender changes. Already-submitted messages cannot be recalled.

## Sending, counts and institutional leave days

Default additional ERP limits are 30 attempts/hour, 100/day, 60 seconds between
sends and a 24-hour maximum message age. Admins can configure lower or higher
app limits within validated ranges, but these never override Cevox's actual
daily, warm-up, first-contact, per-contact, quiet-hour or disconnected-number
restrictions. Provider-day totals are UTC in the current Cevox implementation;
the ERP daily budget resets by the Indian calendar day. Switching senders does
not reset the ERP's hourly/daily or per-recipient reservation counts.

Capacity is reserved transactionally under a singleton row lock across backend
replicas before HTTP sending. Accepted, reserved and uncertain attempts count
against budgets conservatively. The test action shares these safeguards. A
test request UUID is unique; uncertain/in-flight test attempts block further
tests to that recipient for 24 hours pending review. Ordinary parent messages
remain deduplicated by leave/event. The portal does not offer blind resends.

Confirmed pre-send Cevox errors with a recognized error code and matching HTTP
status are deferred without claiming delivery. Unknown failures, timeouts and
unstructured responses remain uncertain. Daily/hourly/first-contact rejections
wait an hour, quiet-hour rejections wait thirty minutes, and other safe
rejections wait five minutes. Deferred messages expire at the configured age.
If the n8n response option has not been deployed, unstructured failures still
stop safely and need review rather than being automatically resent.

Institutional outside-campus exits are individually queued in the leave
transaction and dispatched sequentially, not broadcast simultaneously. The
dashboard shows capacity, remaining allowance and pending/failed/uncertain
counts. It cannot guarantee 100+ same-day deliveries if provider allowance is
insufficient. Departure messages are skipped if the actual return has already
been recorded before dispatch, or if their recorded event time expires. Arrival
notifications use the actual return event, even days after departure, and have
their own message-age window. API acceptance is not proof of parent delivery.

Only new Out-Campus or institutional Outside Campus student leaves qualify
after the first production enable. Earlier leaves and their later returns,
marked test students, On-Campus, Outdoor and institutional Inside Campus leaves
remain excluded. Pausing prevents new leaves from being queued and holds
existing pending messages; after resume they can send only if still eligible
and fresh. There is no history backfill.

The ERP switch does not pause independent Cevox campaigns, or authenticated
manual requests made directly to n8n. Keep those separately controlled. Random
wording is a presentation feature, not a ban-prevention guarantee.

## Validation

From `backend`, run the existing movement tests plus
`src/__tests__/whatsapp-admin.test.ts` and
`src/__tests__/whatsapp-admin-routes.test.ts` with ts-node. Provider/database
operations in these tests are mocked; route tests use a temporary localhost
server only and cannot send real messages. Run backend and frontend TypeScript
checks and the configured frontend linter against the new page.
