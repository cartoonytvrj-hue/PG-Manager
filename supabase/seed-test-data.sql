-- ============================================================================
-- TEST / SEED DATA — run this AFTER schema.sql and AFTER you've created at
-- least one PG Owner account (either via the Super Admin dashboard, or by
-- signing up directly and having the auto-profile trigger create your row).
--
-- HOW TO USE:
-- 1. Log in to your app once as the PG Owner you want to seed data for, so
--    their row exists in `profiles`.
-- 2. In Supabase Dashboard -> Table Editor -> profiles, copy that owner's
--    `id` (a UUID).
-- 3. Paste it into the OWNER_ID variable below (replace the placeholder).
-- 4. Run this whole file in the SQL Editor.
--
-- This creates: 2 properties, several rooms, several tenants (with realistic
-- partial-payment and notice-period scenarios), payments (including a
-- multi-collector partial-payment example), complaints, and expenses —
-- enough that every dashboard card, chart, and table has real numbers
-- instead of zeros.
-- ============================================================================

-- Small helper so seeded payment/expense month labels exactly match what the
-- frontend generates via JS's `toLocaleString('en-IN', { month: 'long', year: 'numeric' })`
-- — e.g. 'June 2024', with a single space and no padding. Postgres's own
-- `to_char(date, 'Month YYYY')` pads the month name to 9 characters
-- (e.g. 'June      2024'), which would silently fail to match and make these
-- seeded payments invisible to "this month's revenue" calculations.
create or replace function seed_month_label(d date) returns text as $$
  select trim(to_char(d, 'Month')) || ' ' || to_char(d, 'YYYY');
$$ language sql immutable;

do $$
declare
  -- ⚠️ REPLACE THIS with your actual PG Owner's profile id from Supabase Auth/Table Editor
  owner_id uuid := '00000000-0000-0000-0000-000000000000';

  prop1_id uuid;
  prop2_id uuid;

  room101_id uuid;
  room102_id uuid;
  room103_id uuid;
  room201_id uuid;
  room202_id uuid;

  collector_owner_id uuid;
  collector_warden_id uuid;

  tenant_rahul_id uuid;
  tenant_priya_id uuid;
  tenant_amit_id uuid;
  tenant_sneha_id uuid;
  tenant_vikram_id uuid;
  tenant_deepa_id uuid;
begin

  if owner_id = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Please set owner_id to a real profile id before running this seed script.';
  end if;

  -- ── Properties ──────────────────────────────────────────────────────────
  insert into properties (owner_id, name, address, city, state, qr_slug, upi_id)
  values (owner_id, 'Sunrise PG', '12, MG Road', 'Bangalore', 'Karnataka', 'sunrise-pg-demo1', 'sunrisepg@okhdfcbank')
  returning id into prop1_id;

  insert into properties (owner_id, name, address, city, state, qr_slug, upi_id)
  values (owner_id, 'Green Valley PG', '45, Ring Road', 'Bangalore', 'Karnataka', 'green-valley-demo2', 'greenvalley@paytm')
  returning id into prop2_id;

  -- ── Rooms (Sunrise PG) ──────────────────────────────────────────────────
  insert into rooms (property_id, room_number, floor, sharing_type, total_beds, monthly_rent, notes)
  values (prop1_id, '101', 1, '2 Sharing', 2, 8000, 'AC room, attached bathroom')
  returning id into room101_id;

  insert into rooms (property_id, room_number, floor, sharing_type, total_beds, monthly_rent, notes)
  values (prop1_id, '102', 1, '3 Sharing', 3, 6500, 'Fan room, common bathroom')
  returning id into room102_id;

  insert into rooms (property_id, room_number, floor, sharing_type, total_beds, monthly_rent, notes)
  values (prop1_id, '103', 1, '1 Sharing', 1, 12000, 'Single occupancy, AC')
  returning id into room103_id;

  -- ── Rooms (Green Valley PG) ─────────────────────────────────────────────
  insert into rooms (property_id, room_number, floor, sharing_type, total_beds, monthly_rent, notes)
  values (prop2_id, '201', 2, '4 Sharing', 4, 5000, 'Bunk beds')
  returning id into room201_id;

  insert into rooms (property_id, room_number, floor, sharing_type, total_beds, monthly_rent, notes)
  values (prop2_id, '202', 2, '2 Sharing', 2, 8000, 'Corner room, good ventilation')
  returning id into room202_id;

  -- ── Collectors (Sunrise PG) ─────────────────────────────────────────────
  insert into collectors (property_id, name) values (prop1_id, 'Owner — You')
  returning id into collector_owner_id;
  insert into collectors (property_id, name) values (prop1_id, 'Warden — Lakshmi')
  returning id into collector_warden_id;

  -- ── Tenants (Sunrise PG — Room 101 & 102) ───────────────────────────────
  insert into tenants (property_id, room_id, bed_label, name, phone, email, joining_date, monthly_rent, deposit_amount, deposit_paid, status, notice_period_days)
  values (prop1_id, room101_id, 'A', 'Rahul Sharma', '9876543210', 'rahul@example.com', '2024-01-15', 8000, 16000, 16000, 'active', 30)
  returning id into tenant_rahul_id;

  insert into tenants (property_id, room_id, bed_label, name, phone, email, joining_date, monthly_rent, deposit_amount, deposit_paid, status, notice_period_days)
  values (prop1_id, room101_id, 'B', 'Priya Patel', '9765432109', 'priya@example.com', '2024-02-01', 8000, 16000, 16000, 'active', 30)
  returning id into tenant_priya_id;

  insert into tenants (property_id, room_id, bed_label, name, phone, email, joining_date, monthly_rent, deposit_amount, deposit_paid, status, notice_period_days)
  values (prop1_id, room102_id, 'A', 'Amit Kumar', '9654321098', 'amit@example.com', '2024-01-20', 6500, 13000, 8000, 'active', 30)
  returning id into tenant_amit_id;

  insert into tenants (property_id, room_id, bed_label, name, phone, email, joining_date, monthly_rent, deposit_amount, deposit_paid, status, notice_period_days)
  values (prop1_id, room102_id, 'B', 'Sneha Singh', '9543210987', 'sneha@example.com', '2024-03-01', 6500, 13000, 13000, 'active', 45)
  returning id into tenant_sneha_id;

  -- ── Tenants (Green Valley PG — Room 201) ────────────────────────────────
  insert into tenants (property_id, room_id, bed_label, name, phone, email, joining_date, monthly_rent, deposit_amount, deposit_paid, status, notice_period_days, leaving_date)
  values (prop2_id, room201_id, 'A', 'Vikram Reddy', '9432109876', 'vikram@example.com', '2023-12-01', 5000, 10000, 10000, 'leaving', 30, (current_date + interval '20 days'))
  returning id into tenant_vikram_id;

  insert into tenants (property_id, room_id, bed_label, name, phone, email, joining_date, monthly_rent, deposit_amount, deposit_paid, status, notice_period_days)
  values (prop2_id, room201_id, 'B', 'Deepa Nair', '9321098765', 'deepa@example.com', '2024-01-10', 5000, 10000, 5000, 'active', 30)
  returning id into tenant_deepa_id;

  -- ── A pending QR-submitted request awaiting owner approval ──────────────
  insert into tenants (property_id, name, phone, joining_date, monthly_rent, deposit_amount, deposit_paid, status, submitted_via, notice_period_days)
  values (prop1_id, 'Karan Mehta', '9988776655', current_date + interval '5 days', 6500, 13000, 6500, 'pending_approval', 'qr_link', 30);

  -- ── Payments: current month, fully approved ─────────────────────────────
  insert into payments (tenant_id, property_id, type, for_month, total_due, amount_received, method, collected_by, approval_status, payment_date)
  values
    (tenant_rahul_id, prop1_id, 'rent', seed_month_label(current_date), 8000, 8000, 'upi', collector_owner_id, 'approved', current_date - interval '3 days'),
    (tenant_amit_id, prop1_id, 'rent', seed_month_label(current_date), 6500, 6500, 'bank_transfer', collector_owner_id, 'approved', current_date - interval '2 days'),
    (tenant_vikram_id, prop2_id, 'rent', seed_month_label(current_date), 5000, 5000, 'upi', collector_owner_id, 'approved', current_date - interval '4 days');

  -- ── Partial payment example: Priya paid half via owner, half via warden ─
  -- (demonstrates the multi-collector ledger — each entry keeps its own collector, forever)
  insert into payments (tenant_id, property_id, type, for_month, total_due, amount_received, method, collected_by, approval_status, tenant_note, payment_date)
  values
    (tenant_priya_id, prop1_id, 'rent', seed_month_label(current_date), 8000, 4000, 'cash', collector_owner_id, 'approved', 'First half', current_date - interval '10 days'),
    (tenant_priya_id, prop1_id, 'rent', seed_month_label(current_date), 8000, 4000, 'cash', collector_warden_id, 'approved', 'Remaining half', current_date - interval '1 days');

  -- ── A tenant-submitted "mark as paid" claim awaiting owner approval ─────
  insert into payments (tenant_id, property_id, type, for_month, total_due, amount_received, method, approval_status, submitted_by_tenant, tenant_note, payment_date)
  values
    (tenant_deepa_id, prop2_id, 'rent', seed_month_label(current_date), 5000, 5000, 'upi', 'pending_approval', true, 'Paid via GPay this morning', current_date);

  -- Sneha (deliberately) has NOT paid this month yet — shows up in Pending Rent

  -- ── Last month's history (so the 6-month revenue chart has real trend data) ─
  insert into payments (tenant_id, property_id, type, for_month, total_due, amount_received, method, collected_by, approval_status, payment_date)
  values
    (tenant_rahul_id, prop1_id, 'rent', seed_month_label(current_date - interval '1 month'), 8000, 8000, 'upi', collector_owner_id, 'approved', current_date - interval '1 month'),
    (tenant_priya_id, prop1_id, 'rent', seed_month_label(current_date - interval '1 month'), 8000, 8000, 'cash', collector_owner_id, 'approved', current_date - interval '1 month'),
    (tenant_amit_id, prop1_id, 'rent', seed_month_label(current_date - interval '1 month'), 6500, 6500, 'bank_transfer', collector_owner_id, 'approved', current_date - interval '1 month'),
    (tenant_sneha_id, prop1_id, 'rent', seed_month_label(current_date - interval '1 month'), 6500, 6500, 'upi', collector_owner_id, 'approved', current_date - interval '1 month'),
    (tenant_vikram_id, prop2_id, 'rent', seed_month_label(current_date - interval '1 month'), 5000, 5000, 'upi', collector_owner_id, 'approved', current_date - interval '1 month'),
    (tenant_deepa_id, prop2_id, 'rent', seed_month_label(current_date - interval '1 month'), 5000, 5000, 'cash', collector_owner_id, 'approved', current_date - interval '1 month');

  -- ── Complaints ───────────────────────────────────────────────────────────
  insert into complaints (property_id, tenant_id, room_id, issue_type, description, priority, status, assigned_to)
  values
    (prop1_id, tenant_rahul_id, room101_id, 'Plumbing', 'Water leaking from bathroom tap', 'high', 'open', 'Plumber Raju'),
    (prop1_id, tenant_amit_id, room102_id, 'Electrical', 'Fan not working properly', 'medium', 'in_progress', 'Electrician Mohan'),
    (prop2_id, tenant_deepa_id, room201_id, 'WiFi', 'Internet speed very slow', 'low', 'resolved', 'ISP Support');

  update complaints set resolved_at = current_date - interval '2 days'
  where property_id = prop2_id and issue_type = 'WiFi';

  -- ── Expenses (this month) ───────────────────────────────────────────────
  insert into expenses (property_id, category, amount, notes, expense_date)
  values
    (prop1_id, 'Electricity', 8500, 'This month electricity bill', current_date - interval '5 days'),
    (prop1_id, 'Water', 1200, 'Monthly water charges', current_date - interval '5 days'),
    (prop1_id, 'WiFi', 2500, 'Internet plan renewal', current_date - interval '3 days'),
    (prop1_id, 'Cleaning', 3000, 'Monthly cleaning service', current_date - interval '2 days'),
    (prop1_id, 'Maintenance', 1500, 'Bathroom repair', current_date - interval '1 days'),
    (prop2_id, 'Electricity', 5200, 'This month electricity bill', current_date - interval '4 days'),
    (prop2_id, 'Salary', 12000, 'Caretaker salary', current_date - interval '6 days');

  -- ── Expenses (last month, for the trend chart) ──────────────────────────
  insert into expenses (property_id, category, amount, notes, expense_date)
  values
    (prop1_id, 'Electricity', 7900, 'Previous month electricity', current_date - interval '1 month'),
    (prop1_id, 'Salary', 12000, 'Caretaker salary', current_date - interval '1 month'),
    (prop2_id, 'Electricity', 4800, 'Previous month electricity', current_date - interval '1 month');

  raise notice 'Seed data created successfully for owner %', owner_id;
end $$;
