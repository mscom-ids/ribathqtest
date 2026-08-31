# Native mobile synchronization

This document is the implementation contract for the Kotlin Android and Swift
iOS applications. The web application remains unchanged.

## Database installation

Run the mobile migrations in timestamp order against a development/staging
Supabase project before using these endpoints. When the Supabase CLI migration
workflow is not configured, paste each complete file into Supabase SQL Editor
and run it as one script. Do not paste only selected definitions. Promote the
same migrations to production only after staging validation.

## Implemented backend foundation

- `POST /api/mobile/auth/login` authenticates credentials, registers the
  installation, and returns a short-lived access token plus rotating refresh
  token.
- `POST /api/mobile/auth/refresh` rotates the refresh token and issues a new
  15-minute access token. Reuse of an old rotated token revokes its family.
- `POST /api/mobile/auth/logout` revokes the supplied refresh session.
- `POST /api/mobile/devices/register` registers an authenticated installation.
- `GET /api/mobile/bootstrap` returns the profile, academic-year context,
  authorized mentor roster, and initial cursor.
- `GET /api/mobile/sync?cursor=<n>&limit=<1..500>` returns ordered deltas.
- `POST /api/mobile/mutations/hifz-entries` accepts idempotent Hifz entry
  mutations created online or from the native offline queue.
- `DELETE /api/mobile/devices/:deviceId` revokes one of the user's devices.
- Change feeds are authorization-scoped by `audience_staff_id`; there is no
  global payload feed.
- `mobile_mutation_receipts` reserves idempotency keys for offline writes.

Except for registration, mobile endpoints require the device UUID in the
`x-device-id` header. Authentication is also required on every endpoint.

## Client setup sequence

1. Generate and retain a random installation ID in Keychain/Keystore.
2. Call `/auth/login` with credentials and device metadata.
3. Store only the refresh token in Keychain/Keystore; keep the access token in
   memory. Retain the returned device UUID.
4. Show the setup screen and call `/bootstrap` with `x-device-id`.
5. Store the response in one encrypted local-database transaction.
6. Save `syncCursor` only after the transaction commits.
7. Open the home screen and periodically request `/sync` from that cursor.

If bootstrap persistence fails, the client must keep its previous local data
and cursor intact and retry. A partially written bootstrap must never become
visible.

## Delta application rules

Apply each page in a local transaction and advance the local cursor only after
that transaction commits. Operations have these meanings:

- `upsert`: insert or replace the entity when `entity_version` is newer.
- `delete`: remove cached content and retain a small local tombstone.
- `invalidate`: refetch the named feature through its normal scoped endpoint.

Continue requesting pages while `hasMore` is true. Push notifications and a
future WebSocket gateway should contain only a wake-up cursor, then invoke this
same delta endpoint.

## Offline mutation enrollment

`capabilities.offlineMutations` currently contains `hifz_entry_create`. Each
draft has a stable UUID `mutationId`; retries return the stored result instead
of creating a second entry. The domain row, mutation receipt, and sync-feed
change are committed in one database transaction. Permanent validation,
authorization, and duplicate conflicts are retained locally as rejected items
that need attention; transient network failures remain pending.

Remaining enrollment order:

1. Mentor attendance marks.
2. Leave drafts and requests.
3. Chat messages.

Finance posting, role changes, destructive administration, and security changes
remain online-only.

## Authentication request shape

```json
{
  "email": "mentor@example.com",
  "password": "...",
  "installationId": "stable-random-installation-id",
  "platform": "android",
  "deviceName": "Pixel 9",
  "appVersion": "1.0.0",
  "osVersion": "16",
  "pushToken": null
}
```

Send the returned access token as `Authorization: Bearer <token>` and the
returned device UUID as `x-device-id` on bootstrap and sync calls. Replace the
stored refresh token atomically after every successful refresh response. If the
app crashes before storing the replacement, it must require login again; it
must not retry the consumed old token repeatedly.

Optional backend environment settings and their defaults are:

```dotenv
MOBILE_ACCESS_TOKEN_TTL_SECONDS=900
MOBILE_REFRESH_TOKEN_TTL_DAYS=30
MOBILE_SESSION_FAMILY_TTL_DAYS=90
```

## Native client locations

- Android Kotlin app: `mobile/android`
- iOS Swift app: `mobile/ios`
- Build and staging instructions: `mobile/README.md`
