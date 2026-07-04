'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateProperty, addCollector, getCollectors, deleteCollector } from '@/lib/supabase/queries'
import { useProperty } from '@/components/shared/PropertyContext'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, QrCode, Download } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { upiPaymentLink } from '@/lib/utils'

export default function SettingsPage() {
  const { active, refresh } = useProperty()
  const [profile, setProfile] = useState<any>(null)
  const [collectors, setCollectors] = useState<any[]>([])
  const [newCollector, setNewCollector] = useState('')
  const [saving, setSaving] = useState(false)
  const [pgForm, setPgForm] = useState({ name: '', address: '', city: '', upi_id: '' })
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' })

  useEffect(() => {
    async function load() {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: p } = await sb.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)
    }
    load()
  }, [])

  useEffect(() => {
    if (active) {
      setPgForm({ name: active.name, address: active.address ?? '', city: active.city ?? '', upi_id: active.upi_id ?? '' })
      getCollectors(active.id).then(setCollectors)
    }
  }, [active])

  async function savePg() {
    if (!active) { toast.error('Select a specific property first'); return }
    setSaving(true)
    try {
      await updateProperty(active.id, pgForm)
      toast.success('PG details saved!'); refresh()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  async function handleAddCollector() {
    if (!newCollector.trim() || !active) { toast.error('Enter name and select a property'); return }
    try {
      await addCollector(active.id, newCollector.trim())
      toast.success('Collector added!')
      setNewCollector('')
      getCollectors(active.id).then(setCollectors)
    } catch (e: any) { toast.error(e.message) }
  }

  async function handleDeleteCollector(id: string) {
    if (!active) return
    if (!confirm('Remove this collector?')) return
    try {
      await deleteCollector(id)
      toast.success('Collector removed')
      getCollectors(active.id).then(setCollectors)
    } catch (e: any) { toast.error(e.message) }
  }

  async function changePassword() {
    if (pwForm.newPw !== pwForm.confirm) { toast.error('Passwords do not match'); return }
    if (pwForm.newPw.length < 6) { toast.error('Min 6 characters'); return }
    const sb = createClient()
    const { error } = await sb.auth.updateUser({ password: pwForm.newPw })
    if (error) { toast.error(error.message); return }
    toast.success('Password updated!')
    setPwForm({ current: '', newPw: '', confirm: '' })
  }

  const Field = ({ label, value, onChange, type = 'text' }: any) => (
    <div>
      <label className="text-xs font-semibold text-gray-600 block mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-2xl">
      <div><h1 className="text-xl font-extrabold text-gray-900">Settings</h1><p className="text-sm text-gray-500">Manage your PG and account details</p></div>

      {/* PG Details */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
        <div className="font-bold text-sm text-gray-900">PG Details {!active && <span className="text-xs text-yellow-600 font-normal ml-2">(select a specific property above)</span>}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="PG Name" value={pgForm.name} onChange={(v: string) => setPgForm(f => ({ ...f, name: v }))} />
          <Field label="City" value={pgForm.city} onChange={(v: string) => setPgForm(f => ({ ...f, city: v }))} />
          <div className="sm:col-span-2"><Field label="Address" value={pgForm.address} onChange={(v: string) => setPgForm(f => ({ ...f, address: v }))} /></div>
          <Field label="UPI ID" value={pgForm.upi_id} onChange={(v: string) => setPgForm(f => ({ ...f, upi_id: v }))} />
        </div>
        <button onClick={savePg} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save PG Details
        </button>
      </div>

      {/* UPI QR — free, no payment gateway. Tenants scan with any UPI app and pay you directly. */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <QrCode className="w-4 h-4 text-blue-600" />
          <div className="font-bold text-sm text-gray-900">UPI QR Code</div>
        </div>
        {!pgForm.upi_id ? (
          <p className="text-xs text-gray-400">Add your UPI ID above and save to generate a scannable QR code. Money goes straight to your bank account — this app never touches the payment, so there's no fee.</p>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div id="upi-qr-code" className="p-4 bg-white border border-gray-100 rounded-2xl">
              <QRCodeSVG value={upiPaymentLink(pgForm.upi_id, pgForm.name || 'PG Owner', 1, 'PG Rent Payment')} size={160} />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-400">UPI ID</div>
              <div className="text-sm font-bold text-gray-900 mb-3">{pgForm.upi_id}</div>
              <p className="text-xs text-gray-500 leading-relaxed mb-3">
                Tenants can scan this to pay via GPay, PhonePe, Paytm, or any UPI app. This QR has a placeholder amount of ₹1 — when generating a receipt for a specific tenant's rent, the exact amount is filled in automatically.
              </p>
              <button onClick={() => {
                const svg = document.querySelector('#upi-qr-code svg')
                if (!svg) return
                const svgData = new XMLSerializer().serializeToString(svg)
                const canvas = document.createElement('canvas')
                canvas.width = 400; canvas.height = 400
                const ctx = canvas.getContext('2d')
                const img = new Image()
                img.onload = () => {
                  ctx!.fillStyle = '#fff'; ctx!.fillRect(0, 0, 400, 400)
                  ctx!.drawImage(img, 20, 20, 360, 360)
                  const a = document.createElement('a')
                  a.download = 'upi-qr.png'
                  a.href = canvas.toDataURL('image/png')
                  a.click()
                }
                img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
              }} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline">
                <Download className="w-3.5 h-3.5" /> Download QR
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Collectors */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
        <div className="font-bold text-sm text-gray-900">Rent Collectors</div>
        <p className="text-xs text-gray-400">People who can collect rent (Owner 1, Owner 2, Warden, etc.). Selected when recording a payment.</p>
        <div className="space-y-2">
          {collectors.map(c => (
            <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
              <span className="text-sm text-gray-800">{c.name}</span>
              <button onClick={() => handleDeleteCollector(c.id)} className="text-gray-400 hover:text-red-500 transition p-1"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newCollector} onChange={e => setNewCollector(e.target.value)} placeholder="e.g. Owner — Suresh Kumar" className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
          <button onClick={handleAddCollector} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
        <div className="font-bold text-sm text-gray-900">Change Password</div>
        <div className="space-y-3">
          <Field label="New Password" value={pwForm.newPw} onChange={(v: string) => setPwForm(f => ({ ...f, newPw: v }))} type="password" />
          <Field label="Confirm Password" value={pwForm.confirm} onChange={(v: string) => setPwForm(f => ({ ...f, confirm: v }))} type="password" />
        </div>
        <button onClick={changePassword} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">Update Password</button>
      </div>

      {/* Logout */}
      <div className="bg-white rounded-2xl border border-red-100 p-5 shadow-sm">
        <div className="font-bold text-sm text-red-600 mb-3">Danger Zone</div>
        <button onClick={async () => { const sb = createClient(); await sb.auth.signOut(); window.location.href = '/login' }}
          className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl text-sm font-semibold transition">
          Logout
        </button>
      </div>
    </div>
  )
}
