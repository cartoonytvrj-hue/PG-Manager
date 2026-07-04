'use client'
import { useEffect, useState } from 'react'
import { useProperty } from '@/components/shared/PropertyContext'
import { getDashboardStats, getTenants, getPayments, getComplaints, getExpenses } from '@/lib/supabase/queries'
import { formatINR, computeDueDate, getOverdueDays, whatsappLink, rentReminderMsg } from '@/lib/utils'
import {
  BedDouble, IndianRupee, AlertTriangle, Users, Home, Wallet, Zap,
  Plus, UserPlus, Receipt, Megaphone, ShieldAlert
} from 'lucide-react'
import Link from 'next/link'
import type { DashboardStats, Tenant } from '@/types'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

function StatCard({ icon: Icon, label, value, sub, subColor, bg, iconColor }: {
  icon: React.ElementType; label: string; value: string; sub?: string; subColor?: string; bg: string; iconColor: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${bg}`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div className="text-xs text-gray-500 font-medium">{label}</div>
      <div className="text-2xl font-extrabold text-gray-900 mt-0.5">{value}</div>
      {sub && <div className={`text-xs font-semibold mt-1 ${subColor ?? 'text-gray-400'}`}>{sub}</div>}
    </div>
  )
}

const QUICK_ACTIONS = [
  { label: 'Add Room', icon: BedDouble, href: '/rooms', bg: 'bg-blue-50', color: 'text-blue-600' },
  { label: 'Add Tenant', icon: UserPlus, href: '/tenants', bg: 'bg-green-50', color: 'text-green-600' },
  { label: 'Collect Rent', icon: IndianRupee, href: '/payments', bg: 'bg-amber-50', color: 'text-amber-600' },
  { label: 'Add Expense', icon: Receipt, href: '/expenses', bg: 'bg-red-50', color: 'text-red-600' },
  { label: 'Raise Complaint', icon: ShieldAlert, href: '/complaints', bg: 'bg-purple-50', color: 'text-purple-600' },
]

export default function DashboardPage() {
  const { activeId, active, properties } = useProperty()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [pendingTenants, setPendingTenants] = useState<(Tenant & { dueDate: string; overdueDays: number; amountDue: number })[]>([])
  const [recentPayments, setRecentPayments] = useState<any[]>([])
  const [recentComplaints, setRecentComplaints] = useState<any[]>([])
  const [electricityTotal, setElectricityTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const propIds = activeId === 'all' ? properties.map(p => p.id) : [activeId]

        if (propIds.length === 0) {
          // No properties at all yet — show a fully zeroed dashboard instead of getting stuck loading.
          setStats({ totalRooms: 0, totalBeds: 0, occupiedBeds: 0, vacantBeds: 0, monthlyRevenue: 0, pendingRent: 0, openComplaints: 0, totalTenants: 0 })
          setPendingTenants([])
          setRecentPayments([])
          setRecentComplaints([])
          setElectricityTotal(0)
          setLoading(false)
          return
        }

        const [statsResults, allTenants, allPayments, allComplaints, allExpenses] = await Promise.all([
          Promise.all(propIds.map(getDashboardStats)),
          Promise.all(propIds.map(getTenants)).then(r => r.flat()),
          Promise.all(propIds.map(getPayments)).then(r => r.flat()),
          Promise.all(propIds.map(getComplaints)).then(r => r.flat()),
          Promise.all(propIds.map(getExpenses)).then(r => r.flat()),
        ])

        const agg: DashboardStats = statsResults.reduce((acc, s) => ({
          totalRooms: acc.totalRooms + s.totalRooms,
          totalBeds: acc.totalBeds + s.totalBeds,
          occupiedBeds: acc.occupiedBeds + s.occupiedBeds,
          vacantBeds: acc.vacantBeds + s.vacantBeds,
          monthlyRevenue: acc.monthlyRevenue + s.monthlyRevenue,
          pendingRent: acc.pendingRent + s.pendingRent,
          openComplaints: acc.openComplaints + s.openComplaints,
          totalTenants: acc.totalTenants + s.totalTenants,
        }), { totalRooms: 0, totalBeds: 0, occupiedBeds: 0, vacantBeds: 0, monthlyRevenue: 0, pendingRent: 0, openComplaints: 0, totalTenants: 0 })
        setStats(agg)

        buildPending(allTenants, allPayments)

        setRecentPayments(
          allPayments.filter(p => p.approval_status === 'approved')
            .sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())
            .slice(0, 5)
        )
        setRecentComplaints(
          allComplaints.filter(c => c.status !== 'resolved')
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 4)
        )
        const thisMonth = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })
        setElectricityTotal(
          allExpenses.filter(e => e.category === 'Electricity' && new Date(e.expense_date).toLocaleString('en-IN', { month: 'long', year: 'numeric' }) === thisMonth)
            .reduce((s, e) => s + e.amount, 0)
        )
      } catch {
        // Even on error, fall back to a zeroed dashboard rather than an infinite spinner or blank page.
        setStats(prev => prev ?? { totalRooms: 0, totalBeds: 0, occupiedBeds: 0, vacantBeds: 0, monthlyRevenue: 0, pendingRent: 0, openComplaints: 0, totalTenants: 0 })
      }
      setLoading(false)
    }

    // Correctly accounts for partial payments: a tenant who has paid ₹4,000 of an
    // ₹8,000 rent still owes ₹4,000, and should still appear here (with the smaller amount).
    function buildPending(tenants: Tenant[], payments: any[]) {
      const today = new Date()
      const thisMonth = today.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
      const approvedThisMonth = payments.filter(
        p => p.for_month === thisMonth && p.approval_status === 'approved' && p.type === 'rent'
      )
      const pending = tenants
        .filter(t => t.status === 'active')
        .map(t => {
          const receivedThisMonth = approvedThisMonth
            .filter(p => p.tenant_id === t.id)
            .reduce((s, p) => s + p.amount_received, 0)
          const amountDue = Math.max(0, t.monthly_rent - receivedThisMonth)
          return {
            ...t,
            amountDue,
            dueDate: computeDueDate(t.joining_date, today).toISOString().slice(0, 10),
            overdueDays: getOverdueDays(t.joining_date, today),
          }
        })
        .filter(t => t.amountDue > 0)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      setPendingTenants(pending)
    }

    load()
  }, [activeId, properties])

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-gray-200 rounded-xl animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-32 bg-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    </div>
  )

  const s = stats ?? { totalRooms: 0, totalBeds: 0, occupiedBeds: 0, vacantBeds: 0, monthlyRevenue: 0, pendingRent: 0, openComplaints: 0, totalTenants: 0 }
  const occupancyPct = Math.round((s.occupiedBeds / (s.totalBeds || 1)) * 100)
  const totalExpected = s.monthlyRevenue + s.pendingRent
  const collectedPct = totalExpected > 0 ? Math.round((s.monthlyRevenue / totalExpected) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-extrabold text-gray-900">Welcome back! 👋</h1>
        <p className="text-sm text-gray-500 mt-1">
          {activeId === 'all' ? `Here's what's happening across your ${properties.length} properties.` : `Here's what's happening at ${active?.name}.`}
        </p>
      </div>

      {/* Stat Cards — always rendered, zeroed out when there's no data yet */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard icon={Home} label="Total Rooms" value={String(s.totalRooms)} sub="All Rooms" bg="bg-blue-50" iconColor="text-blue-600" />
        <StatCard icon={Users} label="Occupied Beds" value={`${s.occupiedBeds} / ${s.totalBeds}`} sub={`${occupancyPct}% Occupied`} subColor="text-green-600" bg="bg-purple-50" iconColor="text-purple-600" />
        <StatCard icon={BedDouble} label="Vacant Beds" value={String(s.vacantBeds)} sub={`${s.totalBeds > 0 ? 100 - occupancyPct : 0}% Vacant`} subColor="text-amber-600" bg="bg-amber-50" iconColor="text-amber-600" />
        <StatCard icon={IndianRupee} label="Rent Collected" value={formatINR(s.monthlyRevenue)} sub="This Month" bg="bg-indigo-50" iconColor="text-indigo-600" />
        <StatCard icon={Wallet} label="Pending Rent" value={formatINR(s.pendingRent)} sub={`${pendingTenants.length} tenants`} subColor="text-red-500" bg="bg-red-50" iconColor="text-red-500" />
      </div>

      {/* Rent Collection donut + Recent Payments + Pending Rent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Donut */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="font-bold text-sm text-gray-900 mb-4">Rent Collection Overview</div>
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              <PieChart width={130} height={130}>
                <Pie data={[{ value: collectedPct }, { value: 100 - collectedPct }]}
                  cx={65} cy={65} innerRadius={44} outerRadius={62} startAngle={90} endAngle={-270} dataKey="value">
                  <Cell fill="#10B981" />
                  <Cell fill="#FEE2E2" />
                </Pie>
              </PieChart>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-xl font-extrabold text-gray-900">{formatINR(s.monthlyRevenue)}</div>
                <div className="text-[10px] text-gray-400">Collected</div>
              </div>
            </div>
            <div className="space-y-2.5 flex-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                <div className="text-xs">
                  <div className="font-semibold text-gray-800">Collected</div>
                  <div className="text-gray-400">{formatINR(s.monthlyRevenue)} ({collectedPct}%)</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0" />
                <div className="text-xs">
                  <div className="font-semibold text-gray-800">Pending</div>
                  <div className="text-gray-400">{formatINR(s.pendingRent)} ({100 - collectedPct}%)</div>
                </div>
              </div>
              <div className="pt-2 border-t border-gray-100 text-xs text-gray-400">
                Total Expected: <span className="font-bold text-gray-700">{formatINR(totalExpected)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Payments */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-sm text-gray-900">Recent Payments</div>
            <Link href="/payments" className="text-xs font-semibold text-blue-600 hover:underline">View All</Link>
          </div>
          <div className="space-y-1">
            {recentPayments.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-xs">No payments yet</div>
            ) : recentPayments.map(p => (
              <div key={p.id} className="flex items-center gap-2.5 py-2 border-b border-gray-50 last:border-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                  {p.tenant?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-900 truncate">{p.tenant?.name}</div>
                  <div className="text-[11px] text-gray-400">Room {p.tenant?.room?.room_number}</div>
                </div>
                <div className="text-xs font-bold text-gray-900">{formatINR(p.amount_received)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending Rent */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-sm text-gray-900">Pending Rent</div>
            <span className="text-[10px] bg-red-50 text-red-600 font-bold px-2 py-0.5 rounded-full">{pendingTenants.length}</span>
          </div>
          <div className="space-y-1">
            {pendingTenants.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-xs">🎉 All caught up!</div>
            ) : pendingTenants.slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center gap-2.5 py-2 border-b border-gray-50 last:border-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-amber-500 text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                  {t.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-900 truncate">{t.name}</div>
                  <div className="text-[11px] text-gray-400">Room {t.room?.room_number} · Due {t.dueDate}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-bold text-gray-900">{formatINR(t.amountDue)}</div>
                  <a href={whatsappLink(t.phone, rentReminderMsg(t.name, t.amountDue, active?.name ?? 'PG'))}
                    target="_blank" rel="noreferrer" className="text-[10px] font-bold text-green-600 hover:underline">Remind</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Electricity + Complaints */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-500" />
            </div>
            <div className="font-bold text-sm text-gray-900">Electricity — This Month</div>
          </div>
          <div className="text-2xl font-extrabold text-gray-900 mt-2">{formatINR(electricityTotal)}</div>
          <div className="text-xs text-gray-400">Total charges recorded across expenses</div>
          <Link href="/expenses" className="inline-block mt-3 text-xs font-semibold text-blue-600 hover:underline">Manage Expenses →</Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-sm text-gray-900">Recent Complaints</div>
            <Link href="/complaints" className="text-xs font-semibold text-blue-600 hover:underline">View All</Link>
          </div>
          {recentComplaints.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-xs">No open complaints 🎉</div>
          ) : (
            <div className="space-y-1">
              {recentComplaints.map(c => (
                <div key={c.id} className="flex items-center gap-2.5 py-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.priority === 'high' ? 'bg-red-500' : c.priority === 'medium' ? 'bg-amber-500' : 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-800 truncate">{c.issue_type} — Room {c.room?.room_number ?? '—'}</div>
                    <div className="text-[11px] text-gray-400 truncate">{c.tenant?.name ?? 'Unknown tenant'}</div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {c.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="font-bold text-sm text-gray-900 mb-4">Quick Actions</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {QUICK_ACTIONS.map(a => (
            <Link key={a.label} href={a.href}
              className="flex flex-col items-center justify-center gap-2 py-5 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition text-center">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${a.bg}`}>
                <a.icon className={`w-5 h-5 ${a.color}`} />
              </div>
              <span className="text-xs font-semibold text-gray-700">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
