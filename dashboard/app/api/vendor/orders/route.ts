import { NextResponse } from 'next/server';
import { MOCK_ORDERS_LIST } from '@/lib/mock-data';

export async function GET() {
  return NextResponse.json({
    success: true,
    orders: MOCK_ORDERS_LIST,
  });
}
