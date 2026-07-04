'use client'
import { useEffect, useState, useCallback } from 'react'
import { useProperty } from '@/components/shared/PropertyContext'
import { getPayments, recordPayment, approvePayment, rejectPayment, getCollectors, getTenants } from '@/lib/supabase/queries'
import { formatINR, formatDate, whatsappLink, rentReminderMsg, computeDueDate, getOverdueDays } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Check, MessageCircle, Phone, Loader2, FileText } from 'lucide-react'
import type { Payment, Collector, Tenant } from '@/types'

type Tab = 'all' | 'paid' | 'pending' | 'overdue' | 'bydue' | 'ledger'

export default function PaymentsPage() {
  const { activeId, active, properties } = useProperty()
  const [payments, setPayments] = useState<Payment[]>([])
  const [collectors, setCollectors] = useState<Collector[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('all')
  const [recordModal, setRecordModal] = useState(false)
  const [bulkReminderModal, setBulkReminderModal] = useState(false)
  const [remindedPhones, setRemindedPhones] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [receiptPayment, setReceiptPayment] = useState<any>(null)
  const [form, setForm] = useState({
    tenant_id: '', type: 'rent', for_month: '', total_due: '', amount_received: '',
    method: 'cash', collected_by: '', payment_date: new Date().toISOString().slice(0, 10),
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const propIds = activeId === 'all' ? properties.map(p => p.id) : [activeId]
      const [pList, tList] = await Promise.all([
        Promise.all(propIds.map(id => getPayments(id))).then(r => r.flat()),
        Promise.all(propIds.map(id => getTenants(id))).then(r => r.flat()),
      ])
      setPayments(pList)
      setTenants(tList)
      if (propIds.length === 1) {
        const cols = await getCollectors(propIds[0])
        setCollectors(cols)
      }
    } catch { toast.error('Failed to load payments') }
    setLoading(false)
  }, [activeId, properties])

  useEffect(() => { if (properties.length > 0 || activeId !== 'all') load() }, [load])

  // Pending rent sorted by due date — correctly accounts for PARTIAL payments.
  // A tenant who paid ₹4,000 of an ₹8,000 rent still owes ₹4,000, not ₹0.
  const today = new Date()
  const thisMonth = today.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  const approvedThisMonth = payments.filter(p => p.for_month === thisMonth && p.approval_status === 'approved' && p.type === 'rent')

  const pendingRentSorted = tenants
    .filter(t => t.status === 'active')
    .map(t => {
      const receivedThisMonth = approvedThisMonth
        .filter(p => p.tenant_id === t.id)
        .reduce((s, p) => s + p.amount_received, 0)
      const amountDue = Math.max(0, t.monthly_rent - receivedThisMonth)
      return {
        ...t,
        amountDue,
        receivedThisMonth,
        dueDate: computeDueDate(t.joining_date, today).toISOString().slice(0, 10),
        overdueDays: getOverdueDays(t.joining_date, today),
      }
    })
    .filter(t => t.amountDue > 0) // fully paid tenants (incl. exact partial completion) drop off the list
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

  const tabFiltered = {
    all: payments,
    paid: payments.filter(p => p.approval_status === 'approved'),
    pending: payments.filter(p => p.approval_status === 'pending_approval'),
    overdue: payments.filter(p => p.approval_status === 'pending_approval'),
    bydue: [],
    ledger: payments,
  }[tab]

  const totalCollected = payments.filter(p => p.approval_status === 'approved' && p.for_month === thisMonth).reduce((s, p) => s + p.amount_received, 0)
  const totalPending = pendingRentSorted.reduce((s, t) => s + t.amountDue, 0)

  async function handleRecord() {
    if (!form.tenant_id || !form.amount_received) { toast.error('Fill required fields'); return }
    setSaving(true)
    try {
      const propId = activeId === 'all'
        ? tenants.find(t => t.id === form.tenant_id)?.property_id ?? ''
        : activeId
      await recordPayment({
        tenant_id: form.tenant_id,
        property_id: propId,
        type: form.type as any,
        for_month: form.for_month || undefined,
        total_due: Number(form.total_due),
        amount_received: Number(form.amount_received),
        method: form.method as any,
        collected_by: form.collected_by || undefined,
        payment_date: form.payment_date,
      })
      toast.success('Payment recorded!')
      setRecordModal(false)
      load()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  const TABS: [Tab, string][] = [['all', 'All'], ['paid', 'Paid'], ['pending', 'Pending'], ['bydue', 'Pending (by due date)'], ['ledger', 'Ledger']]

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">Payments</h1>
          <p className="text-sm text-gray-500">Rent collection & ledger</p>
        </div>
        <div className="flex gap-2">
          {pendingRentSorted.length > 0 && (
            <button onClick={() => setBulkReminderModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-xl text-sm font-semibold transition">
              <MessageCircle className="w-4 h-4" /> Remind All ({pendingRentSorted.length})
            </button>
          )}
          <button onClick={() => setRecordModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">
            <Plus className="w-4 h-4" /> Record Payment
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Collected', value: formatINR(totalCollected), color: 'text-green-600' },
          { label: 'Pending Rent', value: formatINR(totalPending), color: 'text-yellow-600' },
          { label: 'Collection Rate', value: `${Math.round((totalCollected / (totalCollected + totalPending || 1)) * 100)}%`, color: 'text-blue-600' },
          { label: 'Pending Tenants', value: String(pendingRentSorted.length), color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{s.label}</div>
            <div className={`text-xl font-extrabold mt-1 ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit flex-wrap">
        {TABS.map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${tab === v ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'bydue' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">
            Sorted by due date — oldest overdue first. Due date = same day-of-month as joining date.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                {['Tenant', 'Due Date', 'Overdue By', 'Amount', 'Remind', 'Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {pendingRentSorted.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">🎉 No pending rent!</td></tr>
                ) : pendingRentSorted.map(t => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{t.name}</div>
                      <div className="text-xs text-gray-400">Room {t.room?.room_number}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold">{t.dueDate}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${t.overdueDays > 5 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {t.overdueDays}d overdue
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-gray-900">{formatINR(t.amountDue)}</div>
                      {t.receivedThisMonth > 0 && (
                        <div className="text-xs text-yellow-600 font-semibold">₹{t.receivedThisMonth.toLocaleString('en-IN')} already paid</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <a href={whatsappLink(t.phone, rentReminderMsg(t.name, t.amountDue, t.property?.name ?? 'PG'))}
                          target="_blank" rel="noreferrer" className="p-1.5 bg-green-100 hover:bg-green-200 rounded-lg transition">
                          <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                        </a>
                        <a href={`tel:${t.phone}`} className="p-1.5 bg-blue-100 hover:bg-blue-200 rounded-lg transition">
                          <Phone className="w-3.5 h-3.5 text-blue-600" />
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setForm(f => ({ ...f, tenant_id: t.id, total_due: String(t.monthly_rent), amount_received: String(t.amountDue), type: 'rent', for_month: thisMonth })); setRecordModal(true) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-semibold transition">
                        <Check className="w-3.5 h-3.5" /> Record
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {tab === 'ledger' && (
            <div className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">
              Every partial payment is logged separately with the collector's name. Past entries are never changed.
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-100">
                  {['Tenant', 'Month', 'Type', 'Due', 'Received', 'Mode', tab === 'ledger' ? 'Collected By' : 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {tabFiltered.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-10 text-gray-400">No payments found</td></tr>
                  ) : tabFiltered.map(p => (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{p.tenant?.name ?? '—'}</div>
                        <div className="text-xs text-gray-400">Room {p.tenant?.room?.room_number}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">{p.for_month ?? '—'}</td>
                      <td className="px-4 py-3"><span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full capitalize">{p.type}</span></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatINR(p.total_due)}</td>
                      <td className="px-4 py-3 font-bold text-green-700">{formatINR(p.amount_received)}</td>
                      <td className="px-4 py-3"><span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full capitalize">{p.method?.replace('_', ' ') ?? '—'}</span></td>
                      <td className="px-4 py-3">
                        {tab === 'ledger'
                          ? <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">{p.collector?.name ?? '—'}</span>
                          : <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${p.approval_status === 'approved' ? 'bg-green-100 text-green-700' : p.approval_status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {p.approval_status.replace('_', ' ')}
                            </span>
                        }
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(p.payment_date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          {p.approval_status === 'pending_approval' && (
                            <>
                              <button onClick={async () => { await approvePayment(p.id); toast.success('Approved'); load() }}
                                className="p-1.5 bg-green-100 hover:bg-green-200 rounded-lg transition"><Check className="w-3.5 h-3.5 text-green-600" /></button>
                              <button onClick={async () => { await rejectPayment(p.id); toast.error('Rejected'); load() }}
                                className="p-1.5 bg-red-100 hover:bg-red-200 rounded-lg transition text-red-600 font-bold text-xs">✕</button>
                            </>
                          )}
                          <button onClick={() => setReceiptPayment(p)} className="p-1.5 hover:bg-gray-100 rounded-lg transition"><FileText className="w-3.5 h-3.5 text-gray-500" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Record Payment Modal */}
      {recordModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Record Payment</h2>
              <button onClick={() => setRecordModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Tenant *</label>
                <select value={form.tenant_id} onChange={e => setForm(f => ({ ...f, tenant_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500">
                  <option value="">Select Tenant</option>
                  {tenants.filter(t => t.status === 'active').map(t => (
                    <option key={t.id} value={t.id}>{t.name} — Room {t.room?.room_number}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500">
                    {['rent', 'deposit', 'advance'].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">For Month</label>
                  <input value={form.for_month} onChange={e => setForm(f => ({ ...f, for_month: e.target.value }))} placeholder="e.g. June 2024" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Total Due (₹)</label>
                  <input type="number" value={form.total_due} onChange={e => setForm(f => ({ ...f, total_due: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Amount Received (₹) *</label>
                  <input type="number" value={form.amount_received} onChange={e => setForm(f => ({ ...f, amount_received: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Payment Mode</label>
                <div className="flex gap-2">
                  {['cash', 'upi', 'bank_transfer'].map(m => (
                    <button key={m} onClick={() => setForm(f => ({ ...f, method: m }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${form.method === m ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {m.replace('_', ' ').toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Collected By *</label>
                <select value={form.collected_by} onChange={e => setForm(f => ({ ...f, collected_by: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500">
                  <option value="">Select Collector</option>
                  {collectors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Add collectors in Settings if list is empty</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Payment Date</label>
                <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <p className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
                Partial payments are supported — only the amount entered above will be recorded. If remaining balance is collected later by a different person, add a separate entry.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={handleRecord} disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Payment
              </button>
              <button onClick={() => setRecordModal(false)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk WhatsApp Reminder Modal */}
      {bulkReminderModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Remind All Pending Tenants</h2>
              <button onClick={() => { setBulkReminderModal(false); setRemindedPhones(new Set()) }} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>
            <div className="p-6">
              <p className="text-xs text-gray-500 mb-4">
                Click each tenant to open WhatsApp with a pre-filled reminder. Browsers block auto-opening multiple tabs, so this is a click-through queue — go one by one.
              </p>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {pendingRentSorted.map(t => (
                  <a
                    key={t.id}
                    href={whatsappLink(t.phone, rentReminderMsg(t.name, t.monthly_rent, t.property?.name ?? active?.name ?? 'PG'))}
                    target="_blank" rel="noreferrer"
                    onClick={() => setRemindedPhones(prev => new Set(prev).add(t.id))}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition ${remindedPhones.has(t.id) ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                      {t.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{t.name}</div>
                      <div className="text-xs text-gray-400">₹{t.monthly_rent.toLocaleString('en-IN')} · {t.overdueDays}d overdue</div>
                    </div>
                    {remindedPhones.has(t.id) ? (
                      <span className="text-xs font-bold text-green-600">Sent ✓</span>
                    ) : (
                      <MessageCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    )}
                  </a>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button onClick={() => { setBulkReminderModal(false); setRemindedPhones(new Set()) }} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition">
                Done ({remindedPhones.size}/{pendingRentSorted.length} sent)
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Receipt Modal */}
      {receiptPayment && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Payment Receipt</h2>
              <button onClick={() => setReceiptPayment(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>
            <div className="p-6 space-y-1 text-sm" id="receipt-content">
              <div className="text-center mb-4">
                <div className="text-lg font-extrabold text-gray-900">{active?.name ?? receiptPayment.tenant?.property?.name ?? 'PG Manager'}</div>
                <div className="text-xs text-gray-400">Payment Receipt</div>
              </div>
              {[
                ['Tenant', receiptPayment.tenant?.name ?? '—'],
                ['Room', receiptPayment.tenant?.room?.room_number ?? '—'],
                ['Type', receiptPayment.type],
                ['For Month', receiptPayment.for_month ?? '—'],
                ['Amount Received', formatINR(receiptPayment.amount_received)],
                ['Total Due', formatINR(receiptPayment.total_due)],
                ['Payment Mode', receiptPayment.method?.replace('_', ' ') ?? '—'],
                ['Collected By', receiptPayment.collector?.name ?? '—'],
                ['Date', formatDate(receiptPayment.payment_date)],
                ['Status', receiptPayment.approval_status.replace('_', ' ')],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-400">{label}</span>
                  <span className="font-semibold text-gray-800 capitalize">{value}</span>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => window.print()} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">Print / Save PDF</button>
              <button onClick={() => setReceiptPayment(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

