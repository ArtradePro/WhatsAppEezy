import { NextRequest, NextResponse } from 'next/server';
import { serverAuth } from '../../../../lib/auth/server';
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ success: false }, { status: 403 });
  const client = serverAuth();
  if (client) await client.auth.signOut({ scope: 'local' });
  return NextResponse.redirect(new URL('/login', request.url), 303);
}
