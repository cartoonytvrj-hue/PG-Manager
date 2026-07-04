'use client'
import { useState, useEffect } from 'react'
import { Menu, Bell, HelpCircle } from 'lucide-react'
import { useProperty } from './PropertyContext'
import PropertySwitcherCard from './PropertySwitcherCard'
import { getPendingApprovals, getRooms, getTenants } from '@/lib/supabase/queries'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'

interface Props {
  onMenuClick: () => void
  darkMode: boolean
  onToggleDark: () => void
  userName: string
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard', '/rooms': 'Rooms & Beds', '/tenants': 'Tenants',
  '/payments': 'Rent Collection', '/approvals': 'Approvals', '/complaints': 'Complaints',
  '/expenses': 'Expenses', '/reports': 'Reports & Analytics', '/settings': 'Settings',
}

export default function Topbar({ onMenuClick, userName }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const { properties } = useProperty()
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifItems, setNotifItems] = useState<{ label: string; sub: string }[]>([])
  const [occupancy, setOccupancy] = useState<Record<string, number>>({})

  const pageTitle = PAGE_TITLES[pathname] ?? 'Dashboard'

  useEffect(() => {
    async function loadTopbarData() {
      if (properties.length === 0) return
      try {
        const sb = createClient()
        const ids = properties.map(p => p.id)
        const [payments, pendingTenants] = await Promise.all([
          Promise.all(ids.map(id => getPendingApprovals(id))).then(r => r.flat()),
          Promise.all(ids.map(id =>
            sb.from('tenants').select('name, property:properties(name)').eq('property_id', id).eq('status', 'pending_approval').then(r => r.data ?? [])
          )).then(r => r.flat()),
        ])
        setNotifItems([
          ...payments.map((p: any) => ({ label: (p.tenant?.name ?? 'A tenant') + ' marked rent as paid', sub: 'Needs your approval' })),
          ...pendingTenants.map((t: any) => ({ label: t.name + ' wants to join ' + (t.property?.name ?? 'your PG'), sub: 'New tenant request' })),
        ])

        // Occupancy % per property, shown inside the Select Property dropdown
        const occ: Record<string, number> = {}
        for (const p of properties) {
          const [rooms, tenants] = await Promise.all([getRooms(p.id), getTenants(p.id)])
          const totalBeds = rooms.reduce((s, r) => s + r.total_beds, 0)
          const occupiedCount = tenants.filter(t => t.status === 'active').length
          occ[p.id] = totalBeds > 0 ? Math.round((occupiedCount / totalBeds) * 100) : 0
        }
        setOccupancy(occ)
      } catch { /* ignore */ }
    }
    loadTopbarData()
  }, [properties])

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center px-4 lg:px-6 gap-3 sticky top-0 z-30">
      {/* Hamburger (mobile) */}
      <button onClick={onMenuClick} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 lg:hidden">
        <Menu className="w-5 h-5" />
      </button>

      <h1 className="text-lg font-bold text-gray-900 hidden sm:block">{pageTitle}</h1>

      <div className="ml-auto flex items-center gap-3">
        {/* Select Property card */}
        <PropertySwitcherCard occupancy={occupancy} />

        {/* Notifications */}
        <div className="relative">
          <button onClick={() => setNotifOpen(o => !o)}
            className="relative p-2.5 rounded-full hover:bg-gray-100 transition text-gray-500">
            <Bell className="w-5 h-5" />
            {notifItems.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                {notifItems.length}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 font-bold text-sm text-gray-900">Notifications</div>
                {notifItems.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-gray-400">You're all caught up 🎉</div>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    {notifItems.map((n, i) => (
                      <button key={i} onClick={() => { setNotifOpen(false); router.push('/approvals') }}
                        className="w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition">
                        <div className="text-xs font-semibold text-gray-800">{n.label}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{n.sub}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Help */}
        <button className="p-2.5 rounded-full hover:bg-gray-100 transition text-gray-500 hidden sm:block">
          <HelpCircle className="w-5 h-5" />
        </button>

        {/* User */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-gray-100">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            {userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-bold text-gray-900 leading-tight">{userName}</div>
            <div className="text-[11px] text-gray-400">Owner</div>
          </div>
        </div>
      </div>
    </header>
  )
}
