'use client'
import { useEffect, useState, useCallback } from 'react'
import { useProperty } from '@/components/shared/PropertyContext'
import { getExpenses, addExpense, deleteExpense } from '@/lib/supabase/queries'
import { formatINR, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2 } from 'lucide-react'

const CATEGORIES = ['Electricity', 'Water', 'WiFi', 'Cleaning', 'Maintenance', 'Salary', 'Other']
const CAT_COLOR: Record<string, string> = {
  Electricity: 'bg-yellow-100 text-yellow-700', Water: 'bg-blue-100 text-blue-700',
  WiFi: 'bg-purple-100 text-purple-700', Cleaning: 'bg-green-100 text-green-700',
  Maintenance: 'bg-red-100 text-red-700', Salary: 'bg-gray-100 text-gray-700', Other: 'bg-gray-100 text-gray-600',
}

export default function ExpensesPage() {
  const { activeId, properties } = useProperty()
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ property_id: '', category: 'Electricity', amount: '', notes: '', expense_date: new Date().toISOString().slice(0, 10) })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ids = activeId === 'all' ? properties.map(p => p.id) : [activeId]
      const data = (await Promise.all(ids.map(getExpenses))).flat().sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime())
      setExpenses(data)
    } catch { toast.error('Failed to load') }
    setLoading(false)
  }, [activeId, properties])

  useEffect(() => { load() }, [load])

  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const byCategory = CATEGORIES.map(cat => ({ cat, total: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0) })).filter(c => c.total > 0)

  async function handleAdd() {
    if (!form.amount) { toast.error('Enter amount'); return }
    const resolvedPropertyId = activeId !== 'all' ? activeId : form.property_id
    if (!resolvedPropertyId) { toast.error('Select a property for this expense'); return }
    setSaving(true)
    try {
      await addExpense({ property_id: resolvedPropertyId, category: form.category, amount: Number(form.amount), notes: form.notes, expense_date: form.expense_date })
      toast.success('Expense added!'); setModal(false); load()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500">Total: {formatINR(total)}</p>
        </div>
        <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">
          <Plus className="w-4 h-4" /> Add Expense
        </button>
      </div>

      {/* Breakdown */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="font-bold text-sm text-gray-900 mb-4">Breakdown by Category</div>
        <div className="space-y-3">
          {byCategory.map(({ cat, total: catTotal }) => (
            <div key={cat} className="flex items-center gap-3">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${CAT_COLOR[cat] ?? 'bg-gray-100 text-gray-600'}`}>{cat}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(catTotal / total) * 100}%` }} />
              </div>
              <span className="text-sm font-bold text-gray-900 min-w-[80px] text-right">{formatINR(catTotal)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                {['Category', 'Amount', 'Date', 'Notes', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {expenses.length === 0 ? <tr><td colSpan={5} className="text-center py-10 text-gray-400">No expenses yet</td></tr> : expenses.map(e => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3"><span className={`text-xs font-bold px-2.5 py-1 rounded-full ${CAT_COLOR[e.category] ?? 'bg-gray-100 text-gray-600'}`}>{e.category}</span></td>
                    <td className="px-4 py-3 font-bold text-gray-900">{formatINR(e.amount)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(e.expense_date)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{e.notes || '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={async () => { await deleteExpense(e.id); toast.success('Deleted'); load() }} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold">Add Expense</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 text-xl font-bold">×</button>
            </div>
            <div className="p-6 space-y-4">
              {activeId === 'all' && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Property *</label>
                  <select value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500">
                    <option value="">Select Property</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setForm(f => ({ ...f, category: cat }))}
                      className={`py-2 rounded-xl text-xs font-semibold border transition ${form.category === cat ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{cat}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Amount (₹) *</label>
                <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Date</label>
                <input type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Notes</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional description" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={handleAdd} disabled={saving} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Add Expense
              </button>
              <button onClick={() => setModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
