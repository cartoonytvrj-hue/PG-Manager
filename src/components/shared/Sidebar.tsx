'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  LayoutDashboard, BedDouble, Users, IndianRupee, ShieldCheck,
  MessageSquareWarning, TrendingDown, BarChart3, Settings, LogOut,
  Home, X, Crown
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/rooms', label: 'Rooms & Beds', icon: BedDouble },
  { href: '/tenants', label: 'Tenants', icon: Users },
  { href: '/payments', label: 'Rent Collection', icon: IndianRupee },
  { href: '/approvals', label: 'Approvals', icon: ShieldCheck, badge: 'new' },
  { href: '/complaints', label: 'Complaints', icon: MessageSquareWarning },
  { href: '/expenses', label: 'Expenses', icon: TrendingDown },
  { href: '/reports', label: 'Reports & Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
]

interface Props { open: boolean; onClose: () => void; userName: string }

export default function Sidebar({ open, onClose, userName }: Props) {
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
      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onClose} />
      )}

      <aside className={cn(
        'fixed top-0 left-0 bottom-0 w-64 bg-[#0F1B3D] z-50 flex flex-col transition-transform duration-200 shadow-xl',
        open ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Home className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <div className="text-sm font-extrabold text-white leading-tight">PG Manager</div>
              <div className="text-[10px] text-blue-300/70">Owner Dashboard</div>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-white/50 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href} onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group',
                  active
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-blue-100/70 hover:bg-white/5 hover:text-white'
                )}>
                <item.icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-white' : 'text-blue-300/60 group-hover:text-blue-200')} />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="text-[9px] bg-amber-400 text-amber-950 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Upgrade card */}
        <div className="p-3">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-4 relative overflow-hidden">
            <Crown className="w-5 h-5 text-amber-300 mb-2" />
            <div className="text-xs font-bold text-white mb-1">Upgrade to Premium</div>
            <div className="text-[11px] text-blue-100/80 mb-3 leading-relaxed">Unlock advanced features and grow your business.</div>
            <button className="w-full bg-white text-blue-700 text-xs font-bold py-2 rounded-xl hover:bg-blue-50 transition">
              Upgrade Now
            </button>
          </div>
        </div>

        {/* User + Logout */}
        <div className="p-3 border-t border-white/10 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            {userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate">{userName}</div>
            <div className="text-[10px] text-blue-300/60">PG Owner</div>
          </div>
          <button onClick={logout} className="text-blue-300/60 hover:text-red-400 transition-colors p-1">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  )
}
