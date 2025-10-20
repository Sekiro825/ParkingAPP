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


