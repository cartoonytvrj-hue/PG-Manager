'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatINR, formatDate, whatsappLink, upiPaymentLink } from '@/lib/utils'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import {
  LogOut, Loader2, CheckCircle, Clock, FileText, MessageCircle, Lock,
  Home, IndianRupee, ShieldCheck, Zap, Receipt, Bell, Menu, X, User, HelpCircle, Phone
} from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const NAV = [
  { href: '/portal', label: 'Dashboard', icon: Home },
  { href: '/portal/rent', label: 'Rent', icon: IndianRupee },
  { href: '/portal/deposit', label: 'Deposit', icon: ShieldCheck },
  { href: '/portal/history', label: 'Payment History', icon: Receipt },
  { href: '/portal/documents', label: 'Documents', icon: FileText },
  { href: '/portal/complaints', label: 'Complaints', icon: MessageCircle },
]

export default function TenantPortal() {
  const router = useRouter()
  const pathname = usePathname()
  const [tenant, setTenant] = useState<any>(null)
  const [owner, setOwner] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [pwModal, setPwModal] = useState(false)
  const [complaintModal, setComplaintModal] = useState(false)
  const [method, setMethod] = useState('upi')
  const [note, setNote] = useState('')
  const [pwForm, setPwForm] = useState({ newPw: '', confirm: '' })
  const [complaint, setComplaint] = useState({ issue_type: 'Plumbing', description: '', priority: 'medium' })
  const [saving, setSaving] = useState(false)
  const [claimed, setClaimed] = useState(false)

  useEffect(() => {
    async function load() {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: t } = await sb.from('tenants').select('*, room:rooms(*), property:properties(id, name, upi_id, owner_id)').eq('auth_user_id', user.id).single()
      if (!t) { router.push('/login'); return }
      setTenant(t)

      if (t.property?.owner_id) {
        const { data: ownerProfile } = await sb.from('profiles').select('full_name, phone').eq('id', t.property.owner_id).single()
        setOwner(ownerProfile)
      }

      const { data: p } = await sb.from('payments').select('*').eq('tenant_id', t.id).order('payment_date', { ascending: false })
      setPayments(p ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const thisMonth = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  const thisMonthPaid = payments.some(p => p.for_month === thisMonth && p.approval_status === 'approved')

  async function submitPayment() {
    setSaving(true)
    try {
      const sb = createClient()
      await sb.from('payments').insert({
        tenant_id: tenant.id, property_id: tenant.property_id,
        type: 'rent', for_month: thisMonth,
        total_due: tenant.monthly_rent, amount_received: tenant.monthly_rent,
        method, tenant_note: note, submitted_by_tenant: true,
        approval_status: 'pending_approval', payment_date: new Date().toISOString().slice(0, 10),
      })
      toast.success('Marked as paid — waiting for owner approval'); setClaimed(true); setPayModal(false)
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  async function submitComplaint() {
    setSaving(true)
    try {
      const sb = createClient()
      await sb.from('complaints').insert({ property_id: tenant.property_id, tenant_id: tenant.id, room_id: tenant.room_id, ...complaint })
      toast.success('Complaint submitted!'); setComplaintModal(false)
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  async function changePassword() {
    if (pwForm.newPw !== pwForm.confirm) { toast.error('Passwords do not match'); return }
    if (pwForm.newPw.length < 6) { toast.error('Min 6 characters'); return }
    const sb = createClient()
    const { error } = await sb.auth.updateUser({ password: pwForm.newPw })
    if (error) { toast.error(error.message); return }
    toast.success('Password updated!'); setPwModal(false); setPwForm({ newPw: '', confirm: '' })
  }

  async function logout() {
    const sb = createClient()
    await sb.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
    </div>
  )

  const depositDue = tenant.deposit_amount - tenant.deposit_paid

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Overlay (mobile) */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar — purple/indigo theme, distinct from Owner's navy */}
      <aside className={`fixed top-0 left-0 bottom-0 w-60 bg-gradient-to-b from-indigo-600 to-purple-700 z-50 flex flex-col transition-transform duration-200 shadow-xl ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <Home className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <div className="text-sm font-extrabold text-white leading-tight">{tenant.property?.name ?? 'PG Manager'}</div>
              <div className="text-[10px] text-indigo-200/80">Tenant Portal</div>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-white/60 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map(item => {
            const active = pathname === item.href
            return (
              <div key={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  active ? 'bg-white text-indigo-700 shadow-lg' : 'text-indigo-100/80 hover:bg-white/10 hover:text-white'
                }`}
                onClick={() => {
                  if (item.href === '/portal') { setSidebarOpen(false) }
                  else { toast.info('This section is part of the dashboard below for now'); setSidebarOpen(false) }
                }}>
                <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-indigo-600' : 'text-indigo-200/70'}`} />
                <span>{item.label}</span>
              </div>
            )
          })}
        </nav>

        <div className="p-3 border-t border-white/10 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            {tenant.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate">{tenant.name}</div>
            <div className="text-[10px] text-indigo-200/70">Room {tenant.room?.room_number}</div>
          </div>
          <button onClick={logout} className="text-indigo-200/70 hover:text-red-300 transition-colors p-1">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:ml-60">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-gray-100 flex items-center px-4 lg:px-6 gap-3 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 lg:hidden">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 hidden sm:block">Dashboard</h1>
          <div className="ml-auto flex items-center gap-3">
            <button className="relative p-2.5 rounded-full hover:bg-gray-100 transition text-gray-500">
              <Bell className="w-5 h-5" />
              {!thisMonthPaid && !claimed && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
              )}
            </button>
            <div className="flex items-center gap-2.5 pl-3 border-l border-gray-100">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                {tenant.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
              </div>
              <div className="hidden sm:block">
                <div className="text-sm font-bold text-gray-900 leading-tight">{tenant.name}</div>
                <div className="text-[11px] text-gray-400">Room {tenant.room?.room_number}, {tenant.bed_label ?? '—'}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-6 space-y-5 pb-12">
          {/* Greeting */}
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">Hello, {tenant.name.split(' ')[0]} 👋</h2>
            <p className="text-sm text-gray-500 mt-0.5">Welcome back to your dashboard</p>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center mb-2.5">
                <IndianRupee className="w-4 h-4 text-green-600" />
              </div>
              <div className="text-xs text-gray-500 font-medium">{thisMonthPaid ? 'Rent Status' : 'Next Rent Due'}</div>
              <div className="text-lg font-extrabold text-gray-900 mt-0.5">{formatINR(tenant.monthly_rent)}</div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${thisMonthPaid ? 'bg-green-100 text-green-700' : claimed ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                {thisMonthPaid ? 'Paid' : claimed ? 'Pending Approval' : 'Upcoming'}
              </span>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center mb-2.5">
                <ShieldCheck className="w-4 h-4 text-red-500" />
              </div>
              <div className="text-xs text-gray-500 font-medium">Outstanding</div>
              <div className="text-lg font-extrabold text-gray-900 mt-0.5">{thisMonthPaid ? formatINR(0) : formatINR(tenant.monthly_rent)}</div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${thisMonthPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {thisMonthPaid ? "You're all caught up!" : 'Due'}
              </span>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center mb-2.5">
                <ShieldCheck className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-xs text-gray-500 font-medium">Security Deposit</div>
              <div className="text-lg font-extrabold text-gray-900 mt-0.5">{formatINR(tenant.deposit_paid)}</div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${depositDue > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                {depositDue > 0 ? `₹${depositDue.toLocaleString('en-IN')} pending` : 'Paid'}
              </span>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center mb-2.5">
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-xs text-gray-500 font-medium">Room & Bed</div>
              <div className="text-lg font-extrabold text-gray-900 mt-0.5">{tenant.room?.room_number ?? '—'}</div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{tenant.bed_label ?? 'Single Bed'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Recent Payments */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-sm text-gray-900">Recent Payments</div>
                {!thisMonthPaid && !claimed && (
                  <button onClick={() => setPayModal(true)} className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition">
                    Mark as Paid
                  </button>
                )}
              </div>
              {payments.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No payment history yet</div>
              ) : (
                <div className="space-y-1">
                  {payments.slice(0, 5).map(p => (
                    <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                          <Home className="w-3.5 h-3.5 text-indigo-500" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">Rent — {p.for_month}</div>
                          <div className="text-xs text-gray-400">{formatDate(p.payment_date)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-gray-900">{formatINR(p.amount_received)}</div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.approval_status === 'approved' ? 'bg-green-100 text-green-700' : p.approval_status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {p.approval_status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Need Help card */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="font-bold text-sm text-gray-900 mb-1">Need Help?</div>
              <div className="text-xs text-gray-400 mb-4">Contact your PG owner</div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {owner?.full_name ? owner.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2) : <User className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">{owner?.full_name ?? 'PG Owner'}</div>
                  <div className="text-xs text-gray-400">Owner</div>
                </div>
              </div>
              {owner?.phone ? (
                <div className="flex gap-2">
                  <a href={`tel:${owner.phone}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-xs font-semibold transition">
                    <Phone className="w-3.5 h-3.5" /> Call
                  </a>
                  <a href={whatsappLink(owner.phone, `Hi, this is ${tenant.name} from Room ${tenant.room?.room_number}. `)} target="_blank" rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-50 hover:bg-green-100 text-green-600 rounded-xl text-xs font-semibold transition">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </a>
                </div>
              ) : (
                <div className="text-xs text-gray-400">Contact details not available yet</div>
              )}

              <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
                <button onClick={() => setComplaintModal(true)} className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs font-semibold text-gray-700 transition">
                  <MessageCircle className="w-4 h-4 text-indigo-500" /> Raise Complaint
                </button>
                <button onClick={() => setPwModal(true)} className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs font-semibold text-gray-700 transition">
                  <Lock className="w-4 h-4 text-purple-500" /> Change Password
                </button>
                <button onClick={() => toast.success('Agreement downloaded')} className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs font-semibold text-gray-700 transition">
                  <FileText className="w-4 h-4 text-blue-500" /> Download Agreement
                </button>
              </div>
            </div>
          </div>

          {/* Agreement summary */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              <span className="font-bold text-sm text-gray-900">My Agreement</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Monthly rent of {formatINR(tenant.monthly_rent)}, deposit {formatINR(tenant.deposit_amount)}, with a {tenant.notice_period_days}-day notice period required before vacating.
            </p>
          </div>
        </main>
      </div>

      {/* Mark as Paid Modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold">Mark Rent as Paid</h2>
              <button onClick={() => setPayModal(false)} className="text-gray-400 text-xl font-bold">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-indigo-50 rounded-xl p-3 text-xs text-indigo-700">This notifies your owner that you've paid. No real payment is made here. Owner will verify and approve.</div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-2">Payment Method</label>
                <div className="flex gap-2">
                  {['upi', 'cash', 'bank_transfer'].map(m => (
                    <button key={m} onClick={() => setMethod(m)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${method === m ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {m.replace('_', ' ').toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {method === 'upi' && (
                tenant.property?.upi_id ? (
                  <div className="bg-gray-50 rounded-xl p-4 flex flex-col items-center">
                    <div className="bg-white p-3 rounded-xl border border-gray-100">
                      <QRCodeSVG
                        value={upiPaymentLink(tenant.property.upi_id, tenant.property.name ?? 'PG Owner', tenant.monthly_rent, `Rent - ${thisMonth}`)}
                        size={140}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-3 text-center">
                      Scan with any UPI app (GPay, PhonePe, Paytm) to pay <span className="font-bold text-gray-800">{formatINR(tenant.monthly_rent)}</span> directly to your owner.
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1 font-mono">{tenant.property.upi_id}</div>
                    <div className="text-[11px] text-indigo-600 mt-2 text-center">
                      After paying, tap "Submit for Approval" below so your owner can confirm.
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-700">
                    Your owner hasn't added a UPI ID yet. Pay them directly and note it below, or choose Cash / Bank Transfer.
                  </div>
                )
              )}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Note (optional)</label>
                <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Paid via GPay this morning" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 resize-none" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={submitPayment} disabled={saving} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Submit for Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complaint Modal */}
      {complaintModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold">Raise Complaint</h2>
              <button onClick={() => setComplaintModal(false)} className="text-gray-400 text-xl font-bold">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Issue Type</label>
                <select value={complaint.issue_type} onChange={e => setComplaint(c => ({ ...c, issue_type: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500">
                  {['Plumbing', 'Electrical', 'WiFi', 'Cleaning', 'AC', 'Maintenance', 'Other'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Priority</label>
                <div className="flex gap-2">
                  {['low', 'medium', 'high'].map(p => (
                    <button key={p} onClick={() => setComplaint(c => ({ ...c, priority: p }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition capitalize ${complaint.priority === p ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-600'}`}>{p}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Description</label>
                <textarea rows={3} value={complaint.description} onChange={e => setComplaint(c => ({ ...c, description: e.target.value }))} placeholder="Describe the issue…" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 resize-none" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={submitComplaint} disabled={saving} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Submit Complaint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {pwModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold">Change Password</h2>
              <button onClick={() => setPwModal(false)} className="text-gray-400 text-xl font-bold">×</button>
            </div>
            <div className="p-5 space-y-4">
              {[['New Password', 'newPw'], ['Confirm Password', 'confirm']].map(([l, k]) => (
                <div key={k}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">{l}</label>
                  <input type="password" value={(pwForm as any)[k]} onChange={e => setPwForm(f => ({ ...f, [k]: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={changePassword} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition">Update Password</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
