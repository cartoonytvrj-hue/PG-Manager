'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  LayoutDashboard, Users, Building2, CreditCard, Layers,
  Wallet, BarChart3, LifeBuoy, ScrollText, Settings, LogOut, Crown, X
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, ready: true },
  { href: '/admin', label: 'Owners', icon: Users, ready: false },
  { href: '/admin', label: 'Properties', icon: Building2, ready: false },
  { href: '/admin', label: 'Subscriptions', icon: CreditCard, ready: false },
  { href: '/admin', label: 'Plans', icon: Layers, ready: false },
  { href: '/admin', label: 'Payments', icon: Wallet, ready: false },
  { href: '/admin', label: 'Reports', icon: BarChart3, ready: false },
  { href: '/admin', label: 'Support Tickets', icon: LifeBuoy, ready: false },
  { href: '/admin', label: 'System Logs', icon: ScrollText, ready: false },
  { href: '/admin', label: 'Settings', icon: Settings, ready: false },
]

interface Props { open: boolean; onClose: () => void; adminEmail: string }

export default function AdminSidebar({ open, onClose, adminEmail }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    const sb = createClient()
    await sb.auth.signOut()
    toast.success('Logged out')
    router.push('/login')
  }

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onClose} />}

      <aside className={cn(
        'fixed top-0 left-0 bottom-0 w-64 bg-[#12081F] z-50 flex flex-col transition-transform duration-200 shadow-xl',
        open ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center flex-shrink-0">
              <Crown className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <div className="text-sm font-extrabold text-white leading-tight">PG Manager</div>
              <div className="text-[10px] text-purple-300/70">Super Admin</div>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-white/50 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map((item, i) => {
            const active = item.ready && (pathname === item.href)
            if (!item.ready) {
              return (
                <div key={item.label + i}
                  title="Coming soon"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-purple-100/30 cursor-not-allowed select-none">
                  <item.icon className="w-4 h-4 flex-shrink-0 text-purple-300/25" />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[8px] bg-white/5 text-purple-200/40 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">Soon</span>
                </div>
              )
            }
            return (
              <Link key={item.href} href={item.href} onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group',
                  active
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                    : 'text-purple-100/60 hover:bg-white/5 hover:text-white'
                )}>
                <item.icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-white' : 'text-purple-300/50 group-hover:text-purple-200')} />
                <span className="flex-1">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Current Plan card */}
        <div className="p-3">
          <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl p-4 relative overflow-hidden">
            <div className="text-[10px] font-semibold text-purple-100/80 uppercase tracking-wide mb-1">Current Plan</div>
            <div className="text-lg font-extrabold text-white mb-2">Enterprise</div>
            <div className="text-[11px] text-purple-100/70 mb-3">Valid till 31 Dec 2025</div>
            <button className="w-full bg-white text-purple-700 text-xs font-bold py-2 rounded-xl hover:bg-purple-50 transition">
              Manage Plan
            </button>
          </div>
        </div>

        {/* User + Logout */}
        <div className="p-3 border-t border-white/10 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            SA
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate">Super Admin</div>
            <div className="text-[10px] text-purple-300/60 truncate">{adminEmail}</div>
          </div>
          <button onClick={logout} className="text-purple-300/60 hover:text-red-400 transition-colors p-1">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  )
}
