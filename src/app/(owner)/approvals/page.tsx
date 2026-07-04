'use client'
import { useEffect, useState, useCallback } from 'react'
import { useProperty } from '@/components/shared/PropertyContext'
import { getPendingApprovals, approvePayment, rejectPayment, approveTenant, rejectTenant, getRooms, updateTenant } from '@/lib/supabase/queries'
import { createClient } from '@/lib/supabase/client'
import { formatINR } from '@/lib/utils'
import { toast } from 'sonner'
import { Check, X, QrCode, Copy, Loader2, Link2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import type { Room } from '@/types'

export default function ApprovalsPage() {
  const { activeId, active, properties } = useProperty()
  const [tab, setTab] = useState<'payments' | 'tenants'>('payments')
  const [payments, setPayments] = useState<any[]>([])
  const [pendingTenants, setPendingTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [qrModal, setQrModal] = useState(false)
  const [approveModal, setApproveModal] = useState<any>(null)
  const [newPassword, setNewPassword] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [selectedBedLabel, setSelectedBedLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://yourapp.vercel.app'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const sb = createClient()
      const ids = activeId === 'all' ? properties.map(p => p.id) : [activeId]
      const [pList, tList] = await Promise.all([
        Promise.all(ids.map(id => getPendingApprovals(id))).then(r => r.flat()),
        Promise.all(ids.map(id =>
          sb.from('tenants').select('*, property:properties(name)').eq('property_id', id).eq('status', 'pending_approval').then(r => r.data ?? [])
        )).then(r => r.flat()),
      ])
      // Attach each pending tenant's own "rent paid at joining" claim (if any),
      // so the owner sees it right on the request card instead of hunting for it.
      const tListWithRent = tList.map((t: any) => ({
        ...t,
        rentClaim: pList.find((p: any) => p.tenant_id === t.id && p.type === 'rent') ?? null,
      }))
      setPayments(pList)
      setPendingTenants(tListWithRent)
    } catch { toast.error('Failed to load') }
    setLoading(false)
  }, [activeId, properties])

  useEffect(() => { load() }, [load])

  async function handleApprovePayment(id: string) {
    try { await approvePayment(id); toast.success('Payment approved!'); load() }
    catch (e: any) { toast.error(e.message) }
  }

  async function handleRejectPayment(id: string) {
    try { await rejectPayment(id); toast.error('Payment rejected'); load() }
    catch (e: any) { toast.error(e.message) }
  }

  async function openApproveModal(tenant: any) {
    setApproveModal(tenant)
    setSelectedRoomId('')
    setSelectedBedLabel('')
    try {
      const roomList = await getRooms(tenant.property_id)
      setRooms(roomList)
    } catch {
      setRooms([])
    }
  }

  async function handleApproveTenant() {
    if (!newPassword || newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (!selectedRoomId) { toast.error('Select a room for this tenant before approving'); return }
    setSaving(true)
    try {
      await approveTenant(approveModal.id, newPassword, approveModal)
      // Room/bed assignment happens as a separate update so a failure here
      // doesn't undo the approval itself — the tenant is still active either way.
      try {
        await updateTenant(approveModal.id, { room_id: selectedRoomId, bed_label: selectedBedLabel || null })
      } catch (roomErr: any) {
        toast.error(`Approved, but couldn't assign the room automatically: ${roomErr.message}. Assign it manually from the Tenants page.`)
      }
      toast.success(`${approveModal.name} approved & login created!`)
      setApproveModal(null)
      setNewPassword('')
      setSelectedRoomId('')
      setSelectedBedLabel('')
      load()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  async function handleRejectTenant(t: any) {
    if (!confirm(`Reject ${t.name}'s request? This cannot be undone.`)) return
    try {
      await rejectTenant(t.id)
      toast.error(`Rejected ${t.name}'s request`)
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  const joinLink = active ? `${appUrl}/join/${active.qr_slug}` : ''

  function openQrModal() {
    if (!active) {
      toast.error('Select a specific property from the switcher above first — each PG has its own unique join link.')
      return
    }
    setQrModal(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">Approvals</h1>
          <p className="text-sm text-gray-500">Review payment claims and new tenant requests</p>
        </div>
        <button onClick={openQrModal} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold transition">
          <QrCode className="w-4 h-4" /> Tenant Join Link / QR
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {[['payments', 'Payment Claims'], ['tenants', 'New Tenant Requests']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v as any)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition ${tab === v ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            {l}
            {v === 'payments' && payments.length > 0 && <span className="bg-yellow-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{payments.length}</span>}
            {v === 'tenants' && pendingTenants.length > 0 && <span className="bg-purple-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{pendingTenants.length}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…</div>
      ) : tab === 'payments' ? (
        payments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
            <Check className="w-10 h-10 mx-auto mb-3 text-green-400" />
            <div className="font-semibold">No pending payment claims</div>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex items-start justify-between gap-4 flex-wrap">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                    {p.tenant?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{p.tenant?.name} <span className="text-gray-400 font-normal text-xs">· Room {p.tenant?.room?.room_number}</span></div>
                    <div className="text-xs text-gray-500 mt-1">{p.for_month} · <span className="capitalize">{p.method?.replace('_', ' ')}</span></div>
                    {p.tenant_note && <div className="text-xs text-gray-400 italic mt-1">"{p.tenant_note}"</div>}
                    <div className="text-xs text-gray-400 mt-1">Submitted {new Date(p.created_at).toLocaleString('en-IN')}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="text-xl font-extrabold text-gray-900">{formatINR(p.amount_received)}</div>
                  <div className="flex gap-2">
                    <button onClick={() => handleApprovePayment(p.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-semibold transition">
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => handleRejectPayment(p.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl text-xs font-semibold transition">
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        pendingTenants.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
            <Check className="w-10 h-10 mx-auto mb-3 text-green-400" />
            <div className="font-semibold">No pending tenant requests</div>
            <p className="text-xs mt-2">Share the join link/QR with new tenants to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingTenants.map(t => (
              <div key={t.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                      {t.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900">{t.name}</div>
                      <div className="text-xs text-gray-500 mt-1">{t.phone} · <span className="font-semibold text-purple-600">{t.property?.name}</span></div>
                      <div className="text-xs text-gray-400 mt-1">Joining {t.joining_date}</div>
                      <div className="flex gap-4 mt-3 flex-wrap">
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase font-bold">Rent</div>
                          <div className="text-sm font-bold text-gray-900">{formatINR(t.monthly_rent)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase font-bold">Deposit Paid</div>
                          <div className="text-sm font-bold text-gray-900">{formatINR(t.deposit_paid)} <span className="text-gray-400 font-normal">/ {formatINR(t.deposit_amount)}</span></div>
                          {t.deposit_paid < t.deposit_amount && (
                            <div className="text-xs text-yellow-600 font-semibold">₹{(t.deposit_amount - t.deposit_paid).toLocaleString('en-IN')} pending</div>
                          )}
                        </div>
                        {t.rentClaim && (
                          <div>
                            <div className="text-[10px] text-gray-400 uppercase font-bold">Rent Claimed Paid</div>
                            <div className="text-sm font-bold text-gray-900">{formatINR(t.rentClaim.amount_received)}</div>
                            <div className="text-xs text-purple-600 font-semibold">Also review in Payment Claims tab</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openApproveModal(t)} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-semibold transition">
                      <Check className="w-3.5 h-3.5" /> Approve & Create Login
                    </button>
                    <button onClick={() => handleRejectTenant(t)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl text-xs font-semibold transition">
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* QR / Join Link Modal */}
      {qrModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold">Tenant Join Link</h2>
              <button onClick={() => setQrModal(false)} className="text-gray-400 text-xl font-bold">×</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-500">Share this link or QR code with new tenants. They fill in their details, it lands in "New Tenant Requests" for your approval.</p>
              <div className="flex justify-center p-4 bg-gray-50 rounded-xl">
                <QRCodeSVG value={joinLink} size={160} />
              </div>
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                <Link2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-600 flex-1 truncate font-mono">{joinLink}</span>
                <button onClick={() => { navigator.clipboard.writeText(joinLink); toast.success('Copied!') }}
                  className="p-1.5 hover:bg-gray-200 rounded-lg transition">
                  <Copy className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>
              <a href={`https://wa.me/?text=${encodeURIComponent(`Join ${active?.name ?? 'our PG'} — fill your details here: ${joinLink}`)}`}
                target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition">
                Share via WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Approve Tenant Modal */}
      {approveModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold">Approve {approveModal.name}</h2>
              <button onClick={() => setApproveModal(null)} className="text-gray-400 text-xl font-bold">×</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-500">Set a login password for this tenant. Their username will be their mobile number: <strong>{approveModal.phone}</strong></p>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Assign Room *</label>
                <select value={selectedRoomId} onChange={e => setSelectedRoomId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500">
                  <option value="">Select a room</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number} ({r.sharing_type})</option>)}
                </select>
                {rooms.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No rooms found for this property — add one from the Rooms page first.</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Bed Label (optional)</label>
                <input value={selectedBedLabel} onChange={e => setSelectedBedLabel(e.target.value)} placeholder="e.g. A, B, C"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Set Password *</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 6 characters" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={handleApproveTenant} disabled={saving} className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Approve & Create Login
              </button>
              <button onClick={() => setApproveModal(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold transition hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
