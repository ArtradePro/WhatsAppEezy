import { NextRequest, NextResponse } from 'next/server';
import { authenticatedBackendToken, AccessError } from './auth/access';
export async function forwardLocalBackend(request: NextRequest, pathname: string) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ success: false, message: 'Cross-origin administration is disabled.' }, { status: 403 });
  try {
    const access = await authenticatedBackendToken();
    const backend = new URL(process.env.BACKEND_API_URL || 'http://localhost:3000');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname);
    if (backend.protocol !== 'https:' && !(process.env.NODE_ENV === 'development' && backend.protocol === 'http:' && local)) {
      return NextResponse.json({ success: false, message: 'The business service requires a secure connection.' }, { status: 503 });
    }
    const upstream = await fetch(new URL(pathname, backend.origin), {
      method: request.method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + access.token },
      ...(request.method === 'GET' ? {} : { body: await request.text() }),
      cache: 'no-store', signal: AbortSignal.timeout(8000), redirect: 'error',
    });
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    return NextResponse.json({ success: false, message: 'The business service is unavailable. Nothing was confirmed as saved.' }, { status: 503 });
  }
}
