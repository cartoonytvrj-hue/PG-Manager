'use client'
import { useState, useEffect } from 'react'
import { Menu, Search, Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props { onMenuClick: () => void; adminEmail: string }

export default function AdminTopbar({ onMenuClick, adminEmail }: Props) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [pendingOwners, setPendingOwners] = useState(0)

  useEffect(() => {
    async function load() {
      const sb = createClient()
      const { count } = await sb.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'pg_owner').eq('is_active', false)
      setPendingOwners(count ?? 0)
    }
    load()
  }, [])

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center px-4 lg:px-6 gap-3 sticky top-0 z-30">
      <button onClick={onMenuClick} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 lg:hidden">
        <Menu className="w-5 h-5" />
      </button>

      <h1 className="text-lg font-bold text-gray-900 hidden sm:block">Dashboard</h1>

      {/* Search */}
      <div className="relative flex-1 max-w-md ml-4 hidden md:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input placeholder="Search owners, properties…"
          className="w-full pl-9 pr-16 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 transition" />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 bg-white border border-gray-200 rounded px-1.5 py-0.5">Ctrl+/</kbd>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="relative">
          <button onClick={() => setNotifOpen(o => !o)} className="relative p-2.5 rounded-full hover:bg-gray-100 transition text-gray-500">
            <Bell className="w-5 h-5" />
            {pendingOwners > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white">
                {pendingOwners}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 font-bold text-sm text-gray-900">Notifications</div>
                {pendingOwners === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-gray-400">No alerts right now</div>
                ) : (
                  <div className="px-4 py-3 text-xs text-gray-600">{pendingOwners} deactivated owner account{pendingOwners > 1 ? 's' : ''} on file.</div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5 pl-3 border-l border-gray-100">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            SA
          </div>
          <div className="hidden sm:block">
            <div className="text-xs font-semibold text-gray-900 leading-tight">Super Admin</div>
            <div className="text-[10px] text-gray-400 truncate max-w-[140px]">{adminEmail}</div>
          </div>
        </div>
      </div>
    </header>
  )
}
