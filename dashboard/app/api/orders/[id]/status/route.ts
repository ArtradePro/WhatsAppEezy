import { NextRequest, NextResponse } from 'next/server';
import { forwardLocalBackend } from '../../../../../lib/local-backend';
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  let body: { status?: string };
  try { body = await request.clone().json(); } catch { return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 }); }
  if (!['dispatched', 'delivered'].includes(body.status || '')) return NextResponse.json({ success: false, message: 'Invalid dispatch status' }, { status: 400 });
  return forwardLocalBackend(request, '/api/vendor/orders/' + encodeURIComponent(params.id) + '/status');
}
