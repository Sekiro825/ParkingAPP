## Smart IoT Parking System — Supabase Database Setup

This document contains all SQL you should run in your Supabase project to provision the database for the unified Admin + Driver mobile app. Execute the sections in order using the Supabase SQL editor. Everything is designed to be safe-by-default with Row Level Security (RLS) enabled.

Notes
- auth.users is managed by Supabase Auth. We mirror essential user info into public.profiles.
- Devices never talk to the DB directly; they hit Edge Functions with an API key. The Edge Function uses the service role to write telemetry.
- Realtime is enabled on tables that the app listens to: slots, reservations, devices.

---

### 0) Extensions
```sql
-- Required extensions
create extension if not exists pgcrypto; -- gen_random_uuid, gen_random_bytes, digest
```

---

### 1) Enums
```sql
-- Run once (idempotent wrapper for enums)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('admin', 'driver');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'slot_status') THEN
    CREATE TYPE slot_status AS ENUM ('available', 'reserved', 'occupied', 'offline');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN
    CREATE TYPE reservation_status AS ENUM ('pending', 'active', 'cancelled', 'expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_status') THEN
    CREATE TYPE device_status AS ENUM ('online', 'offline', 'maintenance');
  END IF;
END$$;
```

---

### 2) Utility functions (auth helpers)
```sql
-- Helper: current authenticated user id, null for anon
create or replace function public.current_user_id()
returns uuid
language sql stable
as $$
  select auth.uid();
$$;

-- Helper: is the caller an admin? Uses profiles.role
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  );
$$;
```

---

### 3) Profiles (mirror of auth.users)
```sql
create table if not exists public.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  email         text unique,
  full_name     text,
  role          user_role not null default 'driver',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

-- Auto-insert profile on new auth user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end; $$;

-- Attach to auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- Policies: users can read their own profile, admins can read all
create policy if not exists profiles_select_self
on public.profiles for select
to authenticated
using (user_id = auth.uid());

create policy if not exists profiles_select_admin
on public.profiles for select
to authenticated
using (public.is_admin());

-- Updates: only admins (or service role) can update profiles
create policy if not exists profiles_update_admin
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
```

---

### 4) Push tokens (Expo)
```sql
create table if not exists public.user_push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(user_id) on delete cascade,
  token        text not null, -- Expo push token
  platform     text check (platform in ('ios','android','web')),
  created_at   timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.user_push_tokens enable row level security;

-- Owners manage their tokens
create policy if not exists upt_select_own
on public.user_push_tokens for select
to authenticated
using (user_id = auth.uid());

create policy if not exists upt_insert_own
on public.user_push_tokens for insert
to authenticated
with check (user_id = auth.uid());

create policy if not exists upt_delete_own
on public.user_push_tokens for delete
to authenticated
using (user_id = auth.uid());
```

---

### 5) Zones
```sql
create table if not exists public.zones (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique, -- e.g., A1, B2
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

alter table public.zones enable row level security;

-- Read: drivers and admins can view zones
create policy if not exists zones_select_all
on public.zones for select
to authenticated
using (true);

-- Write: only admins
create policy if not exists zones_write_admin
on public.zones for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
```

---

### 6) Devices and telemetry
```sql
create table if not exists public.devices (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  api_key_hash   text, -- sha256 hash of plaintext key
  status         device_status not null default 'offline',
  last_seen      timestamptz,
  registered_by  uuid references public.profiles(user_id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger devices_touch_updated_at
before update on public.devices
for each row execute function public.touch_updated_at();

alter table public.devices enable row level security;

-- Read devices: admins only
create policy if not exists devices_select_admin
on public.devices for select
to authenticated
using (public.is_admin());

-- Write devices: admins only
create policy if not exists devices_write_admin
on public.devices for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Register/rotate API key for a device. Returns plaintext once.
create or replace function public.device_generate_api_key(p_device_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_plain text;
  v_hash  text;
begin
  -- Only admins may call
  if not public.is_admin() then
    raise exception 'Only admins can generate device api keys';
  end if;
  v_plain := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_plain, 'sha256'), 'hex');
  update public.devices
    set api_key_hash = v_hash,
        updated_at = now()
  where id = p_device_id;
  if not found then
    raise exception 'Device % not found', p_device_id;
  end if;
  return v_plain; -- show plaintext only once!
end; $$;

-- Verify API key (for Edge Functions; do NOT expose to clients)
create or replace function public.device_verify_api_key(p_device_id uuid, p_api_key_plain text)
returns boolean
language sql stable security definer set search_path = public as $$
  select api_key_hash = encode(digest(p_api_key_plain, 'sha256'), 'hex')
  from public.devices
  where id = p_device_id;
$$;

-- Device telemetry events (written by Edge Function)
create table if not exists public.device_events (
  id           uuid primary key default gen_random_uuid(),
  device_id    uuid not null references public.devices(id) on delete cascade,
  event_type   text not null check (event_type in ('heartbeat','occupancy','status')),
  is_occupied  boolean,
  raw          jsonb,
  created_at   timestamptz not null default now()
);

alter table public.device_events enable row level security;

-- Only admins/service-role read telemetry; no client writes directly
create policy if not exists device_events_select_admin
on public.device_events for select
to authenticated
using (public.is_admin());
```

---

### 7) Slots
```sql
create table if not exists public.slots (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique, -- human-visible slot code
  zone_id       uuid not null references public.zones(id) on delete restrict,
  status        slot_status not null default 'available',
  device_id     uuid unique references public.devices(id) on delete set null,
  last_status_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger slots_touch_updated_at
before update on public.slots
for each row execute function public.touch_updated_at();

alter table public.slots enable row level security;

-- Read slots: all authenticated users (drivers + admins)
create policy if not exists slots_select_all
on public.slots for select
to authenticated
using (true);

-- Write slots: admins only
create policy if not exists slots_write_admin
on public.slots for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
```

---

### 8) Reservations
```sql
create table if not exists public.reservations (
  id            uuid primary key default gen_random_uuid(),
  slot_id       uuid not null references public.slots(id) on delete cascade,
  user_id       uuid not null references public.profiles(user_id) on delete cascade,
  status        reservation_status not null default 'active',
  reserved_at   timestamptz not null default now(),
  expires_at    timestamptz not null, -- set by function, e.g., now()+interval '15 min'
  cancelled_at  timestamptz,
  end_at        timestamptz,
  created_at    timestamptz not null default now()
);

-- Ensure no double-booking
create unique index if not exists uniq_active_reservation_per_slot
on public.reservations(slot_id)
where status in ('pending','active');

create unique index if not exists uniq_active_reservation_per_user
on public.reservations(user_id)
where status in ('pending','active');

alter table public.reservations enable row level security;

-- Read: drivers read their own; admins read all
create policy if not exists reservations_select_own
on public.reservations for select
to authenticated
using (user_id = auth.uid());

create policy if not exists reservations_select_admin
on public.reservations for select
to authenticated
using (public.is_admin());

-- Inserts/updates via RPC only; block direct writes from clients
create policy if not exists reservations_block_client_writes
on public.reservations for all
to authenticated
using (false)
with check (false);
```

---

### 9) Reservation RPCs and helpers
```sql
-- Helper: does slot currently have an active reservation?
create or replace function public.slot_has_active_reservation(p_slot_id uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.reservations r
    where r.slot_id = p_slot_id and r.status in ('pending','active')
  );
$$;

-- Create reservation for the current user; returns the reservation row
create or replace function public.create_reservation(p_slot_id uuid, p_minutes int default 15)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_res      public.reservations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Must be authenticated';
  end if;

  -- Cannot create if user already has an active reservation
  if exists (
    select 1 from public.reservations
    where user_id = v_user_id and status in ('pending','active')
  ) then
    raise exception 'User already has an active reservation';
  end if;

  -- Slot must not be double-booked
  if public.slot_has_active_reservation(p_slot_id) then
    raise exception 'Slot is already reserved';
  end if;

  -- Create reservation
  insert into public.reservations(slot_id, user_id, status, expires_at)
  values (p_slot_id, v_user_id, 'active', now() + (p_minutes || ' minutes')::interval)
  returning * into v_res;

  -- Mark slot as reserved
  update public.slots set status = 'reserved', last_status_at = now() where id = p_slot_id;

  return v_res;
end; $$;

-- Cancel reservation; owner or admin
create or replace function public.cancel_reservation(p_reservation_id uuid)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_res public.reservations%rowtype;
  v_is_admin boolean := public.is_admin();
begin
  if v_user_id is null then
    raise exception 'Must be authenticated';
  end if;

  select * into v_res from public.reservations where id = p_reservation_id;
  if not found then
    raise exception 'Reservation not found';
  end if;

  if v_res.user_id <> v_user_id and not v_is_admin then
    raise exception 'Not allowed to cancel this reservation';
  end if;

  if v_res.status not in ('pending','active') then
    return v_res; -- nothing to do
  end if;

  update public.reservations
  set status = 'cancelled', cancelled_at = now()
  where id = p_reservation_id
  returning * into v_res;

  -- If slot has no other active reservation, set available
  if not public.slot_has_active_reservation(v_res.slot_id) then
    update public.slots set status = 'available', last_status_at = now() where id = v_res.slot_id;
  end if;

  return v_res;
end; $$;

-- Expire reservations past expires_at; intended for cron/service
create or replace function public.expire_reservations()
returns setof public.reservations
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.reservations r
  set status = 'expired', end_at = now()
  where r.status in ('pending','active') and now() >= r.expires_at
  returning *;
end; $$;
```

---

### 10) Telemetry -> slot status sync triggers
```sql
-- When a device posts an event, update devices.last_seen and slot status
create or replace function public.on_device_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_slot_id uuid;
  v_has_active boolean;
begin
  update public.devices set last_seen = now(), status = 'online' where id = new.device_id;

  select s.id into v_slot_id
  from public.slots s
  where s.device_id = new.device_id;

  if v_slot_id is not null and new.event_type = 'occupancy' then
    if new.is_occupied is true then
      update public.slots set status = 'occupied', last_status_at = now() where id = v_slot_id;
    elsif new.is_occupied is false then
      -- If there is still an active reservation for this slot, keep it reserved; otherwise available
      v_has_active := public.slot_has_active_reservation(v_slot_id);
      update public.slots
      set status = case when v_has_active then 'reserved' else 'available' end,
          last_status_at = now()
      where id = v_slot_id;
    end if;
  end if;

  return new;
end; $$;

create trigger device_events_after_insert
after insert on public.device_events
for each row execute function public.on_device_event();
```

---

### 11) Notification queue (processed by Edge Function/worker)
```sql
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(user_id) on delete cascade,
  title       text not null,
  body        text not null,
  data        jsonb,
  queued_at   timestamptz not null default now(),
  sent_at     timestamptz
);

alter table public.notifications enable row level security;

-- Only service role (Edge Function) should access this table; block clients
create policy if not exists notifications_block_all
on public.notifications for all
to authenticated
using (false)
with check (false);

-- Enqueue a notification when a reservation is created or expired/cancelled
create or replace function public.enqueue_reservation_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text;
  v_body  text;
  v_user  uuid;
begin
  if tg_op = 'INSERT' then
    v_user := new.user_id;
    v_title := 'Reservation Confirmed';
    v_body := 'Your reservation has been created and will expire at ' || to_char(new.expires_at, 'YYYY-MM-DD HH24:MI:SS TZ');
  elsif tg_op = 'UPDATE' then
    v_user := new.user_id;
    if new.status = 'expired' then
      v_title := 'Reservation Expired';
      v_body := 'Your reservation has expired.';
    elsif new.status = 'cancelled' then
      v_title := 'Reservation Cancelled';
      v_body := 'Your reservation was cancelled.';
    else
      return new;
    end if;
  else
    return new;
  end if;

  insert into public.notifications(user_id, title, body, data)
  values (v_user, v_title, v_body, jsonb_build_object('reservation_id', coalesce(new.id, old.id)));
  return new;
end; $$;

create trigger reservations_notify_after_insert
after insert on public.reservations
for each row execute function public.enqueue_reservation_notification();

create trigger reservations_notify_after_update
after update on public.reservations
for each row when (old.status is distinct from new.status)
execute function public.enqueue_reservation_notification();
```

---

### 12) Realtime publications
```sql
-- Enable realtime on core tables so clients can subscribe
alter publication supabase_realtime add table public.slots;
alter publication supabase_realtime add table public.reservations;
alter publication supabase_realtime add table public.devices;
```

---

### 13) Seeds (optional dev data)
```sql
-- Zones
insert into public.zones(code, name, description) values
  ('A', 'Zone A', 'Near entrance'),
  ('B', 'Zone B', 'Covered area')
  on conflict (code) do nothing;

-- Devices (no keys yet)
insert into public.devices(name, status)
values ('ESP32-01', 'offline'), ('ESP32-02', 'offline')
on conflict do nothing;

-- Slots
insert into public.slots(code, zone_id, status, device_id)
select 'A-01', z1.id, 'available', d1.id
from public.zones z1, public.devices d1
where z1.code = 'A' and d1.name = 'ESP32-01'
on conflict (code) do nothing;

insert into public.slots(code, zone_id, status, device_id)
select 'B-01', z2.id, 'available', d2.id
from public.zones z2, public.devices d2
where z2.code = 'B' and d2.name = 'ESP32-02'
on conflict (code) do nothing;
```

---

### 14) Grants (safe defaults)
```sql
-- Supabase sets base grants. We rely on RLS for access control.
-- Expose RPCs to authenticated clients
grant execute on function public.create_reservation(uuid, int) to authenticated;
grant execute on function public.cancel_reservation(uuid) to authenticated;
-- Admin-only RPCs
grant execute on function public.device_generate_api_key(uuid) to authenticated;
-- Edge-only verification (do not grant to authenticated)
revoke execute on function public.device_verify_api_key(uuid, text) from anon, authenticated;
```

---

## Edge Functions to implement (outline)
You will implement these in Supabase Edge Functions (Deno). They should use the service role key.

- reservations/create: Calls `rpc('create_reservation', { p_slot_id, p_minutes })` and returns the row.
- reservations/cancel: Calls `rpc('cancel_reservation', { p_reservation_id })`.
- devices/ingest: Validates device `api_key` and `device_id` with `device_verify_api_key`, then inserts into `device_events` and optionally a synthetic `status` event.
- notifications/worker: Periodically reads unsent rows from `public.notifications`, looks up `public.user_push_tokens` for `user_id`, sends Expo pushes, and sets `sent_at`.
- cron/expire-reservations: On a schedule, call `rpc('expire_reservations')`.

---

## Next Steps (App + Backend)

- Auth and Role
  - After sign-in, fetch role: `select role from profiles where user_id = auth.uid()` and branch navigation (admin vs driver).

- Driver app
  - List slots with realtime: subscribe to `public.slots`.
  - Slot detail with Reserve button -> call Edge `reservations/create`.
  - Show my reservations (query + realtime on `public.reservations` filtered by `user_id`).
  - Register Expo push token in `public.user_push_tokens`.
  - Offline cache with AsyncStorage: cache last slots list and my reservations.

- Admin app
  - CRUD zones, slots, devices (policies already restrict to admins).
  - Generate device API key by calling `device_generate_api_key(device_id)` and show plaintext once to the operator for flashing on ESP32.
  - View device last_seen/status and slot status in realtime.

- Edge Functions
  - Implement the four functions above with Supabase JS client using service role.
  - For `devices/ingest`, expect payload: `{ device_id, api_key, event_type, is_occupied, raw }` -> verify -> insert into `device_events`.
  - For notifications worker, fetch unsent notifications and send via Expo; mark `sent_at`.
  - Schedule `cron/expire-reservations` via Supabase Scheduled Functions.

- Realtime
  - Subscribe to `slots`, `reservations`, and optionally `devices` in the app for live updates.

- Security
  - Never expose device plaintext API keys after creation.
  - Ensure client uses `rpc('create_reservation'...)`/`rpc('cancel_reservation'...)` not direct writes to `reservations`.
  - Keep all writes from devices behind Edge Functions using service role.

- Observability (optional)
  - Add `device_events` dashboards in your analytics tool or SQL editor.
  - Add indexes to `device_events(device_id, created_at)` if volume grows.

- Testing
  - Manually create an admin: sign up, then in SQL editor run `update public.profiles set role='admin' where email='YOU@EXAMPLE.COM';`
  - Generate a device key, flash it to ESP32, send occupancy events to Edge and verify slot status transitions.

---

That’s it! Run the SQL top-to-bottom in a fresh Supabase project. Then wire up the Edge Functions and the Expo app flows as outlined above.