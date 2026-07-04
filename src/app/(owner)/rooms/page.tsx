'use client'
import { useEffect, useState, useCallback } from 'react'
import { useProperty } from '@/components/shared/PropertyContext'
import { getRooms, addRoom, updateRoom, deleteRoom } from '@/lib/supabase/queries'
import { formatINR } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Trash2, Pencil, Loader2, BedDouble } from 'lucide-react'
import type { Room } from '@/types'

const STATUS_COLOR: Record<string, string> = {
  full: 'bg-red-100 text-red-700',
  partial: 'bg-yellow-100 text-yellow-700',
  vacant: 'bg-green-100 text-green-700',
}

const EMPTY_FORM = {
  property_id: '', room_number: '', floor: '1',
  sharing_type: '2 Sharing', total_beds: '2', monthly_rent: '', notes: '',
}

export default function RoomsPage() {
  const { activeId, properties } = useProperty()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ids = activeId === 'all' ? properties.map(p => p.id) : [activeId]
      const data = (await Promise.all(ids.map(getRooms))).flat()
      setRooms(data)
    } catch { toast.error('Failed to load rooms') }
    setLoading(false)
  }, [activeId, properties])

  useEffect(() => { load() }, [load])

  function openAddModal() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModal(true)
  }

  function openEditModal(room: Room) {
    setEditingId(room.id)
    setForm({
      property_id: room.property_id,
      room_number: room.room_number,
      floor: String(room.floor),
      sharing_type: room.sharing_type,
      total_beds: String(room.total_beds),
      monthly_rent: String(room.monthly_rent),
      notes: room.notes ?? '',
    })
    setModal(true)
  }

  async function handleSave() {
    if (!form.room_number || !form.monthly_rent) { toast.error('Fill required fields'); return }
    const resolvedPropertyId = activeId !== 'all' ? activeId : form.property_id
    if (!resolvedPropertyId) { toast.error('Select a property for this room'); return }
    setSaving(true)
    try {
      const payload = {
        property_id: resolvedPropertyId,
        room_number: form.room_number,
        floor: Number(form.floor),
        sharing_type: form.sharing_type as Room['sharing_type'],
        total_beds: Number(form.total_beds),
        monthly_rent: Number(form.monthly_rent),
        notes: form.notes,
      }
      if (editingId) {
        await updateRoom(editingId, payload)
        toast.success('Room updated!')
      } else {
        await addRoom(payload)
        toast.success('Room added!')
      }
      setModal(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      load()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this room? This cannot be undone.')) return
    try { await deleteRoom(id); toast.success('Room deleted'); load() }
    catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">Rooms</h1>
          <p className="text-sm text-gray-500">{rooms.length} rooms · {rooms.reduce((s, r) => s + r.total_beds, 0)} total beds</p>
        </div>
        <button onClick={openAddModal} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">
          <Plus className="w-4 h-4" /> Add Room
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="w-6 h-6 animate-spin mr-2" />Loading rooms…</div>
      ) : rooms.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
          No rooms yet. Click "Add Room" to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {rooms.map(room => {
            const status = room.total_beds === 0 ? 'vacant' : 'partial'
            return (
              <div key={room.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-xl font-extrabold text-gray-900">Room {room.room_number}</div>
                    <div className="text-xs text-gray-400 mt-0.5">Floor {room.floor} · {room.sharing_type}</div>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLOR[status]}`}>
                    {room.total_beds} Beds
                  </span>
                </div>
                <div className="flex gap-1.5 mb-4">
                  {Array.from({ length: room.total_beds }).map((_, i) => (
                    <div key={i} className="flex-1 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                      <BedDouble className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-blue-600">{formatINR(room.monthly_rent)}/mo</span>
                </div>
                {room.notes && <p className="text-xs text-gray-400 mb-3 truncate">{room.notes}</p>}
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <button onClick={() => openEditModal(room)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs font-semibold text-gray-600 transition">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button onClick={() => handleDelete(room.id)} className="p-1.5 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-500 transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold">{editingId ? 'Edit Room' : 'Add Room'}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl font-bold">×</button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              {activeId === 'all' && !editingId && (
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Property *</label>
                  <select value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500">
                    <option value="">Select Property</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              {[
                { key: 'room_number', label: 'Room Number *', placeholder: '101' },
                { key: 'floor', label: 'Floor', placeholder: '1', type: 'number' },
                { key: 'monthly_rent', label: 'Monthly Rent (₹) *', placeholder: '8000', type: 'number' },
                { key: 'total_beds', label: 'Total Beds *', placeholder: '2', type: 'number' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">{f.label}</label>
                  <input type={f.type ?? 'text'} placeholder={f.placeholder} value={(form as any)[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 block mb-1">Sharing Type</label>
                <div className="flex gap-2">
                  {['1 Sharing', '2 Sharing', '3 Sharing', '4 Sharing'].map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, sharing_type: t, total_beds: t.split(' ')[0] }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${form.sharing_type === t ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 block mb-1">Notes</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="AC, attached bathroom…" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} {editingId ? 'Save Changes' : 'Add Room'}
              </button>
              <button onClick={() => setModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold transition hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
