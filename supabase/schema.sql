-- ============================================================================
-- PG MANAGEMENT SAAS — DATABASE SCHEMA
-- Run this entire file in Supabase SQL Editor (one go)
-- ============================================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================================
-- 1. PROFILES — extends Supabase auth.users with role info
-- ============================================================================
create type user_role as enum ('super_admin', 'pg_owner', 'tenant');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'pg_owner',
  full_name text not null,
  phone text,
  email text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ============================================================================
-- 2. PROPERTIES — each PG building, owned by a pg_owner
-- ============================================================================
create table properties (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  address text,
  city text,
  state text default 'Karnataka',
  qr_slug text unique not null,           -- used in join link: pgmanager.app/join/<qr_slug>
  bank_account_name text,
  bank_account_number text,
  bank_ifsc text,
  upi_id text,
  created_at timestamptz default now()
);

-- ============================================================================
-- 3. ROOMS
-- ============================================================================
create table rooms (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  room_number text not null,
  floor int default 1,
  sharing_type text not null,              -- '1 Sharing' | '2 Sharing' | '3 Sharing' | '4 Sharing'
  total_beds int not null,
  monthly_rent numeric(10,2) not null,
  notes text,
  photo_urls text[],
  created_at timestamptz default now(),
  unique(property_id, room_number)
);

-- ============================================================================
-- 4. TENANTS
-- ============================================================================
create type tenant_status as enum ('active', 'leaving', 'left', 'pending_approval');
create type kyc_status as enum ('pending', 'verified', 'rejected');

create table tenants (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid references auth.users(id) on delete set null,  -- null until login is created
  property_id uuid not null references properties(id) on delete cascade,
  room_id uuid references rooms(id) on delete set null,
  bed_label text,                          -- 'A', 'B', 'C'...
  name text not null,
  phone text not null,                     -- also used as login username
  email text,
  emergency_contact text,
  photo_url text,
  aadhaar_url text,
  aadhaar_status kyc_status default 'pending',
  pan_url text,
  pan_status kyc_status default 'pending',
  agreement_url text,
  notice_period_days int default 30,
  joining_date date not null,
  leaving_date date,
  monthly_rent numeric(10,2) not null,
  deposit_amount numeric(10,2) not null default 0,
  deposit_paid numeric(10,2) not null default 0,   -- supports partial deposit at joining
  status tenant_status not null default 'pending_approval',
  submitted_via text default 'owner_added', -- 'owner_added' | 'qr_link'
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================================
-- 5. COLLECTORS — people who can collect cash/UPI on behalf of an owner
--    (the 2 owners + warden scenario — simple named list per property)
-- ============================================================================
create table collectors (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  name text not null,                      -- e.g. 'Owner — Suresh Kumar', 'Warden — Lakshmi'
  created_at timestamptz default now()
);

-- ============================================================================
-- 6. PAYMENTS — rent/deposit ledger, supports partial payments
-- ============================================================================
create type payment_type as enum ('rent', 'deposit', 'advance');
create type payment_method as enum ('upi', 'cash', 'bank_transfer');
create type payment_approval_status as enum ('approved', 'pending_approval', 'rejected');

create table payments (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  type payment_type not null default 'rent',
  for_month text,                          -- e.g. 'June 2024' (null for deposit/advance)
  total_due numeric(10,2) not null,
  amount_received numeric(10,2) not null,
  method payment_method,
  collected_by uuid references collectors(id),
  approval_status payment_approval_status not null default 'approved',
  -- when a tenant self-reports via "Mark as Paid":
  submitted_by_tenant boolean default false,
  tenant_note text,
  screenshot_url text,
  payment_date date not null default current_date,
  created_at timestamptz default now()
);

-- ============================================================================
-- 7. COMPLAINTS
-- ============================================================================
create type complaint_priority as enum ('low', 'medium', 'high');
create type complaint_status as enum ('open', 'in_progress', 'resolved');

create table complaints (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete set null,
  room_id uuid references rooms(id) on delete set null,
  issue_type text not null,
  description text,
  priority complaint_priority default 'medium',
  status complaint_status default 'open',
  assigned_to text,
  attachment_url text,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================================
-- 8. EXPENSES
-- ============================================================================
create table expenses (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  category text not null,                  -- Electricity, Water, WiFi, Cleaning, Maintenance, Salary, Other
  amount numeric(10,2) not null,
  notes text,
  expense_date date not null default current_date,
  created_at timestamptz default now()
);

-- ============================================================================
-- 9. INDEXES — for fast property-scoped queries
-- ============================================================================
create index idx_rooms_property on rooms(property_id);
create index idx_tenants_property on tenants(property_id);
create index idx_payments_property on payments(property_id);
create index idx_payments_tenant on payments(tenant_id);
create index idx_complaints_property on complaints(property_id);
create index idx_expenses_property on expenses(property_id);
create index idx_properties_owner on properties(owner_id);

-- ============================================================================
-- 10. ROW LEVEL SECURITY — the core of role-based data isolation
-- ============================================================================
alter table profiles enable row level security;
alter table properties enable row level security;
alter table rooms enable row level security;
alter table tenants enable row level security;
alter table collectors enable row level security;
alter table payments enable row level security;
alter table complaints enable row level security;
alter table expenses enable row level security;

-- Helper function: get current user's role
create or replace function get_my_role() returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer stable;

-- Helper function: check if a property belongs to the logged-in owner
create or replace function owns_property(prop_id uuid) returns boolean as $$
  select exists (
    select 1 from properties
    where id = prop_id and owner_id = auth.uid()
  );
$$ language sql security definer stable;

-- Helper: check if logged-in tenant belongs to a given property
create or replace function tenant_belongs_to_property(prop_id uuid) returns boolean as $$
  select exists (
    select 1 from tenants
    where property_id = prop_id and auth_user_id = auth.uid()
  );
$$ language sql security definer stable;

-- ---- PROFILES policies ----
create policy "Super admin sees all profiles" on profiles for select
  using (get_my_role() = 'super_admin' or id = auth.uid());
create policy "Users update own profile" on profiles for update
  using (id = auth.uid());
create policy "Super admin creates profiles" on profiles for insert
  with check (get_my_role() = 'super_admin' or id = auth.uid());

-- ---- PROPERTIES policies ----
create policy "Super admin sees all properties" on properties for select
  using (get_my_role() = 'super_admin' or owner_id = auth.uid() or tenant_belongs_to_property(id));
create policy "Owners manage own properties" on properties for insert
  with check (owner_id = auth.uid() or get_my_role() = 'super_admin');
create policy "Owners update own properties" on properties for update
  using (owner_id = auth.uid() or get_my_role() = 'super_admin');
create policy "Owners delete own properties" on properties for delete
  using (owner_id = auth.uid() or get_my_role() = 'super_admin');

-- Anonymous/public lookup by qr_slug — used by the public "Join PG" page so a
-- prospective tenant who isn't logged in yet can resolve a scanned QR/link
-- back to the right property_id before submitting their request.
--
-- IMPORTANT: we deliberately do NOT add a blanket "select" RLS policy here
-- (e.g. `using (true)`), because that would let anyone with the public anon
-- key list every property's full row — including bank_account_number,
-- upi_id, and address — not just the one they scanned. Instead we expose a
-- narrow SECURITY DEFINER function that returns only id + name for a given
-- slug, which is all the join page actually needs.
create or replace function get_property_by_slug(slug text)
returns table (id uuid, name text) as $$
  select id, name from properties where qr_slug = slug limit 1;
$$ language sql security definer stable;

grant execute on function get_property_by_slug(text) to anon, authenticated;

-- Lets the anonymous "Join PG" page check whether this phone number already
-- has a pending request at this property, without granting broad SELECT
-- access to the tenants table (which holds phone numbers, rent amounts, etc.)
create or replace function has_pending_join_request(p_property_id uuid, p_phone text)
returns boolean as $$
  select exists (
    select 1 from tenants
    where property_id = p_property_id
      and phone = p_phone
      and status = 'pending_approval'
      and submitted_via = 'qr_link'
  );
$$ language sql security definer stable;

grant execute on function has_pending_join_request(uuid, text) to anon, authenticated;

-- ---- ROOMS policies (scoped via property ownership) ----
create policy "View rooms of own/all properties" on rooms for select
  using (get_my_role() = 'super_admin' or owns_property(property_id) or tenant_belongs_to_property(property_id));
create policy "Manage rooms of own properties" on rooms for insert
  with check (owns_property(property_id) or get_my_role() = 'super_admin');
create policy "Update rooms of own properties" on rooms for update
  using (owns_property(property_id) or get_my_role() = 'super_admin');
create policy "Delete rooms of own properties" on rooms for delete
  using (owns_property(property_id) or get_my_role() = 'super_admin');

-- ---- TENANTS policies ----
create policy "View tenants of own properties or self" on tenants for select
  using (get_my_role() = 'super_admin' or owns_property(property_id) or auth_user_id = auth.uid());
create policy "Owners add tenants" on tenants for insert
  with check (owns_property(property_id) or get_my_role() = 'super_admin');
create policy "Owners update tenants, tenants update own row" on tenants for update
  using (owns_property(property_id) or auth_user_id = auth.uid() or get_my_role() = 'super_admin');
create policy "Owners delete tenants" on tenants for delete
  using (owns_property(property_id) or get_my_role() = 'super_admin');

-- Public insert policy for QR/link self-onboarding (no login required to submit)
create policy "Public can submit pending tenant requests" on tenants for insert
  with check (status = 'pending_approval' and submitted_via = 'qr_link');

-- ---- COLLECTORS policies ----
create policy "View collectors of own properties" on collectors for select
  using (get_my_role() = 'super_admin' or owns_property(property_id) or tenant_belongs_to_property(property_id));
create policy "Manage collectors of own properties" on collectors for all
  using (owns_property(property_id) or get_my_role() = 'super_admin');

-- ---- PAYMENTS policies ----
create policy "View payments of own properties or self" on payments for select
  using (
    get_my_role() = 'super_admin' or owns_property(property_id)
    or tenant_id in (select id from tenants where auth_user_id = auth.uid())
  );
create policy "Owners record payments" on payments for insert
  with check (owns_property(property_id) or get_my_role() = 'super_admin');
create policy "Tenants submit own paid claims" on payments for insert
  with check (
    submitted_by_tenant = true
    and tenant_id in (select id from tenants where auth_user_id = auth.uid())
  );

-- Public (unauthenticated) QR-onboarding submitters can log a single
-- "rent paid at joining" claim for the pending tenant row they just created
-- in the same request. It stays pending_approval until the owner reviews it,
-- same as everything else in the QR-onboarding flow.
create policy "Public can log joining-rent claim for pending tenant" on payments for insert
  with check (
    approval_status = 'pending_approval'
    and submitted_by_tenant = true
    and tenant_id in (select id from tenants where status = 'pending_approval' and submitted_via = 'qr_link')
  );
create policy "Owners update payments (approve/reject)" on payments for update
  using (owns_property(property_id) or get_my_role() = 'super_admin');

-- ---- COMPLAINTS policies ----
create policy "View complaints of own properties or self" on complaints for select
  using (
    get_my_role() = 'super_admin' or owns_property(property_id)
    or tenant_id in (select id from tenants where auth_user_id = auth.uid())
  );
create policy "Owners and tenants create complaints" on complaints for insert
  with check (
    owns_property(property_id) or get_my_role() = 'super_admin'
    or tenant_belongs_to_property(property_id)
  );
create policy "Owners update complaints" on complaints for update
  using (owns_property(property_id) or get_my_role() = 'super_admin');

-- ---- EXPENSES policies ----
create policy "View expenses of own properties" on expenses for select
  using (get_my_role() = 'super_admin' or owns_property(property_id));
create policy "Owners manage expenses" on expenses for all
  using (owns_property(property_id) or get_my_role() = 'super_admin');

-- ============================================================================
-- 11. AUTO-CREATE PROFILE ON SIGNUP (trigger)
-- ============================================================================
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'pg_owner')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- DONE — schema created successfully
-- ============================================================================
