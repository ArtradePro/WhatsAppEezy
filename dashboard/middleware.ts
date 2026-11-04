import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { authConfiguration } from './lib/auth/config';
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === '/api/auth/logout' || pathname === '/login' || pathname === '/website' || pathname.startsWith('/website/') || pathname === '/access-denied') return NextResponse.next();
  const isApi = pathname.startsWith('/api/');
  const config = authConfiguration();
  if (!config) return isApi
    ? NextResponse.json({ success: false, message: 'Sign-in setup is not complete.' }, { status: 503 })
    : NextResponse.redirect(new URL('/login', request.url));
  let response = NextResponse.next({ request });
  const client = createServerClient(config.url, config.key, {
    cookieOptions: { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values: Array<{ name: string; value: string; options: CookieOptions }>) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      const denied = isApi ? NextResponse.json({ success: false, message: 'Please sign in.' }, { status: 401 }) : NextResponse.redirect(new URL('/login', request.url));
      response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie));
      return denied;
    }
  } catch {
    return NextResponse.json({ success: false, message: 'Sign-in service is unavailable.' }, { status: 503 });
  }
  // Legacy financial/AI endpoints do not yet have scoped adapters. Keep them unavailable.
  if (isApi && !/^\/api\/(?:auth\/logout|vendor\/orders|(?:vendor\/)?orders\/[^/]+\/status|v1\/vendors\/[^/]+)$/.test(pathname)) {
    return NextResponse.json({ success: false, message: 'This action is awaiting company permission controls.' }, { status: 503 });
  }
  if (!isApi && pathname !== '/') return NextResponse.redirect(new URL('/', request.url));
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:png|jpg|jpeg|svg|webp|ico|css|js)$).*)'] };
