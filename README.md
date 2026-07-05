# PG Manager — SaaS for Indian PG/Hostel Management

Next.js 15 + TypeScript + Tailwind + shadcn-style UI + Supabase (DB + Auth) + Vercel.

## What's included

- **Super Admin** dashboard (`/admin`) — add/manage PG Owners
- **PG Owner** dashboard (`/dashboard`, `/rooms`, `/tenants`, `/payments`, `/approvals`, `/complaints`, `/expenses`, `/reports`, `/settings`) — multi-property switcher (All Properties or one specific PG)
- **Tenant Portal** (`/portal`) — rent status, mark-as-paid (owner-approved), payment history, agreement, complaints, change password
- **Public Join Link** (`/join/[slug]`) — QR/link based tenant self-onboarding, goes to owner's Approvals page
- Partial payments with **Collected By** attribution (multiple collectors per property)
- Pending rent sorted by due date (computed from each tenant's joining day)
- WhatsApp + Call reminder buttons throughout

## 1. Supabase Setup

1. Go to [supabase.com](https://supabase.com) → New Project (choose Mumbai/Singapore region, free tier)
2. Once created, go to **SQL Editor** → paste the entire contents of `supabase/schema.sql` → Run
3. Go to **Project Settings → API** and copy:
   - Project URL
   - `anon` public key

## 2. Local Setup

```bash
npm install
cp .env.local.example .env.local
# edit .env.local and paste your Supabase URL + anon key
npm run dev
```

Visit `http://localhost:3000`.

## Test / sample data (optional but recommended)

The app works fine with zero data — every dashboard shows honest zeros instead of hiding sections. But if you want to see it populated with realistic numbers (rooms, tenants, payments, complaints, expenses) without manually clicking through the UI dozens of times:

1. Sign up / log in as a PG Owner at least once, so your profile row exists (Super Admin can create owner accounts from `/admin`, or sign up directly if you're testing solo).
2. In Supabase Dashboard → **Table Editor → profiles**, find your row and copy its `id` (a UUID).
3. Open `supabase/seed-test-data.sql`, replace the placeholder UUID (`00000000-0000-0000-0000-000000000000`) near the top with your real profile `id`.
4. Paste the whole file into **SQL Editor** and run it.

This creates 2 properties ("Sunrise PG", "Green Valley PG"), 5 rooms, 6 active tenants (including one on notice period and one with a deliberately partial deposit), a pending QR-submitted join request, this month's and last month's rent payments (including a multi-collector partial-payment example — half paid to you, half to a warden — so the Payments ledger has something real to show), a couple of complaints (one open, one resolved), and expenses across two months so the Reports revenue/expense chart has an actual trend instead of flat zeros.

Safe to run only once per owner — re-running it will create duplicate rows (it doesn't check for existing data first), so if you want to reset, delete the rows from Table Editor first.

## Login (single unified page)

Everyone — Super Admin, PG Owner, and Tenant — logs in at the same `/login` page. There's no role picker: the person enters their **email (owners/admin) or mobile number (tenants)** and password, and the app detects their role automatically after sign-in and routes them to the right dashboard (`/admin`, `/dashboard`, or `/portal`). If someone is already logged in and visits `/login` again, they're bounced straight to their dashboard.

## 3. Create your Super Admin account

There's no signup UI for admins by design (security). Two ways to do this:

**Option A — via SQL Editor (fastest):** Open `supabase/create-user.sql`, edit the email/password/name/role variables near the top, set `new_role := 'super_admin'`, and run the whole file. It creates the login and profile in one step — read the caveat comment at the top of that file first, since it writes directly into Supabase's internal auth tables.

**Option B — via Dashboard (most reliable):**
1. In Supabase Dashboard → **Authentication → Users** → "Add User" → enter your email + password → confirm email automatically.
2. Go to **Table Editor → profiles** → find the row with your new user's `id` → change `role` from `pg_owner` to `super_admin`.

Either way, log in at `/login` with that email — you'll land on `/admin`.

From `/admin` you can create PG Owner accounts (name, email, phone, temp password) — share those credentials with each owner, who logs in at `/login` too. Owners in turn create tenant logins (mobile number + password) via the Tenants or Approvals page — tenants also log in at the same `/login` page, just using their phone number instead of an email.

## 4. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit — PG Manager SaaS"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

## 5. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import your GitHub repo
2. In **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL` (set to your Vercel URL once deployed, e.g. `https://your-app.vercel.app`)
3. Click **Deploy**

Every time you `git push`, Vercel auto-redeploys.

## How the roles work

| Role | Login | Sees |
|---|---|---|
| Super Admin | Email + password (set manually in Supabase, see step 3) | All PG owners, can add/deactivate owners |
| PG Owner | Email + password (given by Super Admin) | Only their own properties (enforced by Row Level Security) |
| Tenant | Mobile number + password (set by owner, or auto after QR approval) | Only their own tenant record & payments |

Row Level Security (RLS) in `supabase/schema.sql` enforces all of this at the database level — even if someone tampers with the frontend, Supabase itself blocks cross-owner data access.

## Tenant self-onboarding via QR

1. Owner opens **Approvals → Tenant Join Link / QR**, gets a unique link like `yourapp.vercel.app/join/sunrise-pg-x7k2`
2. Share via WhatsApp or print the QR
3. Prospective tenant scans/opens it, fills their own details (name, room wish, rent, deposit — including partial deposit paid) — **no login needed**
4. Request appears in owner's **Approvals → New Tenant Requests**
5. Owner approves + sets a password → tenant login is created automatically

## What happens if Supabase goes down?

This app has a **hard dependency on Supabase** — every login, page load, and save goes through it. If Supabase (or your specific project) is down:

- **No one can log in** — auth runs through Supabase, so sign-in requests will fail.
- **No pages will load data** — Rooms, Tenants, Payments, etc. all fetch live from the database; you'll see loading spinners or error toasts, not stale cached data.
- **No new entries can be saved** — adding a tenant, recording a payment, marking rent as paid, etc. will fail with an error toast until Supabase is back.
- **Already-logged-in users are also affected** — the session token itself may still be valid, but every action they take still needs to reach the database.

This is normal for *any* app built on a cloud database (Firebase, MongoDB Atlas, PlanetScale, etc.) — it's not a bug specific to this project. In practice, Supabase's free-tier uptime is generally very good (99%+ historically), and outages are rare and usually short. If you eventually need the app to keep working during outages or with no internet at all (e.g. offline data entry that syncs later), that requires a fundamentally different architecture — a local-first database on the device that syncs to Supabase when connectivity returns. That's a significant rebuild, not a small addition, so it's worth flagging now rather than assuming it "just works" offline.

## Rent payments — free, no gateway needed

There's **no payment gateway integration** (Razorpay, Stripe, etc.) — and none is needed for the current flow:

1. Owner adds their **UPI ID** in Settings (e.g. `owner@okhdfcbank`). A live QR preview shows immediately — this uses the standard `upi://pay?...` deep-link format that every UPI QR code uses, generated entirely client-side with no API calls or fees.
2. When a tenant opens "Mark Rent as Paid" and selects UPI, they see that same QR (pre-filled with the exact rent amount) right in the app. They scan it with their own UPI app (GPay/PhonePe/Paytm/etc.) and pay **directly into the owner's bank account** — this app never touches the money, so there's no transaction fee and no payment gateway account to set up.
3. After paying, the tenant taps "Submit for Approval." This just creates a `pending_approval` row in the `payments` table — it does **not** verify that money actually moved.
4. The owner sees it in **Approvals → Payment Claims**, checks their own bank/UPI app to confirm the money arrived, then clicks Approve (or Reject if it wasn't received).

This keeps things completely free and avoids handling money or PCI-type compliance, at the cost of the confirmation step being manual rather than automatic. If you later want the app to auto-confirm payments without the owner checking manually, that requires a real payment gateway (Razorpay is the common choice for India) — those charge ~2% per transaction and require a business KYC to set up, so it's a deliberate later upgrade, not something to bolt on for free.

## Notes / things to wire up later

- File uploads (Aadhaar, PAN, agreement PDFs, room photos) need Supabase **Storage** buckets — not yet wired into the UI forms, but the DB columns (`aadhaar_url`, `pan_url`, etc.) are ready for it.
- PDF/Excel export buttons currently show toast confirmations only — hook up `jspdf` / `xlsx` (already in `package.json`) when ready.
- WhatsApp reminder buttons open `wa.me` links (no API cost, uses the user's own WhatsApp) — for automatic scheduled reminders you'd need the WhatsApp Business API later.
- **Known limitation — phone numbers must be globally unique across the whole platform, not just within one PG.** Tenant logins work by turning their mobile number into a fake email (`9876543210@pgmanager.local`) for Supabase Auth, and Supabase requires every auth email to be unique across all users everywhere. In practice this means: if a tenant leaves one PG and later joins a different one (or the same one again) with the same number, approving them will fail with a clear error asking the owner to double check — it won't silently create a second broken account, but it also won't "just work" automatically. Properly fixing this means moving to real phone-based OTP auth or namespacing the synthetic email per-property, which is a bigger auth change worth doing before this goes to many real users.
