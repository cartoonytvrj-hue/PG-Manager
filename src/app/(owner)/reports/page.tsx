'use client'
import { useEffect, useState, useCallback } from 'react'
import { useProperty } from '@/components/shared/PropertyContext'
import { getPayments, getExpenses, getTenants, getRooms, getDashboardStats } from '@/lib/supabase/queries'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Download, Loader2 } from 'lucide-react'
import { formatINR } from '@/lib/utils'
import { toast } from 'sonner'

function lastNMonths(n: number) {
  const months = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      key: d.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
      label: d.toLocaleString('en-IN', { month: 'short' }),
    })
  }
  return months
}

export default function ReportsPage() {
  const { active, activeId, properties } = useProperty()
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<{ month: string; revenue: number; expenses: number; profit: number }[]>([])
  const [summary, setSummary] = useState({
    monthlyRevenue: 0, occupancyPct: 0, totalExpenses: 0, netProfit: 0, pendingRent: 0, activeTenants: 0,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const propIds = activeId === 'all' ? properties.map(p => p.id) : (activeId ? [activeId] : [])

      if (propIds.length === 0) {
        // No properties yet — show a fully zeroed report instead of hanging or hiding sections.
        setChartData(lastNMonths(6).map(m => ({ month: m.label, revenue: 0, expenses: 0, profit: 0 })))
        setSummary({ monthlyRevenue: 0, occupancyPct: 0, totalExpenses: 0, netProfit: 0, pendingRent: 0, activeTenants: 0 })
        setLoading(false)
        return
      }

      const [allPayments, allExpenses, allTenants, allRooms, statsResults] = await Promise.all([
        Promise.all(propIds.map(getPayments)).then(r => r.flat()),
        Promise.all(propIds.map(getExpenses)).then(r => r.flat()),
        Promise.all(propIds.map(getTenants)).then(r => r.flat()),
        Promise.all(propIds.map(getRooms)).then(r => r.flat()),
        Promise.all(propIds.map(getDashboardStats)),
      ])

      const months = lastNMonths(6)
      const data = months.map(m => {
        const revenue = allPayments
          .filter(p => p.for_month === m.key && p.approval_status === 'approved')
          .reduce((s, p) => s + p.amount_received, 0)
        const expenses = allExpenses
          .filter(e => new Date(e.expense_date).toLocaleString('en-IN', { month: 'long', year: 'numeric' }) === m.key)
          .reduce((s, e) => s + e.amount, 0)
        return { month: m.label, revenue, expenses, profit: revenue - expenses }
      })
      setChartData(data)

      const thisMonthKey = lastNMonths(1)[0].key
      const monthlyRevenue = allPayments.filter(p => p.for_month === thisMonthKey && p.approval_status === 'approved').reduce((s, p) => s + p.amount_received, 0)
      const totalExpenses = allExpenses
        .filter(e => new Date(e.expense_date).toLocaleString('en-IN', { month: 'long', year: 'numeric' }) === thisMonthKey)
        .reduce((s, e) => s + e.amount, 0)

      const totalBeds = statsResults.reduce((s, r) => s + r.totalBeds, 0)
      const occupiedBeds = statsResults.reduce((s, r) => s + r.occupiedBeds, 0)
      const pendingRent = statsResults.reduce((s, r) => s + r.pendingRent, 0)

      setSummary({
        monthlyRevenue,
        occupancyPct: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
        totalExpenses,
        netProfit: monthlyRevenue - totalExpenses,
        pendingRent,
        activeTenants: allTenants.filter(t => t.status === 'active').length,
      })
    } catch {
      setChartData(lastNMonths(6).map(m => ({ month: m.label, revenue: 0, expenses: 0, profit: 0 })))
    }
    setLoading(false)
  }, [activeId, properties])

  useEffect(() => { load() }, [load])

  const cards = [
    { label: 'Monthly Revenue', value: formatINR(summary.monthlyRevenue), color: 'text-green-600' },
    { label: 'Occupancy Rate', value: `${summary.occupancyPct}%`, color: 'text-blue-600' },
    { label: 'Total Expenses', value: formatINR(summary.totalExpenses), color: 'text-red-600' },
    { label: 'Net Profit', value: formatINR(summary.netProfit), color: summary.netProfit >= 0 ? 'text-purple-600' : 'text-red-600' },
    { label: 'Pending Rent', value: formatINR(summary.pendingRent), color: 'text-yellow-600' },
    { label: 'Active Tenants', value: String(summary.activeTenants), color: 'text-gray-700' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">{activeId === 'all' ? 'All properties' : active?.name}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => toast.success('PDF downloading…')} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition">
            <Download className="w-4 h-4" /> PDF
          </button>
          <button onClick={() => toast.success('Excel downloading…')} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition">
            <Download className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>

      {/* Summary cards — always rendered, zeroed when there's no data */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(r => (
          <div key={r.label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{r.label}</div>
            <div className={`text-2xl font-extrabold mt-1 ${r.color}`}>{r.value}</div>
          </div>
        ))}
      </div>

      {/* Chart — always rendered, bars just sit at zero height when there's no data */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="font-bold text-sm text-gray-900 mb-1">Revenue, Expenses & Profit — 6 Months</div>
        <div className="text-xs text-gray-400 mb-4">
          {loading ? 'Loading…' : chartData.every(d => d.revenue === 0 && d.expenses === 0) ? 'No payments or expenses recorded yet' : 'Based on your recorded payments and expenses'}
        </div>
        {loading ? (
          <div className="h-[220px] flex items-center justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={2}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v / 1000}k`} />
              <Tooltip formatter={(v: number) => formatINR(v)} />
              <Bar dataKey="revenue" fill="#2563EB" radius={[4, 4, 0, 0]} name="Revenue" />
              <Bar dataKey="expenses" fill="#EF444466" radius={[4, 4, 0, 0]} name="Expenses" />
              <Bar dataKey="profit" fill="#10B981" radius={[4, 4, 0, 0]} name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Report download tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {['Monthly Revenue Report', 'Occupancy Report', 'Pending Rent Report', 'Expense Report', 'Profit & Loss', 'Tenant Summary'].map(r => (
          <button key={r} onClick={() => toast.success(r + ' downloading…')} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between shadow-sm hover:shadow-md transition text-left">
            <div>
              <div className="text-sm font-semibold text-gray-800">{r}</div>
              <div className="text-xs text-gray-400">PDF & Excel</div>
            </div>
            <Download className="w-4 h-4 text-blue-500 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
