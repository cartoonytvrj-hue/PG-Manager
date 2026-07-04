'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, Loader2, Building2, Users, UserCheck, TrendingUp, MoreHorizontal } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import Link from 'next/link'

export default function AdminPage() {
  const [owners, setOwners] = useState<any[]>([])
  const [totalProperties, setTotalProperties] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' })

  async function load() {
    setLoading(true)
    const sb = createClient()
    const [ownersRes, propsRes] = await Promise.all([
      sb.from('profiles').select('*, properties(id, name, created_at)').eq('role', 'pg_owner').order('created_at', { ascending: false }),
      sb.from('properties').select('*', { count: 'exact', head: true }),
    ])
    setOwners(ownersRes.data ?? [])
    setTotalProperties(propsRes.count ?? 0)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function addOwner() {
    if (!form.full_name || !form.email || !form.password) { toast.error('Fill all required fields'); return }
    setSaving(true)
    try {
      const sb = createClient()
      const { data, error } = await sb.auth.signUp({
        email: form.email, password: form.password,
        options: { data: { full_name: form.full_name, role: 'pg_owner' } },
      })
      if (error) throw error
      if (form.phone && data.user) {
        await sb.from('profiles').update({ phone: form.phone }).eq('id', data.user.id)
      }
      toast.success('Owner account created for ' + form.full_name + '!')
      setModal(false)
      setForm({ full_name: '', email: '', phone: '', password: '' })
      load()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  async function toggleActive(ownerId: string, current: boolean) {
    const sb = createClient()
    await sb.from('profiles').update({ is_active: !current }).eq('id', ownerId)
    toast.success(current ? 'Owner deactivated' : 'Owner reactivated')
    load()
  }

  const activeOwners = owners.filter(o => o.is_active).length
  const thisMonthOwners = owners.filter(o => {
    const d = new Date(o.created_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Greeting */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">Welcome back, Super Admin! 👋</h1>
          <p className="text-sm text-gray-500 mt-1">Here's what's happening with your platform today.</p>
        </div>
        <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold transition">
          <Plus className="w-4 h-4" /> Add PG Owner
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { icon: UserCheck, label: 'Total Owners', value: owners.length, sub: '+' + thisMonthOwners + ' this month', color: 'bg-purple-50 text-purple-600' },
          { icon: Building2, label: 'Total Properties', value: totalProperties, sub: 'Across all owners', color: 'bg-blue-50 text-blue-600' },
          { icon: Users, label: 'Active Owners', value: activeOwners, sub: (owners.length - activeOwners) + ' deactivated', color: 'bg-green-50 text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.color}`}><s.icon className="w-5 h-5" /></div>
            <div className="text-2xl font-extrabold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            <div className="text-[11px] text-gray-400 mt-1">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Owners */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="font-bold text-sm text-gray-900">Recent Owners</div>
            <Link href="/admin/owners" className="text-xs font-semibold text-purple-600 hover:underline">View All</Link>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…</div>
          ) : owners.length === 0 ? (
            <div className="text-center py-14 text-gray-400 text-sm">No PG owners yet. Click "Add PG Owner" to create the first one.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Owner', 'Email', 'Properties', 'Status', ''].map(h => (
                      <th key={h} className="px-5 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {owners.slice(0, 6).map(o => (
                    <tr key={o.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white font-bold text-[11px] flex items-center justify-center flex-shrink-0">
                            {o.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-semibold text-gray-900">{o.full_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{o.email}</td>
                      <td className="px-5 py-3 text-gray-700 font-semibold">{o.properties?.length ?? 0}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${o.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {o.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => toggleActive(o.id, o.is_active)}
                          className="text-xs font-semibold px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition">
                          {o.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Owner growth donut */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="font-bold text-sm text-gray-900 mb-1">Owner Status</div>
          <div className="text-xs text-gray-400 mb-4">Active vs deactivated</div>
          <div className="flex flex-col items-center">
            <div className="relative">
              <ResponsiveContainer width={150} height={150}>
                <PieChart>
                  <Pie data={[{ value: activeOwners || 1 }, { value: owners.length - activeOwners }]}
                    cx="50%" cy="50%" innerRadius={48} outerRadius={68} startAngle={90} endAngle={-270} dataKey="value">
                    <Cell fill="#7C3AED" />
                    <Cell fill="#FEE2E2" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-xl font-extrabold text-gray-900">{owners.length}</div>
                <div className="text-[10px] text-gray-400">Total</div>
              </div>
            </div>
            <div className="w-full space-y-2 mt-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600 flex-shrink-0" />
                <span className="text-xs text-gray-600 flex-1">Active</span>
                <span className="text-xs font-bold text-gray-900">{activeOwners}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-300 flex-shrink-0" />
                <span className="text-xs text-gray-600 flex-1">Deactivated</span>
                <span className="text-xs font-bold text-gray-900">{owners.length - activeOwners}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Subscriptions / Billing — placeholder until billing is built */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <div className="font-bold text-sm text-gray-900">Subscriptions & Billing</div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Coming Soon</span>
        </div>
        <p className="text-xs text-gray-400 mt-2 max-w-xl">
          Plan tiers, subscription tracking, and revenue reporting aren't wired up yet — this app doesn't currently charge PG owners.
          When billing is added (e.g. via Razorpay), this panel will show active/expiring subscriptions and plan distribution, matching the rest of this dashboard's style.
        </p>
      </div>

      {/* Add Owner Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold">Add PG Owner</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl font-bold">×</button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { key: 'full_name', label: 'Full Name *', placeholder: 'e.g. Suresh Kumar' },
                { key: 'email', label: 'Email Address *', placeholder: 'owner@email.com', type: 'email' },
                { key: 'phone', label: 'Phone Number', placeholder: '9876543210', type: 'tel' },
                { key: 'password', label: 'Temporary Password *', placeholder: 'Min 6 characters', type: 'password' },
              ].map(({ key, label, placeholder, type }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">{label}</label>
                  <input type={type ?? 'text'} placeholder={placeholder} value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-500" />
                </div>
              ))}
              <p className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
                Share these credentials with the owner. They can change their password after first login via Settings.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={addOwner} disabled={saving}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Create Owner Account
              </button>
              <button onClick={() => setModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
