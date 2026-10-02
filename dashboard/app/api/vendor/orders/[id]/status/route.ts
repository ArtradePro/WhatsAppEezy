import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { status } = body;

    const aggregatorApi = process.env.NEXT_PUBLIC_AGGREGATOR_API_URL || 'http://localhost:3000';

    // Broadcast event to WhatsApp webhook state machine
    try {
      if (status === 'dispatched' || status === 'delivered') {
        const replyId = status === 'dispatched' ? 'dispatch_loaded' : 'dispatch_delivered';
        await fetch(`${aggregatorApi}/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            object: 'whatsapp_business_account',
            entry: [
              {
                id: 'waba_id_01',
                changes: [
                  {
                    field: 'messages',
                    value: {
                      messaging_product: 'whatsapp',
                      metadata: { display_phone_number: '27829876543', phone_number_id: '109928237' },
                      messages: [
                        {
                          from: '27829876543',
                          id: `wamid_${Date.now()}`,
                          timestamp: Math.floor(Date.now() / 1000).toString(),
                          type: 'interactive',
                          interactive: {
                            type: 'button_reply',
                            button_reply: { id: replyId, title: replyId },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          }),
        });
      }
    } catch (err) {
      // Backend aggregator service may not be running locally; ignore error
    }

    return NextResponse.json({
      success: true,
      orderId: id,
      status,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Status update failed' },
      { status: 500 }
    );
  }
}
