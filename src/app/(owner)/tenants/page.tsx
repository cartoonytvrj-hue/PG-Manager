'use client'
import { useEffect, useState, useCallback } from 'react'
import { useProperty } from '@/components/shared/PropertyContext'
import { getTenants, getAllTenants, addTenantByOwner, setTenantLeaving, markTenantLeft, getRooms, updateTenant } from '@/lib/supabase/queries'
import { formatINR, formatDate, whatsappLink, rentReminderMsg } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Search, Phone, MessageCircle, Eye, Pencil, Loader2, LogOut, Calendar } from 'lucide-react'
import type { Tenant, Room } from '@/types'

const BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  leaving: 'bg-yellow-100 text-yellow-700',
  left: 'bg-gray-100 text-gray-500',
  pending_approval: 'bg-purple-100 text-purple-700',
}

const KYC: Record<string, string> = {
  verified: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function TenantsPage() {
  const { activeId, active, properties } = useProperty()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [noticeModal, setNoticeModal] = useState<Tenant | null>(null)
  const [leavingDate, setLeavingDate] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [viewTenant, setViewTenant] = useState<Tenant | null>(null)
  const [editTenant, setEditTenant] = useState<Tenant | null>(null)
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', emergency_contact: '', monthly_rent: '', deposit_amount: '', deposit_paid: '', notice_period_days: '' })
  const [editSaving, setEditSaving] = useState(false)

  const [form, setForm] = useState({
    property_id: '', room_id: '', bed_label: '', name: '', phone: '',
    email: '', emergency_contact: '', joining_date: '', monthly_rent: '',
    deposit_amount: '', deposit_paid: '', rent_paid_on_joining: '', notice_period_days: '30', password: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = activeId === 'all' 
        ? await getAllTenants()
        : await getTenants(activeId)
      setTenants(data ?? [])
    } catch { toast.error('Failed to load tenants') }
    setLoading(false)
  }, [activeId])

  useEffect(() => { load() }, [load])

  // Load rooms for whichever property is relevant to the Add Tenant form
  useEffect(() => {
    async function loadRooms() {
      const propId = activeId !== 'all' ? activeId : form.property_id
      if (!propId) { setRooms([]); return }
      try { setRooms(await getRooms(propId)) } catch { setRooms([]) }
    }
    loadRooms()
  }, [activeId, form.property_id])

  const filtered = tenants.filter(t =>
    (statusFilter === 'all' || t.status === statusFilter) &&
    (t.name.toLowerCase().includes(search.toLowerCase()) ||
     t.phone.includes(search) ||
     t.room?.room_number?.includes(search))
  )

  // Tenants currently serving notice, sorted soonest-to-leave first
  const onNotice = tenants
    .filter(t => t.status === 'leaving' && t.leaving_date)
    .map(t => ({
      ...t,
      daysLeft: Math.ceil((new Date(t.leaving_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft)

  async function handleSetNotice() {
    if (!noticeModal || !leavingDate) { toast.error('Pick a leaving date'); return }
    try {
      await setTenantLeaving(noticeModal.id, leavingDate)
      toast.success(`${noticeModal.name} marked as leaving on ${leavingDate}`)
      setNoticeModal(null); setLeavingDate('')
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  async function handleMarkLeft(tenantId: string, name: string) {
    if (!confirm(`Mark ${name} as moved out? This will free up their bed.`)) return
    try { await markTenantLeft(tenantId); toast.success(`${name} marked as left`); load() }
    catch (e: any) { toast.error(e.message) }
  }

  async function handleEditSave() {
    if (!editTenant) return
    if (!editForm.name || !editForm.phone) { toast.error('Name and phone are required'); return }
    setEditSaving(true)
    try {
      await updateTenant(editTenant.id, {
        name: editForm.name,
        phone: editForm.phone,
        email: editForm.email || null,
        emergency_contact: editForm.emergency_contact || null,
        monthly_rent: Number(editForm.monthly_rent),
        deposit_amount: Number(editForm.deposit_amount),
        deposit_paid: Number(editForm.deposit_paid),
        notice_period_days: Number(editForm.notice_period_days),
      })
      toast.success('Tenant updated!')
      setEditTenant(null)
      load()
    } catch (e: any) { toast.error(e.message) }
    setEditSaving(false)
  }

  async function handleAdd() {
    if (!form.name || !form.phone || !form.joining_date || !form.password) {
      toast.error('Fill all required fields'); return
    }
    const resolvedPropertyId = activeId !== 'all' ? activeId : form.property_id
    if (!resolvedPropertyId) {
      toast.error('Select a property for this tenant'); return
    }
    setSaving(true)
    try {
      await addTenantByOwner({
        property_id: resolvedPropertyId,
        room_id: form.room_id,
        bed_label: form.bed_label,
        name: form.name,
        phone: form.phone,
        email: form.email,
        emergency_contact: form.emergency_contact,
        joining_date: form.joining_date,
        monthly_rent: Number(form.monthly_rent),
        deposit_amount: Number(form.deposit_amount),
        deposit_paid: Number(form.deposit_paid || 0),
        rent_paid_on_joining: Number(form.rent_paid_on_joining || 0),
        notice_period_days: Number(form.notice_period_days),
        password: form.password,
      })
      toast.success('Tenant added & login created!')
      setModalOpen(false)
      setForm({ property_id: '', room_id: '', bed_label: '', name: '', phone: '', email: '', emergency_contact: '', joining_date: '', monthly_rent: '', deposit_amount: '', deposit_paid: '', rent_paid_on_joining: '', notice_period_days: '30', password: '' })
      load()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">Tenants</h1>
          <p className="text-sm text-gray-500">{tenants.filter(t => t.status === 'active').length} active tenants</p>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">
          <Plus className="w-4 h-4" /> Add Tenant
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, room..."
            className="w-full pl-8 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['all', 'active', 'leaving', 'pending_approval'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s === 'all' ? 'All' : s === 'pending_approval' ? 'Pending' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Notice Period Tracker */}
      {onNotice.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-bold text-amber-800">Tenants on Notice Period ({onNotice.length})</span>
          </div>
          <div className="space-y-2">
            {onNotice.map(t => (
              <div key={t.id} className="flex items-center gap-3 bg-white rounded-xl p-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                  {t.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{t.name} <span className="text-gray-400 font-normal">· Room {t.room?.room_number}</span></div>
                  <div className="text-xs text-gray-500">Leaving on {formatDate(t.leaving_date!)}</div>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${t.daysLeft <= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                  {t.daysLeft > 0 ? `${t.daysLeft}d left` : t.daysLeft === 0 ? 'Leaving today' : `${Math.abs(t.daysLeft)}d overdue`}
                </span>
                <button onClick={() => handleMarkLeft(t.id, t.name)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition flex-shrink-0">
                  <LogOut className="w-3.5 h-3.5" /> Mark Left
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading tenants…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Tenant', 'Phone', 'Room/Bed', 'Rent', 'Deposit', 'Joining', 'KYC', 'Status', 'Remind', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-gray-400">No tenants found</td></tr>
                ) : filtered.map(t => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                          {t.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900">{t.name}</div>
                          <div className="text-xs text-gray-400">{t.email || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{t.phone}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">
                        {t.room ? `Room ${t.room.room_number}` : '—'}
                        {t.bed_label ? ` · ${t.bed_label}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-blue-700">{formatINR(t.monthly_rent)}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs">
                        <span className="font-bold text-gray-900">{formatINR(t.deposit_paid)}</span>
                        <span className="text-gray-400"> / {formatINR(t.deposit_amount)}</span>
                      </div>
                      {t.deposit_paid < t.deposit_amount && (
                        <span className="text-xs text-yellow-600 font-semibold">₹{(t.deposit_amount - t.deposit_paid).toLocaleString('en-IN')} pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{formatDate(t.joining_date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${KYC[t.aadhaar_status]}`}>ID</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${KYC[t.pan_status]}`}>PAN</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${BADGE[t.status]}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <a href={whatsappLink(t.phone, rentReminderMsg(t.name, t.monthly_rent, t.property?.name ?? 'PG'))}
                          target="_blank" rel="noreferrer"
                          className="p-1.5 bg-green-100 hover:bg-green-200 rounded-lg transition" title="WhatsApp">
                          <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                        </a>
                        <a href={`tel:${t.phone}`}
                          className="p-1.5 bg-blue-100 hover:bg-blue-200 rounded-lg transition" title="Call">
                          <Phone className="w-3.5 h-3.5 text-blue-600" />
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => setViewTenant(t)} className="p-1.5 hover:bg-gray-100 rounded-lg transition"><Eye className="w-3.5 h-3.5 text-gray-500" /></button>
                        <button onClick={() => {
                          setEditTenant(t)
                          setEditForm({
                            name: t.name, phone: t.phone, email: t.email ?? '',
                            emergency_contact: t.emergency_contact ?? '',
                            monthly_rent: String(t.monthly_rent), deposit_amount: String(t.deposit_amount),
                            deposit_paid: String(t.deposit_paid), notice_period_days: String(t.notice_period_days),
                          })
                        }} className="p-1.5 hover:bg-gray-100 rounded-lg transition"><Pencil className="w-3.5 h-3.5 text-gray-500" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Tenant Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Add New Tenant</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto max-h-[75vh]">

              {/* Property selector (only when "all" is selected) */}
              {activeId === 'all' && (
                <div className="sm:col-span-2">
                  <label className="label">Property *</label>
                  <select value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))} className="input">
                    <option value="">Select Property</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Room</label>
                <select value={form.room_id} onChange={e => setForm(f => ({ ...f, room_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500">
                  <option value="">Select Room</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number} ({r.sharing_type})</option>)}
                </select>
                {rooms.length === 0 && <p className="text-xs text-gray-400 mt-1">No rooms yet — add one from the Rooms page first, or leave blank.</p>}
              </div>

              {[
                { key: 'name', label: 'Full Name', required: true },
                { key: 'phone', label: 'Mobile Number', required: true, type: 'tel' },
                { key: 'email', label: 'Email' },
                { key: 'emergency_contact', label: 'Emergency Contact', type: 'tel' },
                { key: 'bed_label', label: 'Bed Label (A/B/C)' },
                { key: 'joining_date', label: 'Joining Date', required: true, type: 'date' },
                { key: 'notice_period_days', label: 'Notice Period (days)' },
                { key: 'monthly_rent', label: 'Monthly Rent (₹)', required: true, type: 'number' },
                { key: 'deposit_amount', label: 'Total Deposit (₹)', type: 'number' },
                { key: 'deposit_paid', label: 'Deposit Paid Now (₹)', type: 'number' },
                { key: 'rent_paid_on_joining', label: 'Rent Paid on Joining (₹)', type: 'number' },
              ].map(({ key, label, required, type }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">{label}{required && ' *'}</label>
                  <input type={type ?? 'text'} value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                </div>
              ))}

              <div className="sm:col-span-2 -mt-1">
                <p className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
                  If the tenant paid some or all of their first month's rent at joining, enter it above — it will automatically show up as an approved payment in Payments and the Dashboard, not just sit in this form.
                </p>
              </div>

              <div className="sm:col-span-2 border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Tenant Login</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Username (auto = phone)</label>
                    <input disabled value={form.phone} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Set Password *</label>
                    <input type="password" value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Tenant can change later"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={handleAdd} disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Adding…' : 'Add Tenant & Create Login'}
              </button>
              <button onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* View Tenant Modal */}
      {viewTenant && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Tenant Details</h2>
              <button onClick={() => setViewTenant(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white font-bold flex items-center justify-center flex-shrink-0">
                  {viewTenant.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <div className="font-bold text-gray-900">{viewTenant.name}</div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${BADGE[viewTenant.status]}`}>{viewTenant.status.replace('_', ' ')}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Phone', viewTenant.phone],
                  ['Email', viewTenant.email || '—'],
                  ['Emergency Contact', viewTenant.emergency_contact || '—'],
                  ['Room / Bed', `${viewTenant.room ? 'Room ' + viewTenant.room.room_number : '—'}${viewTenant.bed_label ? ' · ' + viewTenant.bed_label : ''}`],
                  ['Joining Date', formatDate(viewTenant.joining_date)],
                  ['Notice Period', `${viewTenant.notice_period_days} days`],
                  ['Monthly Rent', formatINR(viewTenant.monthly_rent)],
                  ['Deposit', `${formatINR(viewTenant.deposit_paid)} / ${formatINR(viewTenant.deposit_amount)}`],
                  ['Aadhaar', viewTenant.aadhaar_status],
                  ['PAN', viewTenant.pan_status],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{label}</div>
                    <div className="text-gray-800 font-medium capitalize">{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button onClick={() => setViewTenant(null)} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tenant Modal */}
      {editTenant && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Edit {editTenant.name}</h2>
              <button onClick={() => setEditTenant(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              {[
                { key: 'name', label: 'Full Name', span: 2 },
                { key: 'phone', label: 'Mobile Number', type: 'tel' },
                { key: 'email', label: 'Email' },
                { key: 'emergency_contact', label: 'Emergency Contact', type: 'tel' },
                { key: 'notice_period_days', label: 'Notice Period (days)', type: 'number' },
                { key: 'monthly_rent', label: 'Monthly Rent (₹)', type: 'number' },
                { key: 'deposit_amount', label: 'Total Deposit (₹)', type: 'number' },
                { key: 'deposit_paid', label: 'Deposit Paid (₹)', type: 'number' },
              ].map(({ key, label, type, span }) => (
                <div key={key} className={span === 2 ? 'col-span-2' : ''}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">{label}</label>
                  <input type={type ?? 'text'} value={(editForm as any)[key]}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={handleEditSave} disabled={editSaving}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                {editSaving && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
              </button>
              <button onClick={() => setEditTenant(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
