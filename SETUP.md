## Backend Setup (Supabase)

This guide sets up the database/schema and resolves the error: "Could not find the table 'public.profiles' in the schema cache".

### Prerequisites

- Node >= 20.19.4
- Supabase account and a project (if deploying to cloud)
- Supabase CLI installed:

```bash
npm i -g supabase
```

### Project schema

All SQL lives in `supabase/migrations/20251012131112_create_parking_system_schema.sql`. It creates:
- `profiles` (extends `auth.users`)
- `parking_slots`
- `devices`
- `reservations`
- RLS policies and indexes

The error about missing `public.profiles` means your database hasn't applied this migration yet.

---

## Option A: Local development database (Docker)

1) Start local stack

```bash
supabase start
```

2) Apply schema (fresh)

```bash
supabase db reset
```

This resets the local database and applies all migrations in `supabase/migrations/`.

3) Verify tables exist

```bash
supabase db studio
```

Open the Studio in your browser and confirm `public.profiles` exists.

4) Run the app against local Supabase

Set your `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (from `supabase status`)
```

Run:

```bash
npx expo start
```

---

## Option B: Deploy schema to Supabase Cloud

1) Link the repo to your Supabase project (one-time)

```bash
supabase link --project-ref <your-project-ref>
```

2) Push migrations

```bash
supabase db push
```

This applies migrations from `supabase/migrations/` to your cloud project and refreshes the schema cache.

3) Set environment variables in the app (cloud)

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

4) Verify in Supabase Studio → Table editor that `public.profiles` exists.

---

## Extensions and notes

- The schema uses `gen_random_uuid()`. Ensure `pgcrypto` is enabled:

```sql
create extension if not exists pgcrypto;
```

If your project does not have it, run this once in the SQL editor before pushing or include it in a migration.

- `profiles.id` references `auth.users(id)`. This requires Supabase Auth (enabled by default). Do not drop or rename `auth.users`.

---

## Troubleshooting

- "Could not find the table 'public.profiles' in the schema cache":
  - Ensure migrations ran (local: `supabase db reset`, cloud: `supabase db push`).
  - In Supabase Studio → SQL editor, run `select * from public.profiles limit 1;` to confirm.
  - Trigger a cache refresh by re-running `supabase db push` if needed.

- Permission/RLS errors on `profiles` or `reservations`:
  - Make sure you're authenticated; RLS allows access based on `auth.uid()`.
  - Verify your user row exists in `profiles`. On sign-up, the app inserts a row; if it failed, insert it manually for testing.

- Missing `gen_random_uuid()`:
  - Enable `pgcrypto` as shown above.

---

## Useful commands

```bash
# Install CLI
npm i -g supabase

# Start local services
supabase start

# Reset local DB and apply all migrations
supabase db reset

# Link to a cloud project
supabase link --project-ref <your-project-ref>

# Push migrations to cloud
supabase db push

# Show local keys/URLs
supabase status
```

---

## Edge Functions Setup (Cloud or Local)

Edge Functions back API endpoints like reservations create/cancel and device telemetry ingest.

### Prerequisites

- Supabase CLI logged in: `supabase login`
- Linked project: `supabase link --project-ref <your-project-ref>` (for cloud)

### 1) Deploy existing `reservations` function

The repo includes `supabase/functions/reservations/index.ts`.

Deploy to cloud:

```bash
supabase functions deploy reservations --no-verify-jwt
```

Note: We pass the end-user JWT from the app via `Authorization: Bearer <access_token>` and verify it in code, so `--no-verify-jwt` is acceptable here. If you prefer Supabase to enforce JWT verification at the gateway, omit `--no-verify-jwt` and adapt the function accordingly.

Test (replace URL/keys):

```bash
curl -i \
  -H "Authorization: Bearer <user-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"slot_id":"<slot-uuid>","expires_in_minutes":15}' \
  https://<project-ref>.supabase.co/functions/v1/reservations/create
```

### 2) Create and deploy `devices/ingest` (ESP32 telemetry)

Create the function directory:

```bash
mkdir -p supabase/functions/devices-ingest
```

Implement `index.ts` to:

- Accept `{ device_id, api_key, event_type, is_occupied, raw }`
- Verify key with SQL or RPC (e.g., compare hash) using service role key
- Insert into `public.device_events`
- Return 200 on success

Deploy:

```bash
supabase functions deploy devices-ingest
```

### 3) Create and deploy `notifications/worker`

This worker reads unsent rows from `public.notifications`, resolves Expo push tokens from `public.user_push_tokens`, sends notifications, and sets `sent_at`.

```bash
mkdir -p supabase/functions/notifications-worker
supabase functions deploy notifications-worker
```

Run locally for development:

```bash
supabase functions serve notifications-worker
```

### 4) Schedule `cron/expire-reservations`

Create a scheduled function (Supabase Scheduled Functions) that calls the SQL RPC `expire_reservations` every minute or as needed.

```bash
mkdir -p supabase/functions/cron-expire-reservations
supabase functions deploy cron-expire-reservations
```

Then configure a schedule in the Supabase Dashboard → Edge Functions → Scheduled.

### 5) CORS and headers

All functions should respond to `OPTIONS` and set CORS headers, e.g.:

```ts
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};
```

### 6) App configuration (Expo)

- The app already calls the `reservations` function:
  - Create: `${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/reservations/create`
  - Cancel: `${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/reservations/cancel/<id>`
- Ensure the user `access_token` is forwarded via the `Authorization` header.

### 7) Environment variables

- Expo: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Edge Functions (if needed): project URL/keys (secure in Supabase Secrets) and any third-party API keys (e.g., Expo push service if applicable)

For local development, use:

```bash
supabase functions serve <name> --env-file supabase/.env
```

### 8) Realtime

Make sure the tables you subscribe to are included in the `supabase_realtime` publication. See `DATABASE.md` for adding `public.slots`/`public.reservations`/`public.devices`, or ensure your existing `parking_slots`/`reservations`/`devices` tables are added similarly in your migrations.



