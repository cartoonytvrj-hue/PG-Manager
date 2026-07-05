'use client'
import { useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Building2, CheckCircle, Loader2 } from 'lucide-react'

// In Next.js 15, route params are now delivered as a Promise (even in client
// components), so we unwrap it with React's `use()` hook instead of reading
// `params.slug` directly — the old pattern fails TypeScript's build-time
// PageProps check with "missing then/catch/finally" errors.
export default function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [step, setStep] = useState<'form' | 'done'>('form')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', phone: '', email: '', emergency_contact: '',
    joining_date: '', monthly_rent: '', deposit_amount: '', deposit_paid: '',
    rent_paid_now: '', notice_period_days: '30',
  })

  async function handleSubmit() {
    // Required fields
    if (!form.name.trim() || !form.phone || !form.joining_date || !form.monthly_rent) {
      toast.error('Please fill all required fields'); return
    }

    // Phone must be a valid 10-digit Indian mobile number — this becomes the
    // tenant's login username later, so a malformed number breaks their access permanently.
    const cleanedPhone = form.phone.replace(/\D/g, '')
    if (cleanedPhone.length !== 10 || !/^[6-9]/.test(cleanedPhone)) {
      toast.error('Enter a valid 10-digit mobile number'); return
    }

    // Numeric fields must be valid, non-negative numbers
    const monthlyRent = Number(form.monthly_rent)
    const depositAmount = Number(form.deposit_amount || 0)
    const depositPaid = Number(form.deposit_paid || 0)
    const rentPaidNow = Number(form.rent_paid_now || 0)

    if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
      toast.error('Enter a valid monthly rent amount'); return
    }
    if (!Number.isFinite(depositAmount) || depositAmount < 0) {
      toast.error('Deposit amount cannot be negative'); return
    }
    if (!Number.isFinite(depositPaid) || depositPaid < 0) {
      toast.error('Deposit paid cannot be negative'); return
    }
    if (depositPaid > depositAmount) {
      toast.error("Deposit paid can't be more than the total deposit"); return
    }
    if (!Number.isFinite(rentPaidNow) || rentPaidNow < 0) {
      toast.error('Rent paid cannot be negative'); return
    }
    if (rentPaidNow > monthlyRent) {
      toast.error("Rent paid can't be more than the monthly rent"); return
    }

    // Joining date should be reasonable — not more than a year in the past
    // (typo protection) and not absurdly far in the future.
    const joining = new Date(form.joining_date)
    const today = new Date()
    const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
    const sixMonthsAhead = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate())
    if (Number.isNaN(joining.getTime())) {
      toast.error('Enter a valid joining date'); return
    }
    if (joining < oneYearAgo || joining > sixMonthsAhead) {
      toast.error('Joining date looks incorrect — please double-check it'); return
    }

    // Basic email sanity check only if they entered one (it's optional)
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error('Enter a valid email address, or leave it blank'); return
    }

    setSaving(true)
    try {
      const sb = createClient()
      // Look up property by qr_slug via a narrow RPC (avoids exposing the
      // full properties row — bank details, UPI ID, etc. — to anonymous visitors)
      const { data: propertyRows, error: propErr } = await sb
        .rpc('get_property_by_slug', { slug })
      const property = propertyRows?.[0]
      if (propErr || !property) { toast.error('Invalid join link. Ask your PG owner for the correct link.'); setSaving(false); return }

      // Guard against accidental double-submits (fast double-tap, slow network retry)
      // creating two pending requests for the same person at the same property.
      const { data: alreadyPending } = await sb
        .rpc('has_pending_join_request', { p_property_id: property.id, p_phone: cleanedPhone })
      if (alreadyPending) {
        toast.error("You've already submitted a request for this PG — please wait for the owner to review it.")
        setSaving(false)
        return
      }

      const { data: newTenant, error } = await sb.from('tenants').insert({
        property_id: property.id,
        name: form.name.trim(),
        phone: cleanedPhone,
        email: form.email || null,
        emergency_contact: form.emergency_contact ? form.emergency_contact.replace(/\D/g, '') : null,
        joining_date: form.joining_date,
        monthly_rent: monthlyRent,
        deposit_amount: depositAmount,
        deposit_paid: depositPaid,
        notice_period_days: Number(form.notice_period_days),
        status: 'pending_approval',
        submitted_via: 'qr_link',
      }).select().single()
      if (error) throw error

      // If they said they've already paid some rent, log it as a pending
      // claim tied to this tenant — the owner will see and approve/reject
      // it alongside the tenant request itself.
      if (rentPaidNow > 0 && newTenant) {
        const joiningMonth = new Date(form.joining_date).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
        const { error: payErr } = await sb.from('payments').insert({
          tenant_id: newTenant.id,
          property_id: property.id,
          type: 'rent',
          for_month: joiningMonth,
          total_due: monthlyRent,
          amount_received: rentPaidNow,
          method: null,
          approval_status: 'pending_approval',
          submitted_by_tenant: true,
          tenant_note: 'Reported as paid at joining (via QR request)',
          payment_date: form.joining_date,
        })
        // Non-fatal — the tenant request itself is already submitted successfully.
        if (payErr) console.error('Could not log joining-rent claim:', payErr.message)
      }
      setStep('done')
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  const Field = ({ label, required, ...props }: any) => (
    <div>
      <label className="text-xs font-semibold text-gray-600 block mb-1">{label}{required && ' *'}</label>
      <input {...props} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
    </div>
  )

  if (step === 'done') return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
        <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
        <h2 className="text-lg font-extrabold text-gray-900 mb-2">Request Submitted!</h2>
        <p className="text-sm text-gray-500">Your details have been sent to the PG owner. They will review and create your login. You'll receive your credentials soon.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg mb-3">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-extrabold text-gray-900">Join PG</h1>
          <p className="text-xs text-gray-500 mt-1">Fill your details — the owner will approve your request</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Field label="Full Name" required value={form.name} onChange={(e: any) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your full name" /></div>
            <Field label="Mobile Number" required type="tel" value={form.phone} onChange={(e: any) => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="10-digit mobile" />
            <Field label="Email" type="email" value={form.email} onChange={(e: any) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Optional" />
            <Field label="Emergency Contact" type="tel" value={form.emergency_contact} onChange={(e: any) => setForm(f => ({ ...f, emergency_contact: e.target.value }))} placeholder="Parent/Guardian" />
            <Field label="Joining Date" required type="date" value={form.joining_date} onChange={(e: any) => setForm(f => ({ ...f, joining_date: e.target.value }))} />
            <Field label="Monthly Rent (₹)" required type="number" value={form.monthly_rent} onChange={(e: any) => setForm(f => ({ ...f, monthly_rent: e.target.value }))} placeholder="As agreed" />
            <Field label="Total Deposit (₹)" type="number" value={form.deposit_amount} onChange={(e: any) => setForm(f => ({ ...f, deposit_amount: e.target.value }))} placeholder="0" />
            <div className="col-span-2">
              <Field label="Deposit Paid Now (₹)" type="number" value={form.deposit_paid} onChange={(e: any) => setForm(f => ({ ...f, deposit_paid: e.target.value }))} placeholder="If partial, enter amount paid today" />
            </div>
            <div className="col-span-2">
              <Field label="Rent Paid Now (₹)" type="number" value={form.rent_paid_now} onChange={(e: any) => setForm(f => ({ ...f, rent_paid_now: e.target.value }))} placeholder="If you've already paid some/all first month's rent" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Notice Period</label>
              <div className="flex gap-2">
                {['15', '30', '45', '60'].map(d => (
                  <button key={d} onClick={() => setForm(f => ({ ...f, notice_period_days: d }))}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${form.notice_period_days === d ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {d} days
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
            Your details will be reviewed by the PG owner. Once approved, you'll get a login to track your rent and more.
          </div>

          <button onClick={handleSubmit} disabled={saving}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  )
}
