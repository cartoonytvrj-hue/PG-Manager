-- ============================================================================
-- ADDITIONAL SETUP — run this AFTER schema.sql
-- Covers: Storage buckets (file uploads) + Auto monthly rent generation
-- ============================================================================

-- ============================================================================
-- 1. STORAGE BUCKETS
-- ============================================================================
-- Run this in SQL Editor. It creates buckets for tenant documents, room photos,
-- payment screenshots, and agreements. All are private by default — access is
-- controlled by the RLS policies below (same owner/tenant scoping as the DB).

insert into storage.buckets (id, name, public)
values
  ('tenant-documents', 'tenant-documents', false),
  ('room-photos', 'room-photos', false),
  ('payment-screenshots', 'payment-screenshots', false),
  ('agreements', 'agreements', false)
on conflict (id) do nothing;

-- ---- Storage RLS policies ----
-- Path convention used by the app: <property_id>/<tenant_id or room_id>/<filename>
-- This lets us reuse the same owns_property() / tenant_belongs_to_property()
-- helper functions from schema.sql by extracting the property_id from the path.

create or replace function owns_property_from_path(object_path text) returns boolean as $$
  select owns_property((string_to_array(object_path, '/'))[1]::uuid);
$$ language sql security definer stable;

create or replace function tenant_owns_path(object_path text) returns boolean as $$
  select exists (
    select 1 from tenants
    where auth_user_id = auth.uid()
    and id::text = (string_to_array(object_path, '/'))[2]
  );
$$ language sql security definer stable;

-- Tenant documents: owner of the property can read/write, tenant can read/write their own
create policy "tenant_documents_select" on storage.objects for select
  using (bucket_id = 'tenant-documents' and (owns_property_from_path(name) or tenant_owns_path(name) or get_my_role() = 'super_admin'));
create policy "tenant_documents_insert" on storage.objects for insert
  with check (bucket_id = 'tenant-documents' and (owns_property_from_path(name) or tenant_owns_path(name)));
create policy "tenant_documents_update" on storage.objects for update
  using (bucket_id = 'tenant-documents' and (owns_property_from_path(name) or tenant_owns_path(name)));
create policy "tenant_documents_delete" on storage.objects for delete
  using (bucket_id = 'tenant-documents' and (owns_property_from_path(name) or get_my_role() = 'super_admin'));

-- Room photos: owner manages, tenants of that property can view (e.g. before joining via QR — kept private, owner shares link manually)
create policy "room_photos_select" on storage.objects for select
  using (bucket_id = 'room-photos' and (owns_property_from_path(name) or tenant_owns_path(name) or get_my_role() = 'super_admin'));
create policy "room_photos_insert" on storage.objects for insert
  with check (bucket_id = 'room-photos' and owns_property_from_path(name));
create policy "room_photos_delete" on storage.objects for delete
  using (bucket_id = 'room-photos' and owns_property_from_path(name));

-- Payment screenshots: tenant uploads their own, owner of property can view
create policy "payment_screenshots_select" on storage.objects for select
  using (bucket_id = 'payment-screenshots' and (owns_property_from_path(name) or tenant_owns_path(name) or get_my_role() = 'super_admin'));
create policy "payment_screenshots_insert" on storage.objects for insert
  with check (bucket_id = 'payment-screenshots' and (tenant_owns_path(name) or owns_property_from_path(name)));

-- Agreements: owner uploads/generates, tenant can view/download their own
create policy "agreements_select" on storage.objects for select
  using (bucket_id = 'agreements' and (owns_property_from_path(name) or tenant_owns_path(name) or get_my_role() = 'super_admin'));
create policy "agreements_insert" on storage.objects for insert
  with check (bucket_id = 'agreements' and owns_property_from_path(name));

-- ============================================================================
-- 2. AUTO MONTHLY RENT GENERATION
-- ============================================================================
-- Instead of computing "pending rent" only on the fly in the UI, this creates
-- an actual `payments` row with approval_status = 'pending_approval' for every
-- active tenant whose due-day has arrived and who doesn't already have a rent
-- entry for the current month. Safe to run repeatedly (won't duplicate).

create or replace function generate_monthly_rent_dues() returns void as $$
declare
  t record;
  current_month_label text;
  due_day int;
  today date := current_date;
begin
  current_month_label := to_char(today, 'Month YYYY');
  current_month_label := trim(current_month_label);

  for t in
    select * from tenants where status = 'active'
  loop
    due_day := extract(day from t.joining_date);

    -- Only generate if today's day-of-month has reached the tenant's due day
    if extract(day from today) >= due_day then
      -- Skip if a rent row already exists for this tenant + this month
      if not exists (
        select 1 from payments
        where tenant_id = t.id
        and type = 'rent'
        and for_month = current_month_label
      ) then
        insert into payments (
          tenant_id, property_id, type, for_month,
          total_due, amount_received, approval_status,
          submitted_by_tenant, payment_date
        ) values (
          t.id, t.property_id, 'rent', current_month_label,
          t.monthly_rent, 0, 'pending_approval',
          false, today
        );
      end if;
    end if;
  end loop;
end;
$$ language plpgsql security definer;

-- Schedule it to run daily at 1 AM using pg_cron (free on Supabase).
-- If pg_cron extension isn't enabled yet, enable it first:
create extension if not exists pg_cron;

select cron.schedule(
  'generate-monthly-rent-dues',   -- job name
  '0 1 * * *',                    -- every day at 1:00 AM
  $$ select generate_monthly_rent_dues(); $$
);

-- ============================================================================
-- 3. NOTICE PERIOD TRACKING — helper view
-- ============================================================================
-- Surfaces tenants who have set a leaving_date, with days remaining on their
-- notice period, so the UI can show "notice period ending in X days" and flag
-- rooms that will soon become vacant.

create or replace view tenants_on_notice as
select
  t.*,
  (t.leaving_date - current_date) as days_until_leaving,
  (t.leaving_date - t.notice_period_days) as notice_should_have_started_by,
  case
    when t.leaving_date is null then false
    when (t.leaving_date - current_date) <= t.notice_period_days then true
    else false
  end as notice_period_active
from tenants t
where t.status in ('active', 'leaving');

-- RLS for the view inherits from the underlying `tenants` table policies automatically.

-- ============================================================================
-- DONE
-- ============================================================================
