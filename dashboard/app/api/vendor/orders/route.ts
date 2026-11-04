import { NextRequest, NextResponse } from 'next/server';
import { forwardLocalBackend } from '../../../../lib/local-backend';
export async function GET(request: NextRequest) {
  const vendor = request.nextUrl.searchParams.get('vendor_id');
  if (!vendor || !/^[a-zA-Z0-9-]+$/.test(vendor)) return NextResponse.json({ success: false, message: 'Choose a company.' }, { status: 400 });
  return forwardLocalBackend(request, '/api/vendor/orders?vendor_id=' + encodeURIComponent(vendor));
}
