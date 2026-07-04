import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Public routes — always accessible without login
  const publicPaths = ['/login', '/join']
  const isPublic = publicPaths.some(p => pathname.startsWith(p))

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && pathname === '/login') {
    // Already logged in — bounce to the right dashboard based on role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'super_admin') return NextResponse.redirect(new URL('/admin', request.url))
    if (profile?.role === 'tenant') return NextResponse.redirect(new URL('/portal', request.url))
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Protect admin routes
  if (pathname.startsWith('/admin')) {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user!.id).single()
    if (profile?.role !== 'super_admin')
      return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Protect tenant portal — only tenants allowed, redirect owners to their own login flow
  if (pathname.startsWith('/portal')) {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user!.id).single()
    if (profile?.role !== 'tenant')
      return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Protect owner routes — tenants and unrelated roles get sent to their own portal
  const ownerPaths = ['/dashboard', '/rooms', '/tenants', '/payments', '/approvals', '/complaints', '/expenses', '/reports', '/settings']
  if (ownerPaths.some(p => pathname.startsWith(p))) {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user!.id).single()
    if (profile?.role === 'tenant') return NextResponse.redirect(new URL('/portal', request.url))
    if (profile?.role === 'super_admin') return NextResponse.redirect(new URL('/admin', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
