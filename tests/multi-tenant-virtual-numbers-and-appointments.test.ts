import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { whatsAppQueueWorker } from '../src/services/queue/whatsapp-queue.worker';
import { conversationSessionStore } from '../src/services/state-machine/conversation-session.store';
import { postgresVendorRepository } from '../src/database/postgres-vendor.repository';
import { postgresProductRepository } from '../src/database/postgres-product.repository';
import { postgresOrderRepository } from '../src/database/postgres-order.repository';
import { postgresLedgerService } from '../src/database/postgres-ledger.service';
import { appointmentEngineService } from '../src/services/booking/appointment-engine.service';
import { payFastLedgerTransactionService } from '../src/services/ledger/payfast-ledger-transaction.service';
import { saasSubscriptionBillingService } from '../src/services/revenue/saas-subscription-billing.service';
import { whatsAppClientService } from '../src/services/whatsapp/whatsapp-client.service';
import { WhatsAppWebhookPayload } from '../src/types/whatsapp.types';

describe('Multi-Tenant Virtual Number Routing, Service Appointment Engine & Dynamic MoR Sub-Accounting', () => {
  it('1. Verifies database migration 002 defines meta_phone_number_id, business_type, vendor_service_schedules, and appointments', () => {
    const migration002Path = path.join(
      __dirname,
      '../migrations/002_multi_tenant_virtual_numbers_and_appointments.sql'
    );
    expect(fs.existsSync(migration002Path)).toBe(true);

    const sql = fs.readFileSync(migration002Path, 'utf-8');
    expect(sql).toContain('meta_phone_number_id VARCHAR(100)');
    expect(sql).toContain('meta_catalog_id VARCHAR(100)');
    expect(sql).toContain('business_type VARCHAR(50)');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS vendor_service_schedules');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS appointments');
  });

  it('2. Enforces strict tenant isolation when the same customer texts two different Meta phone_number_ids (Yard A vs Pizza Shop D vs Salon C)', async () => {
    const customerPhone = '27825550199';

    const yardVendor = await postgresVendorRepository.findByMetaPhoneNumberId('meta_pnum_brickdirect_101');
    const pizzaVendor = await postgresVendorRepository.findByMetaPhoneNumberId('meta_pnum_napoli_104');
    const salonVendor = await postgresVendorRepository.findByMetaPhoneNumberId('meta_pnum_auraluxe_103');

    expect(yardVendor).toBeDefined();
    expect(yardVendor?.business_type).toBe('retail_delivery');
    expect(pizzaVendor).toBeDefined();
    expect(pizzaVendor?.business_type).toBe('retail_delivery');
    expect(salonVendor).toBeDefined();
    expect(salonVendor?.business_type).toBe('service_booking');

    // Reset sessions for all 3 tenants
    await conversationSessionStore.resetSession(customerPhone, yardVendor!.id);
    await conversationSessionStore.resetSession(customerPhone, pizzaVendor!.id);
    await conversationSessionStore.resetSession(customerPhone, salonVendor!.id);

    // 1. Customer texts Yard A (`meta_pnum_brickdirect_101`) and adds Plaster Sand to cart
    const yardHelloPayload: WhatsAppWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba_entry_1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+27820000001',
                  phone_number_id: 'meta_pnum_brickdirect_101',
                },
                contacts: [{ wa_id: customerPhone, profile: { name: 'Sipho Contractor' } }],
                messages: [
                  {
                    from: customerPhone,
                    id: 'wamid.yard.1',
                    timestamp: `${Math.floor(Date.now() / 1000)}`,
                    type: 'text',
                    text: { body: 'hi' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await whatsAppQueueWorker.processWebhook(yardHelloPayload);

    const yardAddItemPayload: WhatsAppWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba_entry_2',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+27820000001',
                  phone_number_id: 'meta_pnum_brickdirect_101',
                },
                contacts: [{ wa_id: customerPhone, profile: { name: 'Sipho Contractor' } }],
                messages: [
                  {
                    from: customerPhone,
                    id: 'wamid.yard.2',
                    timestamp: `${Math.floor(Date.now() / 1000)}`,
                    type: 'interactive',
                    interactive: {
                      type: 'list_reply',
                      list_reply: {
                        id: 'SKU-SAND-PLASTER-6M3',
                        title: 'Plaster Sand',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await whatsAppQueueWorker.processWebhook(yardAddItemPayload);

    // 2. Same customer (`customerPhone`) texts Napoli Pizza Shop D (`meta_pnum_napoli_104`)
    const pizzaHelloPayload: WhatsAppWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba_entry_3',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+27829990004',
                  phone_number_id: 'meta_pnum_napoli_104',
                },
                contacts: [{ wa_id: customerPhone, profile: { name: 'Sipho Contractor' } }],
                messages: [
                  {
                    from: customerPhone,
                    id: 'wamid.pizza.1',
                    timestamp: `${Math.floor(Date.now() / 1000)}`,
                    type: 'text',
                    text: { body: 'hi' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await whatsAppQueueWorker.processWebhook(pizzaHelloPayload);

    const pizzaAddItemPayload: WhatsAppWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba_entry_4',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+27829990004',
                  phone_number_id: 'meta_pnum_napoli_104',
                },
                contacts: [{ wa_id: customerPhone, profile: { name: 'Sipho Contractor' } }],
                messages: [
                  {
                    from: customerPhone,
                    id: 'wamid.pizza.2',
                    timestamp: `${Math.floor(Date.now() / 1000)}`,
                    type: 'interactive',
                    interactive: {
                      type: 'list_reply',
                      list_reply: {
                        id: 'FOOD-PIZZA-MARGHERITA',
                        title: 'Margherita Pizza XL',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await whatsAppQueueWorker.processWebhook(pizzaAddItemPayload);

    // Verify strict session & cart isolation between Yard A and Pizza Shop D
    const yardSession = await conversationSessionStore.getSession(customerPhone, undefined, {
      vendorId: yardVendor!.id,
    });
    const pizzaSession = await conversationSessionStore.getSession(customerPhone, undefined, {
      vendorId: pizzaVendor!.id,
    });

    expect(yardSession.vendorId).toBe(yardVendor!.id);
    expect(yardSession.metaPhoneNumberId).toBe('meta_pnum_brickdirect_101');
    expect(yardSession.cart.length).toBe(1);
    expect(yardSession.cart[0].retailerId).toBe('SKU-SAND-PLASTER-6M3');
    expect(yardSession.cart[0].unitPrice).toBe(1850);

    expect(pizzaSession.vendorId).toBe(pizzaVendor!.id);
    expect(pizzaSession.metaPhoneNumberId).toBe('meta_pnum_napoli_104');
    expect(pizzaSession.cart.length).toBe(1);
    expect(pizzaSession.cart[0].retailerId).toBe('FOOD-PIZZA-MARGHERITA');
    expect(pizzaSession.cart[0].unitPrice).toBe(145);

    // Verify catalog queries are strictly isolated per vendor_id
    const yardCatalog = await postgresProductRepository.findByVendor(yardVendor!.id);
    const pizzaCatalog = await postgresProductRepository.findByVendor(pizzaVendor!.id);
    const salonCatalog = await postgresProductRepository.findByVendor(salonVendor!.id);

    expect(yardCatalog.some((p) => p.meta_product_retailer_id === 'FOOD-PIZZA-MARGHERITA')).toBe(false);
    expect(pizzaCatalog.some((p) => p.meta_product_retailer_id === 'SKU-SAND-PLASTER-6M3')).toBe(false);
    expect(salonCatalog.every((p) => p.vendor_id === salonVendor!.id)).toBe(true);
  });

  it('3. Service Booking Flow: returns next 3 available slots, places 10-min temporary hold, sets delivery_fee = 0.00, and releases expired holds', async () => {
    const customerPhone = '27827770888';
    const salonVendor = (await postgresVendorRepository.findByMetaPhoneNumberId('meta_pnum_auraluxe_103'))!;
    await conversationSessionStore.resetSession(customerPhone, salonVendor.id);

    const listSpy = vi.spyOn(whatsAppClientService, 'sendInteractiveList');

    // Step 1: Customer texts "hi" to Salon virtual number `meta_pnum_auraluxe_103`
    await whatsAppQueueWorker.processWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'salon_entry_1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+27829990003',
                  phone_number_id: 'meta_pnum_auraluxe_103',
                },
                contacts: [{ wa_id: customerPhone, profile: { name: 'Naledi Mokoena' } }],
                messages: [
                  {
                    from: customerPhone,
                    id: 'wamid.salon.1',
                    timestamp: `${Math.floor(Date.now() / 1000)}`,
                    type: 'text',
                    text: { body: 'hi' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    // Step 2: Customer selects "Signature Balayage & Cut (60 min)" (SVC-BALAYAGE-CUT, R650)
    await whatsAppQueueWorker.processWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'salon_entry_2',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+27829990003',
                  phone_number_id: 'meta_pnum_auraluxe_103',
                },
                contacts: [{ wa_id: customerPhone, profile: { name: 'Naledi Mokoena' } }],
                messages: [
                  {
                    from: customerPhone,
                    id: 'wamid.salon.2',
                    timestamp: `${Math.floor(Date.now() / 1000)}`,
                    type: 'interactive',
                    interactive: {
                      type: 'list_reply',
                      list_reply: {
                        id: 'SVC-BALAYAGE-CUT',
                        title: 'Signature Balayage & Cut',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const sessionAfterServiceSelect = await conversationSessionStore.getSession(customerPhone, undefined, {
      vendorId: salonVendor.id,
    });
    expect(sessionAfterServiceSelect.currentStage).toBe('SLOT_SELECTION');

    // Verify interactive list message was sent with the next 3 available slots
    const lastListCall = listSpy.mock.calls[listSpy.mock.calls.length - 1];
    expect(lastListCall).toBeDefined();
    const sections = lastListCall[4];
    expect(sections[0].rows.length).toBe(3);

    const chosenSlotId = sections[0].rows[0].id;
    expect(chosenSlotId).toMatch(/^slot_\d+$/);

    // Step 3: Customer picks Slot #1 -> places 10-minute hold & generates PayFast CTA with R0.00 delivery fee
    await whatsAppQueueWorker.processWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'salon_entry_3',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+27829990003',
                  phone_number_id: 'meta_pnum_auraluxe_103',
                },
                contacts: [{ wa_id: customerPhone, profile: { name: 'Naledi Mokoena' } }],
                messages: [
                  {
                    from: customerPhone,
                    id: 'wamid.salon.3',
                    timestamp: `${Math.floor(Date.now() / 1000)}`,
                    type: 'interactive',
                    interactive: {
                      type: 'list_reply',
                      list_reply: {
                        id: chosenSlotId,
                        title: sections[0].rows[0].title,
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const sessionInPayment = await conversationSessionStore.getSession(customerPhone, undefined, {
      vendorId: salonVendor.id,
    });
    expect(sessionInPayment.currentStage).toBe('PAYMENT_PENDING');
    expect(sessionInPayment.activeAppointmentId).toBeDefined();
    expect(sessionInPayment.activeOrder).toBeDefined();
    expect(sessionInPayment.activeOrder?.freightQuote.totalFreightCost).toBe(0);
    expect(sessionInPayment.activeOrder?.freightQuote.distanceKm).toBe(0);
    expect(sessionInPayment.activeOrder?.totalAmount).toBe(650);

    const heldAppointment = await appointmentEngineService.findById(sessionInPayment.activeAppointmentId!);
    expect(heldAppointment).toBeDefined();
    expect(heldAppointment?.status).toBe('hold');
    expect(heldAppointment?.vendor_id).toBe(salonVendor.id);

    // Verify that while the slot is held, getNextAvailableSlots skips the held slot
    const slotsWhileHeld = await appointmentEngineService.getNextAvailableSlots(salonVendor.id, new Date(), 3);
    expect(slotsWhileHeld.some((s) => s.slotId === chosenSlotId)).toBe(false);

    // Simulate 11 minutes passing without PayFast ITN -> hold is automatically released!
    const elevenMinutesLater = new Date(Date.now() + 11 * 60 * 1000);
    const released = await appointmentEngineService.releaseExpiredHolds(elevenMinutesLater);
    expect(released.some((a) => a.id === heldAppointment!.id)).toBe(true);

    const afterExpiry = await appointmentEngineService.findById(heldAppointment!.id);
    expect(afterExpiry?.status).toBe('cancelled');
  });

  it('4. Dynamic MoR Ledger Sub-Accounting: settles PayFast ITN into isolated vendor sub-ledger, confirms appointment, and supports Monthly SaaS Set-Off', async () => {
    const salonVendor = (await postgresVendorRepository.findByMetaPhoneNumberId('meta_pnum_auraluxe_103'))!;
    const yardVendor = (await postgresVendorRepository.findByMetaPhoneNumberId('meta_pnum_brickdirect_101'))!;

    const salonBalanceBefore = await postgresLedgerService.getVendorBalance(salonVendor.id);
    const yardBalanceBefore = await postgresLedgerService.getVendorBalance(yardVendor.id);

    // Create a fresh 10-minute slot hold + service order for Salon Vendor C
    const nextSlots = await appointmentEngineService.getNextAvailableSlots(salonVendor.id, new Date(), 3);
    const slot = nextSlots[0];

    const orderRef = `APT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const grossAmount = 650.0; // R650 service, R0 delivery
    const commissionRate = salonVendor.commission_rate; // 6.5% (0.065)
    const platformCommission = Math.round(grossAmount * commissionRate * 100) / 100; // R42.25
    const vendorPayout = Math.round((grossAmount - platformCommission) * 100) / 100; // R607.75

    const order = await postgresOrderRepository.createOrder(
      {
        order_ref: orderRef,
        vendor_id: salonVendor.id,
        customer_phone: '27827770999',
        customer_name: 'Lerato Khumalo',
        delivery_address: `In-Studio Appointment (${slot.scheduledStart})`,
        delivery_lon: salonVendor.base_location_lon,
        delivery_lat: salonVendor.base_location_lat,
        distance_km: 0,
        subtotal: grossAmount,
        delivery_fee: 0.0,
        total_amount: grossAmount,
        platform_fee: platformCommission,
        vendor_payout: vendorPayout,
        payment_status: 'unpaid',
        current_status: 'pending_payment',
      },
      [
        {
          product_id: '33333333-3333-4333-8333-333333333301',
          quantity: 1,
          unit_price: grossAmount,
          total_price: grossAmount,
        },
      ]
    );

    const heldAppt = await appointmentEngineService.placeTemporarySlotHold({
      vendorId: salonVendor.id,
      customerPhone: '27827770999',
      customerName: 'Lerato Khumalo',
      serviceProductId: '33333333-3333-4333-8333-333333333301',
      orderId: order.id,
      scheduledStart: slot.scheduledStart,
      holdDurationMinutes: 10,
    });

    // Process PayFast ITN on Master Account with custom_str4 (vendorId) and custom_str5 (appointmentId)
    const itnResult = await payFastLedgerTransactionService.processITNTransaction({
      m_payment_id: orderRef,
      pf_payment_id: 'PF-MASTER-990123',
      payment_status: 'COMPLETE',
      amount_gross: grossAmount.toFixed(2),
      custom_str1: '27827770999',
      custom_str2: salonVendor.whatsapp_number,
      custom_str3: orderRef,
      custom_str4: salonVendor.id,
      custom_str5: heldAppt.id,
      signature: 'mock_valid_sig',
    });

    expect(itnResult.success).toBe(true);
    expect(itnResult.vendor?.id).toBe(salonVendor.id);
    expect(itnResult.confirmedAppointment?.status).toBe('confirmed');
    expect(itnResult.confirmedAppointment?.payfast_pf_payment_id).toBe('PF-MASTER-990123');

    // Verify all required ledger entry types were recorded for Salon Vendor C
    const entryTypes = (itnResult.entries || []).map((e) => e.entry_type);
    expect(entryTypes).toContain('customer_payment_received');
    expect(entryTypes).toContain('platform_commission_earned');
    expect(entryTypes).toContain('payment_spread_retained');
    expect(entryTypes).toContain('vendor_payout_disbursed');

    const salonBalanceAfterOrder = await postgresLedgerService.getVendorBalance(salonVendor.id);
    const yardBalanceAfterOrder = await postgresLedgerService.getVendorBalance(yardVendor.id);

    expect(salonBalanceAfterOrder).toBeCloseTo(salonBalanceBefore + vendorPayout, 2);
    // Yard A's sub-ledger balance must remain completely untouched!
    expect(yardBalanceAfterOrder).toBeCloseTo(yardBalanceBefore, 2);

    // Execute Monthly SaaS Subscription Set-Off against Salon Vendor C's unsettled ledger balance
    const billingResult = await saasSubscriptionBillingService.billVendorMonthlySubscription({
      vendorId: salonVendor.id,
      billingCycle: '2026-10',
      forceCollectionMethod: 'LEDGER_SETOFF',
    });
    expect(billingResult.status).toBe('SETTLED');
    expect(billingResult.collectionMethod).toBe('LEDGER_SETOFF');
    expect(billingResult.ledgerEntry?.entry_type).toBe('saas_subscription_setoff');
    expect(billingResult.unsettledBalanceAfter).toBeCloseTo(
      salonBalanceAfterOrder - (salonVendor.subscription_monthly_fee || 599),
      2
    );
  });
});
