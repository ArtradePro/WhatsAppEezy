import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    // Body may contain is_available or unit_price
    return NextResponse.json({
      success: true,
      productId: id,
      updated: body,
      metaSynced: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Product update failed' },
      { status: 500 }
    );
  }
}
