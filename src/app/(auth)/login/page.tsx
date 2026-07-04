'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Building2, Lock, User, LogIn } from 'lucide-react'

// ─── UNIFIED LOGIN ────────────────────────────────────────────────────────────
// One single login for everyone (Super Admin, PG Owner, Tenant).
// No role picker — the person just enters their username (email for
// owners/admins, mobile number for tenants) and password. We try both
// login styles under the hood and route based on whatever role comes back
// from the profile row after a successful sign-in.
export default function LoginPage() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!identifier || !password) { toast.error('Please fill all fields'); return }
    setLoading(true)
    const sb = createClient()

    const trimmed = identifier.trim()
    // Tenants log in with their mobile number, which maps to a synthetic
    // email under the hood. Owners/admins log in with a real email.
    // Heuristic: if it's all digits (10-15 chars), treat as a phone number.
    const isPhoneLike = /^\d{10,15}$/.test(trimmed.replace(/\s/g, ''))
    const email = isPhoneLike
      ? `${trimmed.replace(/\D/g, '')}@pgmanager.local`
      : trimmed

    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) { toast.error('Invalid username or password'); setLoading(false); return }

    const { data: profile, error: profileError } = await sb
      .from('profiles').select('role, is_active').eq('id', data.user.id).single()

    if (profileError || !profile) {
      toast.error('Account not found. Contact support.')
      await sb.auth.signOut(); setLoading(false); return
    }
    if (!profile.is_active) {
      toast.error('Your account has been deactivated. Contact the platform admin.')
      await sb.auth.signOut(); setLoading(false); return
    }

    // Route based on whatever role this account actually has —
    // this is what makes the single login page "just work" correctly.
    if (profile.role === 'super_admin') router.push('/admin')
    else if (profile.role === 'tenant') router.push('/portal')
    else router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg mb-3">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-extrabold text-gray-900">PG Manager</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 tracking-wide block mb-1.5">Email or Mobile Number</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={identifier} onChange={e => setIdentifier(e.target.value)}
                  placeholder="owner@email.com or 9876543210" onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">PG Owners use their email. Tenants use their registered mobile number.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 tracking-wide block mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password" onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
            </div>
            <button onClick={handleLogin} disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50 mt-2">
              <LogIn className="w-4 h-4" />
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Don't have login access? Contact your PG owner or the platform admin.
        </p>
      </div>
    </div>
  )
}
