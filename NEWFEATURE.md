## New Features and Changes

This file summarizes the database + app changes added in this iteration and how to use them.

### What changed

- Database documentation
  - Added `DATABASE.md` with complete Supabase SQL: enums, tables, RLS policies, RPCs, triggers, realtime publications, and seeds.
  - Reordered `public.is_admin()` definition to be created only after `public.profiles` exists to avoid dependency errors.
  - Replaced unsupported `CREATE POLICY IF NOT EXISTS` with idempotent `DO $$ ... END;` guards so the SQL can be re-run safely.

- Offline cache (Driver)
  - New helper `lib/storage.ts` provides `readJson`/`writeJson` wrappers around AsyncStorage.
  - Updated `app/(driver)/index.tsx` (Parking list) to:
    - Load cached slots immediately for instant UI when offline or on cold start.
    - Fetch fresh data, update UI, and persist to cache; refresh on realtime events.
  - Updated `app/(driver)/reservations.tsx` (My Bookings) similarly to cache the user’s reservations with a per-user cache key.

- Documentation
  - Updated `SETUP.md` with Edge Functions setup/deploy steps and environment configuration pointers.
  - Added `EDGE.md` with an end-to-end guide to create, deploy, and test Edge Functions (reservations, devices ingest, notifications worker, cron expiry).

### Impact

- Safer, repeatable database setup: SQL can be run top-to-bottom without policy syntax errors.
- Faster perceived performance and resilience while offline for Drivers (slots and reservations cached locally).
- Clear guidance to configure and deploy Supabase Edge Functions used by the app.

### How to use

- Database
  - If you are starting fresh, run the SQL in `DATABASE.md` in the Supabase SQL editor.
  - If your project already uses the migration in `supabase/migrations/20251012131112_create_parking_system_schema.sql`, keep using it; it defines tables such as `parking_slots`, `devices`, and `reservations` that the app currently references. Align schema and code consistently.

- App
  - Ensure `.env` (Expo) contains `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
  - Start the app with `npm run dev` (or `npx expo start`).
  - Driver screens will render from cache first and then live-refresh.

- Edge Functions
  - See `EDGE.md` for creating/deploying:
    - `reservations` (already scaffolded in `supabase/functions/reservations/`)
    - `devices/ingest` (ESP32 telemetry → `device_events`)
    - `notifications/worker` (send Expo pushes from `public.notifications`)
    - `cron/expire-reservations` (scheduled)

### Notes on naming

- The app currently queries `public.parking_slots` and `public.reservations` with columns like `slot_number`, `driver_id`, etc. If you opt to use the alternative schema in `DATABASE.md` (e.g., `public.slots`, `public.devices`, RPCs), adjust the app queries accordingly or mirror both for a migration period.
