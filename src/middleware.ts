import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If these aren't set in Vercel's Environment Variables, every request
  // would otherwise crash inside createServerClient with an opaque error.
  // Fail loudly with a clear message instead, and let public pages (like
  // the login screen itself) still render so the misconfiguration is
  // easy to diagnose rather than taking the whole site down silently.
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Set these in Vercel → Project Settings → Environment Variables, then redeploy.'
    )
    return supabaseResponse
  }

  // Every page under (owner), (admin), and the tenant portal independently
  // re-checks auth + role server-side (see their layout.tsx / page.tsx),
  // so middleware is a convenience redirect layer, not the only gate.
  // That means if anything here throws unexpectedly — an Edge/Node runtime
  // mismatch, a transient network error talking to Supabase, etc. — the
  // safe move is to let the request through and let the page-level check
  // handle it, rather than surfacing a hard 500 (MIDDLEWARE_INVOCATION_FAILED)
  // to the visitor.
  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
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

    // From here on, every remaining branch that checks a role needs a real
    // user — if we somehow got here without one (e.g. a public path that
    // still matched one of the role-gated prefixes below), just let the
    // request through rather than crashing on `user!.id`.
    if (!user) {
      return supabaseResponse
    }

    if (pathname === '/login') {
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
        .from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'super_admin')
        return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Protect tenant portal — only tenants allowed, redirect owners to their own login flow
    if (pathname.startsWith('/portal')) {
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'tenant')
        return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Protect owner routes — tenants and unrelated roles get sent to their own portal
    const ownerPaths = ['/dashboard', '/rooms', '/tenants', '/payments', '/approvals', '/complaints', '/expenses', '/reports', '/settings']
    if (ownerPaths.some(p => pathname.startsWith(p))) {
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role === 'tenant') return NextResponse.redirect(new URL('/portal', request.url))
      if (profile?.role === 'super_admin') return NextResponse.redirect(new URL('/admin', request.url))
    }

    return supabaseResponse
  } catch (err) {
    console.error('Middleware error — letting request through, page-level auth checks will still apply:', err)
    return supabaseResponse
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
  // @supabase/ssr pulls in @supabase/supabase-js, which touches Node-only
  // APIs (e.g. process.version) that the default Edge Runtime doesn't
  // support. That mismatch compiles fine but crashes at actual request
  // time on Vercel — exactly the MIDDLEWARE_INVOCATION_FAILED symptom.
  // Forcing the Node.js runtime here avoids it.
  runtime: 'nodejs',
}
