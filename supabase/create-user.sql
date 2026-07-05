-- ============================================================================
-- CREATE A USER + PROFILE DIRECTLY VIA SQL — no signup UI needed
-- Run this in Supabase SQL Editor. Works for creating a Super Admin,
-- a PG Owner, or a Tenant account in one go.
--
-- After running, you can log in at /login on your app with the
-- email + password you set below.
--
-- ⚠️ HONEST CAVEAT: this writes directly into Supabase's internal
-- `auth.users` / `auth.identities` tables, which are not officially meant
-- to be hand-edited — their exact shape has changed across Supabase
-- versions, and Supabase could change it again. It works on current
-- Supabase Auth as of this writing. If it errors out with a column
-- mismatch (e.g. "column X does not exist" or "null value in column Y"),
-- the more official — but slightly slower — alternative is:
--   1. Sign up normally through your app's /login page (it calls
--      supabase.auth.signUp() under the hood, which always matches
--      whatever your current Supabase version actually expects).
--   2. Then just run the "PROMOTE TO SUPER ADMIN" block near the bottom
--      of this file to upgrade that account's role afterward.
-- ============================================================================

-- Needed for crypt()/gen_salt() below, used to hash the password the same
-- way Supabase Auth itself does. Safe to run even if already enabled.
create extension if not exists pgcrypto;

do $$
declare
  -- ── EDIT THESE ────────────────────────────────────────────────────────
  new_email    text := 'owner@example.com';       -- login email (use phone@pgmanager.local for tenants — see note below)
  new_password text := 'ChangeMe123!';             -- login password (min 6 chars)
  new_full_name text := 'Test Owner';              -- display name
  new_role     text := 'pg_owner';                 -- 'super_admin' | 'pg_owner' | 'tenant'
  new_phone    text := null;                       -- optional, e.g. '9876543210'
  -- ─────────────────────────────────────────────────────────────────────

  new_user_id uuid;
  encrypted_pw text;
begin
  -- Basic sanity checks so this fails loudly instead of silently creating
  -- a broken account.
  if new_role not in ('super_admin', 'pg_owner', 'tenant') then
    raise exception 'new_role must be super_admin, pg_owner, or tenant — got %', new_role;
  end if;
  if length(new_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if exists (select 1 from auth.users where email = new_email) then
    raise exception 'A user with email % already exists. Use a different email, or update the existing profiles row instead.', new_email;
  end if;

  new_user_id := uuid_generate_v4();
  encrypted_pw := crypt(new_password, gen_salt('bf'));

  -- Insert directly into Supabase's auth.users table, mirroring what
  -- Supabase Auth itself would create on a normal signup — including
  -- confirming the email immediately so no verification step is needed.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    new_email,
    encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', new_full_name, 'role', new_role),
    now(),
    now(),
    '', '', '', ''
  );

  -- Also seed an identity row — Supabase Auth expects one alongside
  -- auth.users for email/password sign-in to work correctly.
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    uuid_generate_v4(),
    new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', new_email),
    'email',
    new_user_id::text,
    now(), now(), now()
  );

  -- The on_auth_user_created trigger (from schema.sql) will have already
  -- inserted a matching `profiles` row automatically. We just update it
  -- with the phone number, since the trigger doesn't set that.
  update public.profiles
  set phone = new_phone
  where id = new_user_id;

  raise notice 'Created % account: % (id: %)', new_role, new_email, new_user_id;
end $$;

-- ============================================================================
-- NOTE — creating a TENANT this way:
-- Tenant logins use a synthetic email of the form "<phone>@pgmanager.local"
-- (see README). If new_role = 'tenant', set new_email to that exact format,
-- e.g. '9876543210@pgmanager.local', and new_password to whatever you want
-- their login password to be. You will ALSO need a matching row in the
-- `tenants` table (linked via `auth_user_id` = the id printed above) for
-- the Tenant Portal to actually show their PG/room/rent info — this script
-- only creates the login, not the tenant record itself. Use
-- supabase/seed-test-data.sql for a full example with real tenant rows.
-- ============================================================================


-- ============================================================================
-- FALLBACK — PROMOTE AN EXISTING ACCOUNT TO SUPER ADMIN
-- Use this instead of the block above if you'd rather sign up the normal
-- way (through your app's /login page, which is guaranteed to match
-- whatever your current Supabase Auth version expects) and just need to
-- flip that account's role afterward. This only touches `public.profiles`,
-- never Supabase's internal auth tables, so it's the safer of the two
-- approaches on this page.
-- ============================================================================

-- update public.profiles
-- set role = 'super_admin'
-- where email = 'owner@example.com';   -- <-- change to the email you signed up with
