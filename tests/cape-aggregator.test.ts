import { describe, it, expect, beforeEach } from 'vitest';
import { conversationStateMachine } from '../src/services/state-machine/conversation-state-machine';
import { conversationSessionStore } from '../src/services/state-machine/conversation-session.store';
import { whatsAppClientService } from '../src/services/whatsapp/whatsapp-client.service';
import { postgresOrderRepository } from '../src/database/postgres-order.repository';
import { metricsService } from '../src/services/metrics/metrics.service';

describe('Cape Aggregator Supplies: Direct Yard Delivery Flow', () => {
  const customerWaId = '27821234567';
  const customerName = 'Cape Contractor';

  beforeEach(async () => {
    await conversationSessionStore.resetSession(customerWaId);
  });

  it('should successfully dispatch the Direct Yard Delivery interactive list message', async () => {
    const msgId = await whatsAppClientService.sendDirectYardDeliveryCategories(customerWaId);
    expect(msgId).toBeDefined();
    expect(msgId).toContain('wamid');
  });

  it('should dispatch native WhatsApp location_request_message interactive prompt', async () => {
    const msgId = await whatsAppClientService.sendLocationRequestMessage(customerWaId);
    expect(msgId).toBeDefined();
    expect(msgId).toContain('wamid');
  });

  it('should add Plaster & Building Sand tipper load to cart when cat_sand_stone is selected', async () => {
    await conversationSessionStore.setStage(customerWaId, 'BROWSING');

    await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
      from: customerWaId,
      id: 'wamid_cape_01',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'list_reply',
        list_reply: {
          id: 'cat_sand_stone',
          title: 'Plaster & Building Sand',
          description: 'Per m³ or 6m³ / 10m³ bulk tipper loads',
        },
      },
    });

    const session = await conversationSessionStore.getSession(customerWaId);
    expect(session.currentStage).toBe('CART_BUILDING');
    expect(session.cart.length).toBe(1);
    expect(session.cart[0].retailerId).toBe('SKU-SAND-PLASTER-6M3');
    expect(session.cart[0].name).toContain('Plaster Sand');
    expect(session.cart[0].unitPrice).toBe(1850.0);
  });

  it('should add Bricks & Pavers to cart when cat_bricks_blocks is selected', async () => {
    await conversationSessionStore.setStage(customerWaId, 'BROWSING');

    await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
      from: customerWaId,
      id: 'wamid_cape_02',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'list_reply',
        list_reply: {
          id: 'cat_bricks_blocks',
          title: 'Bricks & Pavers',
        },
      },
    });

    const session = await conversationSessionStore.getSession(customerWaId);
    expect(session.currentStage).toBe('CART_BUILDING');
    expect(session.cart[0].retailerId).toBe('SKU-BRICK-MAXI-1000');
    expect(session.cart[0].totalPrice).toBe(2450.0);
  });

  it('should add Bulk Cement pallet to cart when cat_cement is selected', async () => {
    await conversationSessionStore.setStage(customerWaId, 'BROWSING');

    await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
      from: customerWaId,
      id: 'wamid_cape_03',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'list_reply',
        list_reply: {
          id: 'cat_cement',
          title: 'Bulk Cement',
        },
      },
    });

    const session = await conversationSessionStore.getSession(customerWaId);
    expect(session.currentStage).toBe('CART_BUILDING');
    expect(session.cart[0].retailerId).toBe('SKU-CEMENT-PALLET-40');
    expect(session.cart[0].totalPrice).toBe(4400.0);
  });

  it('should add Aluminium Windows to cart when cat_aluminium is selected', async () => {
    await conversationSessionStore.setStage(customerWaId, 'BROWSING');

    await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
      from: customerWaId,
      id: 'wamid_cape_04',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'list_reply',
        list_reply: {
          id: 'cat_aluminium',
          title: 'Aluminium Windows',
        },
      },
    });

    const session = await conversationSessionStore.getSession(customerWaId);
    expect(session.currentStage).toBe('CART_BUILDING');
    expect(session.cart[0].retailerId).toBe('SKU-ALUM-PT99-TOPHUNG');
    expect(session.cart[0].totalPrice).toBe(850.0);
  });

  it('should dispatch Order Quote interactive buttons matching quote layout', async () => {
    const msgId = await whatsAppClientService.sendOrderQuoteInteractiveButtons(
      customerWaId,
      'ORD-2026-8921',
      {
        deliveryAddress: 'Stand 402, Albertinia Industrial',
        distanceKm: 14.2,
        yardName: 'Fonsi-Colquake Yard',
        materialsSummary: '• 6m³ Plaster Sand @ R550/m³ = R3,300.00',
        deliverySummary: '• 6m³ Tipper Dispatch: R562.40',
        totalFormatted: 'R3,862.40',
      }
    );

    expect(msgId).toBeDefined();
    expect(msgId).toContain('wamid');
  });

  it('should transition to PAYMENT_PENDING when customer taps btn_pay_now (Accept & Pay)', async () => {
    const session = await conversationSessionStore.getSession(customerWaId);
    session.currentStage = 'QUOTE_CALCULATED';
    session.cart = [
      {
        retailerId: 'SKU-SAND-01',
        name: 'Plaster Sand 6m3',
        unitPrice: 3300.0,
        quantity: 1,
        totalPrice: 3300.0,
      },
    ];
    session.currentQuote = {
      distanceKm: 14.2,
      durationMinutes: 22,
      durationText: '22 mins',
      freightTier: 'Tier 1',
      baseFlagFall: 350.0,
      ratePerKm: 25.0,
      totalFreightCost: 562.4,
      vendorDepotCoordinates: { lat: -26.2041, lng: 28.0473 },
    };
    await conversationSessionStore.saveSession(session);

    // Customer taps "Accept & Pay (Instant)"
    await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
      from: customerWaId,
      id: 'wamid_cape_accept_pay',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: 'btn_pay_now',
          title: 'Accept & Pay (Instant)',
        },
      },
    });

    const updated = await conversationSessionStore.getSession(customerWaId);
    expect(updated.currentStage).toBe('PAYMENT_PENDING');
    expect(updated.activeOrder).toBeDefined();
    expect(updated.activeOrder?.paymentUrl).toContain('payfast');
  });

  it('should reset order when customer taps btn_cancel_quote (Cancel Order)', async () => {
    const session = await conversationSessionStore.getSession(customerWaId);
    session.currentStage = 'QUOTE_CALCULATED';
    await conversationSessionStore.saveSession(session);

    await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
      from: customerWaId,
      id: 'wamid_cape_cancel',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: 'btn_cancel_quote',
          title: 'Cancel Order',
        },
      },
    });

    const updated = await conversationSessionStore.getSession(customerWaId);
    expect(updated.currentStage).toBe('IDLE');
    expect(updated.cart.length).toBe(0);
  });

  it('should dispatch interactive CTA URL checkout button matching PayFast secure ready template', async () => {
    const msgId = await whatsAppClientService.sendCheckoutCtaButton(
      customerWaId,
      'ORD-2026-8921',
      'R3,862.40',
      'https://pay.aggregator.co.za/checkout/ORD-2026-8921?token=9f82bc71e'
    );

    expect(msgId).toBeDefined();
    expect(msgId).toContain('wamid');
  });

  it('should dispatch interactive Vendor Dispatch Ticket matching official payload', async () => {
    const vendorWaId = '27829876543';
    const msgId = await whatsAppClientService.sendVendorDispatchNotification(
      vendorWaId,
      'ORD-2026-8921',
      {
        customerName: 'Vernon',
        customerPhone: '082 123 4567',
        siteAddress: 'Stand 402, Albertinia Industrial',
        itemsToLoad: '• 6m³ Plaster Sand (Tipper Bin #2)',
        netPayoutFormatted: 'R3,553.41',
        commissionRatePct: 8,
      }
    );

    expect(msgId).toBeDefined();
    expect(msgId).toContain('wamid');
  });

  it('should handle vendor dispatch action: dispatch_loaded (Truck Dispatched)', async () => {
    const vendorWaId = '27829876543';
    const orderRef = 'ORD-2026-8921';

    // Seed order in database with status 'paid'
    const order = await postgresOrderRepository.createOrder(
      {
        order_ref: orderRef,
        vendor_id: 'd01869e8-32f2-4fc4-bb9e-1f221447db6a',
        customer_phone: customerWaId,
        customer_name: customerName,
        delivery_address: 'Stand 402, Albertinia Industrial',
        delivery_lon: 28.0473,
        delivery_lat: -26.2041,
        distance_km: 14.2,
        subtotal: 3300.0,
        delivery_fee: 562.4,
        total_amount: 3862.4,
        platform_fee: 308.99,
        vendor_payout: 3553.41,
        payment_status: 'paid',
        payfast_pf_payment_id: '1234567',
        current_status: 'paid',
      },
      []
    );

    // Vendor taps "Truck Dispatched"
    await conversationStateMachine.handleInboundMessage(vendorWaId, 'Yard Dispatcher', {
      from: vendorWaId,
      id: 'wamid_vendor_dispatched',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: 'dispatch_loaded',
          title: 'Truck Dispatched',
        },
      },
    });

    const updated = await postgresOrderRepository.findById(order.id);
    expect(updated?.current_status).toBe('dispatched');
  });

  it('should handle vendor dispatch action: dispatch_delivered (Delivered to Site)', async () => {
    const vendorWaId = '27829876543';
    const orderRef = 'ORD-2026-8921';

    // Order is currently 'dispatched'
    const order = await postgresOrderRepository.findByOrderRef(orderRef);
    expect(order).toBeDefined();

    // Vendor taps "Delivered to Site"
    await conversationStateMachine.handleInboundMessage(vendorWaId, 'Yard Dispatcher', {
      from: vendorWaId,
      id: 'wamid_vendor_delivered',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: 'dispatch_delivered',
          title: 'Delivered to Site',
        },
      },
    });

    const updated = await postgresOrderRepository.findById(order!.id);
    expect(updated?.current_status).toBe('delivered');
  });
});
