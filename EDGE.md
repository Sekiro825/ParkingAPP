## Edge Functions Guide (Supabase)

This guide helps you create, deploy, and test the Edge Functions used by the Smart IoT Parking System app.

### Prerequisites

- Supabase project (Cloud or local via `supabase start`)
- Supabase CLI installed and logged in (`supabase login`)
- Node 18+ / Deno runtime (Edge Functions use Deno)

---

## Overview of functions

- reservations
  - `POST /reservations/create` – create a reservation for the authenticated user
  - `POST /reservations/cancel/:id` – cancel a reservation owned by the authenticated user
- devices-ingest
  - `POST /devices/ingest` – ingest telemetry from ESP32 devices; validates API key; writes to `public.device_events`
- notifications-worker
  - Background worker that sends Expo push notifications for `public.notifications` rows without `sent_at`
- cron-expire-reservations
  - Scheduled function that calls the SQL RPC `expire_reservations` to mark overdue reservations as `expired`

The repository already includes `supabase/functions/reservations/index.ts` with a working auth pattern.

---

## 1) Deploy existing `reservations` function

```bash
supabase functions deploy reservations --no-verify-jwt
```

- The function verifies the end-user JWT in code using `supabase.auth.getUser()`.
- Endpoints:
  - `POST https://<project-ref>.supabase.co/functions/v1/reservations/create`
  - `POST https://<project-ref>.supabase.co/functions/v1/reservations/cancel/<reservationId>`

Test with curl (replace project ref and token/ids):

```bash
curl -i \
  -H "Authorization: Bearer <user-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"slot_id":"<slot-uuid>","expires_in_minutes":15}' \
  https://<project-ref>.supabase.co/functions/v1/reservations/create
```

---

## 2) Create and deploy `devices-ingest`

Purpose: Devices post occupancy telemetry; we verify the device API key and write to `public.device_events`. The SQL from `DATABASE.md` includes helper functions and triggers to update slot status and device `last_seen`.

Steps:

```bash
mkdir -p supabase/functions/devices-ingest
# create supabase/functions/devices-ingest/index.ts with your handler
supabase functions deploy devices-ingest
```

Handler outline:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const { device_id, api_key, event_type, is_occupied, raw } = await req.json();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; // store as secret
  const sb = createClient(supabaseUrl, serviceKey);

  // Option A: verify via SQL function that compares hash
  // const { data: ok } = await sb.rpc('device_verify_api_key', { p_device_id: device_id, p_api_key_plain: api_key });

  // Option B: verify by selecting device row and comparing hash client-side
  // (prefer server-side SQL function)

  // Insert event
  const { error } = await sb.from('device_events').insert({ device_id, event_type, is_occupied, raw });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
```

---

## 3) Create and deploy `notifications-worker`

Purpose: Send push notifications created by triggers into `public.notifications`.

```bash
mkdir -p supabase/functions/notifications-worker
# add index.ts to:
# - query unsent notifications
# - look up tokens in public.user_push_tokens
# - call Expo push API
# - update sent_at
supabase functions deploy notifications-worker
```

Run locally:

```bash
supabase functions serve notifications-worker
```

Tip: Store your Expo push server key or any secrets as Supabase function secrets:

```bash
supabase secrets set --env-file supabase/.env
```

---

## 4) Schedule `cron-expire-reservations`

Use Supabase Scheduled Functions to periodically run a function that calls the SQL RPC `expire_reservations`.

```bash
mkdir -p supabase/functions/cron-expire-reservations
# add index.ts that executes sb.rpc('expire_reservations') with service role
supabase functions deploy cron-expire-reservations
```

Then add a schedule in the Supabase Dashboard (e.g., every minute).

---

## 5) Environment and security

- Always store service role keys as Supabase function secrets, never in the client app.
- Forward the end-user JWT from the Expo app in the `Authorization` header for functions that act on behalf of the user (like reservations).
- Ensure Realtime publication includes the tables your app subscribes to (see `DATABASE.md`).

---

## 6) App integration checklist

- EXPO envs set: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Reservations screen calls:
  - Create: `/functions/v1/reservations/create`
  - Cancel: `/functions/v1/reservations/cancel/:id`
- Driver Home subscribes to `public.parking_slots` changes.
- Optional: register Expo push token in `public.user_push_tokens` during login and build a simple notifications worker.
