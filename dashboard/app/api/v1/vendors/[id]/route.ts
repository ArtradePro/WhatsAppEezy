import { NextRequest, NextResponse } from 'next/server';
import { forwardLocalBackend } from '../../../../../lib/local-backend';
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[a-zA-Z0-9-]+$/.test(params.id)) return NextResponse.json({ success: false }, { status: 400 });
  return forwardLocalBackend(request, '/api/v1/vendors/' + encodeURIComponent(params.id));
}
