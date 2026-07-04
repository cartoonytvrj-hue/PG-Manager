import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OwnerShell from '@/components/shared/OwnerShell'

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  if (!profile || profile.role === 'tenant') redirect('/portal')
  if (profile.role === 'super_admin') redirect('/admin')

  return <OwnerShell profile={profile}>{children}</OwnerShell>
}
