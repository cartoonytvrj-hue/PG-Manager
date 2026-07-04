'use client'
import { useEffect, useState, useCallback } from 'react'
import { useProperty } from '@/components/shared/PropertyContext'
import { getComplaints, addComplaint, resolveComplaint, updateComplaint } from '@/lib/supabase/queries'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Check, Loader2 } from 'lucide-react'

const PRIORITY_COLOR: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
}
const STATUS_COLOR: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
}

export default function ComplaintsPage() {
  const { activeId, properties } = useProperty()
  const [complaints, setComplaints] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ property_id: '', issue_type: 'Plumbing', description: '', priority: 'medium', assigned_to: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ids = activeId === 'all' ? properties.map(p => p.id) : [activeId]
      const data = (await Promise.all(ids.map(getComplaints))).flat()
      setComplaints(data)
    } catch { toast.error('Failed to load') }
    setLoading(false)
  }, [activeId, properties])

  useEffect(() => { load() }, [load])

  const filtered = filter === 'all' ? complaints : complaints.filter(c => c.status === filter)

  async function handleAdd() {
    if (!form.issue_type) { toast.error('Select issue type'); return }
    const resolvedPropertyId = activeId !== 'all' ? activeId : form.property_id
    if (!resolvedPropertyId) { toast.error('Select a property for this complaint'); return }
    setSaving(true)
    try {
      await addComplaint({ property_id: resolvedPropertyId, issue_type: form.issue_type, description: form.description, priority: form.priority as any, assigned_to: form.assigned_to })
      toast.success('Complaint added!'); setModal(false); load()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">Complaints</h1>
          <p className="text-sm text-gray-500">{complaints.filter(c => c.status !== 'resolved').length} open · {complaints.filter(c => c.status === 'resolved').length} resolved</p>
        </div>
        <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">
          <Plus className="w-4 h-4" /> Add Complaint
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {['all', 'open', 'in_progress', 'resolved'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${filter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      {loading ? <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…</div> : (
        <div className="space-y-3">
          {filtered.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-bold text-gray-900 text-sm">{c.issue_type}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${PRIORITY_COLOR[c.priority]}`}>{c.priority}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>{c.status.replace('_', ' ')}</span>
                  </div>
                  {c.description && <p className="text-sm text-gray-600 mb-2">{c.description}</p>}
                  <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
                    {c.tenant && <span>👤 {c.tenant.name}</span>}
                    {c.room && <span>🚪 Room {c.room.room_number}</span>}
                    <span>📅 {formatDate(c.created_at)}</span>
                    {c.assigned_to && <span className="text-blue-600 font-semibold">→ {c.assigned_to}</span>}
                  </div>
                </div>
                {c.status !== 'resolved' && (
                  <button onClick={async () => { await resolveComplaint(c.id); toast.success('Marked resolved!'); load() }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded-xl text-xs font-semibold transition flex-shrink-0">
                    <Check className="w-3.5 h-3.5" /> Resolve
                  </button>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">No complaints found</div>}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold">Add Complaint</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl font-bold">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Issue Type</label>
                <select value={form.issue_type} onChange={e => setForm(f => ({ ...f, issue_type: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500">
                  {['Plumbing', 'Electrical', 'WiFi', 'Cleaning', 'AC', 'Maintenance', 'Other'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Priority</label>
                <div className="flex gap-2">
                  {['low', 'medium', 'high'].map(p => (
                    <button key={p} onClick={() => setForm(f => ({ ...f, priority: p }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition capitalize ${form.priority === p ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{p}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Description</label>
                <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the issue…" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Assign To</label>
                <input value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} placeholder="e.g. Plumber Raju" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={handleAdd} disabled={saving} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Submit
              </button>
              <button onClick={() => setModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold transition hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
