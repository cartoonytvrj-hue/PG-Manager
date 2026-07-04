'use client'
import { useState } from 'react'
import { Building2, Layers, ChevronDown, Plus, Loader2 } from 'lucide-react'
import { useProperty } from './PropertyContext'
import { cn } from '@/lib/utils'
import { addProperty } from '@/lib/supabase/queries'
import { toast } from 'sonner'

// Floating "Select Property" card — mirrors the reference dashboard's
// top-right property switcher, complete with per-property occupancy %.
export default function PropertySwitcherCard({ occupancy }: { occupancy: Record<string, number> }) {
  const { properties, activeId, setActiveId, active, refresh } = useProperty()
  const [open, setOpen] = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', city: '', address: '', upi_id: '' })

  async function handleAddProperty() {
    if (!form.name.trim()) { toast.error('Enter a property name'); return }
    setSaving(true)
    try {
      const created = await addProperty(form)
      toast.success(created.name + ' added!')
      setAddModal(false)
      setForm({ name: '', city: '', address: '', upi_id: '' })
      await refresh()
      setActiveId(created.id)
      setOpen(false)
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2.5 px-3.5 py-2 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition min-w-[200px]">
        <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-blue-600" />
        </div>
        <div className="flex-1 text-left">
          <div className="text-[10px] text-gray-400 font-medium">Select Property</div>
          <div className="text-sm font-bold text-gray-900 leading-tight">
            {activeId === 'all' ? 'All Properties' : active?.name ?? 'Select PG'}
          </div>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform flex-shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
            {/* All Properties */}
            <button onClick={() => { setActiveId('all'); setOpen(false) }}
              className={cn('w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 text-left',
                activeId === 'all' && 'bg-blue-50')}>
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Layers className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900">All Properties</div>
                <div className="text-xs text-gray-400">View all properties summary</div>
              </div>
            </button>

            <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-t border-gray-100">My Properties</div>

            {properties.length === 0 && (
              <div className="px-4 py-3 text-xs text-gray-400">No properties yet — add your first one below</div>
            )}
            {properties.map(p => {
              const occ = occupancy[p.id]
              return (
                <button key={p.id} onClick={() => { setActiveId(p.id); setOpen(false) }}
                  className={cn('w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0',
                    activeId === p.id && 'bg-blue-50')}>
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{p.name}{p.city ? ' - ' + p.city : ''}</div>
                    <div className={cn('text-xs font-medium', occ !== undefined && occ >= 90 ? 'text-green-600' : occ !== undefined && occ < 50 ? 'text-red-500' : 'text-gray-400')}>
                      {occ !== undefined ? `${occ}% Occupied` : '—'}
                    </div>
                  </div>
                  {activeId === p.id && <div className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />}
                </button>
              )
            })}
            <div className="border-t border-gray-100">
              <button onClick={() => { setAddModal(true); setOpen(false) }}
                className="w-full flex items-center gap-2 px-4 py-3 text-blue-600 text-sm font-semibold hover:bg-blue-50 transition">
                <Plus className="w-4 h-4" /> Add New Property
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add Property Modal */}
      {addModal && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold">Add Property</h2>
              <button onClick={() => setAddModal(false)} className="text-gray-400 text-xl font-bold">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">PG Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sunrise PG" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">City</label>
                <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="e.g. Bangalore" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Address</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Full address" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">UPI ID (optional)</label>
                <input value={form.upi_id} onChange={e => setForm(f => ({ ...f, upi_id: e.target.value }))} placeholder="yourname@upi" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={handleAddProperty} disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Add Property
              </button>
              <button onClick={() => setAddModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
