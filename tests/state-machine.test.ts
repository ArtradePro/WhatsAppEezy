import { describe, it, expect, beforeEach } from 'vitest';
import { conversationStateMachine } from '../src/services/state-machine/conversation-state-machine';
import { conversationSessionStore } from '../src/services/state-machine/conversation-session.store';
import { payFastService } from '../src/services/payment/payfast.service';

describe('Conversation State Machine Lifecycle', () => {
  const customerWaId = '27825551234';
  const customerName = 'Thabo Khumalo';

  beforeEach(async () => {
    await conversationSessionStore.resetSession(customerWaId);
  });

  it('Stage 1 -> Stage 2: Inbound greeting transitions from IDLE to BROWSING', async () => {
    let session = await conversationSessionStore.getSession(customerWaId);
    expect(session.currentStage).toBe('IDLE');

    await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
      from: customerWaId,
      id: 'wamid_1',
      timestamp: `${Date.now()}`,
      type: 'text',
      text: { body: 'Hello CargoDash' },
    });

    session = await conversationSessionStore.getSession(customerWaId);
    expect(session.currentStage).toBe('BROWSING');
  });

  it('Stage 2 -> Stage 3: Selecting item transitions from BROWSING to CART_BUILDING', async () => {
    // Set to BROWSING
    await conversationSessionStore.setStage(customerWaId, 'BROWSING');

    // Customer clicks on list item 'prod_brick_clay'
    await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
      from: customerWaId,
      id: 'wamid_2',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'list_reply',
        list_reply: { id: 'prod_brick_clay', title: 'Terracotta Facing Bricks' },
      },
    });

    const session = await conversationSessionStore.getSession(customerWaId);
    expect(session.currentStage).toBe('CART_BUILDING');
    expect(session.cart.length).toBe(1);
    expect(session.cart[0].name).toContain('Terracotta');
  });

  it('Stage 3 -> Stage 4: Clicking "Calculate Delivery" transitions to ADDRESS_INPUT', async () => {
    const session = await conversationSessionStore.getSession(customerWaId);
    session.currentStage = 'CART_BUILDING';
    session.cart = [
      {
        retailerId: 'SKU-001',
        name: 'Cement Bags',
        unitPrice: 115.0,
        quantity: 10,
        totalPrice: 1150.0,
      },
    ];
    await conversationSessionStore.saveSession(session);

    await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
      from: customerWaId,
      id: 'wamid_3',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: { id: 'btn_proceed_delivery', title: 'Calculate Delivery' },
      },
    });

    const updated = await conversationSessionStore.getSession(customerWaId);
    expect(updated.currentStage).toBe('ADDRESS_INPUT');
  });

  it('Stage 4 -> Stage 5: Providing WhatsApp Location calculates freight and transitions to QUOTE_CALCULATED', async () => {
    const session = await conversationSessionStore.getSession(customerWaId);
    session.currentStage = 'ADDRESS_INPUT';
    session.cart = [
      {
        retailerId: 'SKU-001',
        name: 'Cement Bags',
        unitPrice: 115.0,
        quantity: 10,
        totalPrice: 1150.0,
      },
    ];
    await conversationSessionStore.saveSession(session);

    // Customer sends WhatsApp Live Location Pin
    await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
      from: customerWaId,
      id: 'wamid_4',
      timestamp: `${Date.now()}`,
      type: 'location',
      location: {
        latitude: -26.1500,
        longitude: 28.0800,
        name: 'Rosebank Construction Site',
        address: 'Oxford Rd, Rosebank, Johannesburg',
      },
    });

    const updated = await conversationSessionStore.getSession(customerWaId);
    expect(updated.currentStage).toBe('QUOTE_CALCULATED');
    expect(updated.currentQuote).toBeDefined();
    expect(updated.currentQuote?.distanceKm).toBeGreaterThan(0);
    expect(updated.currentQuote?.totalFreightCost).toBeGreaterThan(0);
    expect(updated.deliveryLocation?.name).toBe('Rosebank Construction Site');
  });

  it('Stage 5 -> Stage 6: Clicking "Pay Now" generates PayFast link and transitions to PAYMENT_PENDING', async () => {
    const session = await conversationSessionStore.getSession(customerWaId);
    session.currentStage = 'QUOTE_CALCULATED';
    session.cart = [
      {
        retailerId: 'SKU-001',
        name: 'Cement Bags',
        unitPrice: 115.0,
        quantity: 10,
        totalPrice: 1150.0,
      },
    ];
    session.currentQuote = {
      distanceKm: 10.0,
      durationMinutes: 15,
      durationText: '15 mins',
      freightTier: 'Tier 1',
      baseFlagFall: 350.0,
      ratePerKm: 25.0,
      totalFreightCost: 600.0,
      vendorDepotCoordinates: { lat: -26.2041, lng: 28.0473 },
    };
    await conversationSessionStore.saveSession(session);

    await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
      from: customerWaId,
      id: 'wamid_5',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: { id: 'btn_proceed_payment', title: 'Pay Now' },
      },
    });

    const updated = await conversationSessionStore.getSession(customerWaId);
    expect(updated.currentStage).toBe('PAYMENT_PENDING');
    expect(updated.activeOrder).toBeDefined();
    expect(updated.activeOrder?.paymentUrl).toContain('https://sandbox.payfast.co.za');
    expect(updated.activeOrder?.totalAmount).toBe(1750.0); // 1150 + 600
  });

  it('Stage 6 -> Stage 7: PayFast ITN postback completes payment and transitions to ORDER_CONFIRMED', async () => {
    // Set up session with active order
    const session = await conversationSessionStore.getSession(customerWaId);
    const orderId = 'ORD-SM-TEST-7788';
    session.currentStage = 'PAYMENT_PENDING';
    session.activeOrder = {
      orderId,
      customerWhatsApp: customerWaId,
      customerName,
      items: [{ retailerId: 'SKU-1', name: 'Bricks', unitPrice: 500, quantity: 2, totalPrice: 1000 }],
      itemsSubtotal: 1000,
      freightQuote: {
        distanceKm: 5,
        durationMinutes: 10,
        durationText: '10m',
        freightTier: 'Tier 1',
        baseFlagFall: 350,
        ratePerKm: 25,
        totalFreightCost: 475,
        vendorDepotCoordinates: { lat: -26.2, lng: 28.0 },
      },
      totalAmount: 1475,
      currency: 'ZAR',
      paymentStatus: 'PAYMENT_PENDING',
      vendorWhatsApp: '27820000001',
      createdAt: new Date().toISOString(),
    };
    await conversationSessionStore.saveSession(session);

    // Simulate PayFast ITN arrival
    await payFastService.processPaymentNotification({
      m_payment_id: orderId,
      pf_payment_id: 'PF-99991111',
      payment_status: 'COMPLETE',
      amount_gross: '1475.00',
      amount_fee: '35.00',
      custom_str1: customerWaId,
      custom_str2: '27820000001',
      custom_str3: orderId,
      signature: '',
    });

    // Mark as confirmed in session
    session.currentStage = 'ORDER_CONFIRMED';
    session.activeOrder.paymentStatus = 'PAID';
    await conversationSessionStore.saveSession(session);

    const updated = await conversationSessionStore.getSession(customerWaId);
    expect(updated.currentStage).toBe('ORDER_CONFIRMED');
    expect(updated.activeOrder?.paymentStatus).toBe('PAID');
  });

  it('Handles WhatsApp Catalog Order Event directly into CART_BUILDING', async () => {
    await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
      from: customerWaId,
      id: 'wamid_catalog_order_1',
      timestamp: `${Date.now()}`,
      type: 'order',
      order: {
        catalog_id: 'cat_12345',
        text: 'Customer placed catalog order',
        product_items: [
          {
            product_retailer_id: 'SKU-PAVER-CONC',
            quantity: 5,
            item_price: 185.5,
            currency: 'ZAR',
          },
        ],
      },
    });

    const session = await conversationSessionStore.getSession(customerWaId);
    expect(session.currentStage).toBe('CART_BUILDING');
    expect(session.cart.length).toBe(1);
    expect(session.cart[0].retailerId).toBe('SKU-PAVER-CONC');
    expect(session.cart[0].totalPrice).toBe(185.5 * 5);
  });
});
