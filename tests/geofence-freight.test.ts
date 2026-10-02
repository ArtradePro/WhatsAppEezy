import { describe, it, expect, beforeEach, vi } from 'vitest';
import { postGISSpatialService } from '../src/database/spatial.service';
import { freightCalculatorService } from '../src/services/delivery/freight-calculator.service';
import { conversationStateMachine } from '../src/services/state-machine/conversation-state-machine';
import { conversationSessionStore } from '../src/services/state-machine/conversation-session.store';
import { postgresVendorRepository } from '../src/database/postgres-vendor.repository';
import { postgresOrderRepository } from '../src/database/postgres-order.repository';
import { whatsAppClientService } from '../src/services/whatsapp/whatsapp-client.service';
import { CartItem } from '../src/types/state.types';

describe('Real-Time Delivery Distance, Freight Surcharges & PostGIS Geofencing', () => {
  const customerWaId = '27821234567';
  const customerName = 'Vernon Contractor';

  beforeEach(async () => {
    await conversationSessionStore.resetSession(customerWaId);
  });

  describe('1. PostGIS Geofencing & Proximity Queries', () => {
    it('should confirm customer pin is within operating radius (<45km)', async () => {
      const vendor = await postgresVendorRepository.findById('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(vendor).toBeDefined();

      // Customer pin ~14.2km from vendor depot (-26.2041, 28.0473)
      const customerLat = -26.1500;
      const customerLon = 28.1200;

      const result = await postGISSpatialService.checkVendorDeliveryRadius(
        vendor!.id,
        customerLon,
        customerLat,
        vendor!.base_location_lon,
        vendor!.base_location_lat,
        vendor!.max_delivery_radius_km
      );

      expect(result.within_radius).toBe(true);
      expect(result.distance_km).toBeGreaterThan(0);
      expect(result.distance_km).toBeLessThanOrEqual(vendor!.max_delivery_radius_km);
    });

    it('should detect when customer pin exceeds maximum delivery radius (>45km)', async () => {
      const vendor = await postgresVendorRepository.findById('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(vendor).toBeDefined();

      // Customer pin ~75km away in outlying district
      const customerLat = -26.8500;
      const customerLon = 28.4500;

      const result = await postGISSpatialService.checkVendorDeliveryRadius(
        vendor!.id,
        customerLon,
        customerLat,
        vendor!.base_location_lon,
        vendor!.base_location_lat,
        vendor!.max_delivery_radius_km
      );

      expect(result.within_radius).toBe(false);
      expect(result.distance_km).toBeGreaterThan(45.0);
    });
  });

  describe('2. Freight Surcharge & Heavy Tipper Volume Engine', () => {
    it('should accurately calculate aggregated load volume across different bulk materials', () => {
      const standardItems: CartItem[] = [
        {
          retailerId: 'SKU-SAND-01',
          name: 'Plaster Sand (6m³ Bulk Tipper Load)',
          unitPrice: 1850,
          quantity: 1,
          unitOfMeasure: 'per 6m3 tipper',
          totalPrice: 1850,
        },
      ];
      expect(freightCalculatorService.calculateAggregatedVolume(standardItems)).toBe(6.0);

      const heavyItems: CartItem[] = [
        {
          retailerId: 'SKU-SAND-10',
          name: 'Concrete River Sand',
          unitPrice: 2800,
          quantity: 1,
          unitOfMeasure: '10m³ bulk load',
          totalPrice: 2800,
        },
      ];
      expect(freightCalculatorService.calculateAggregatedVolume(heavyItems)).toBe(10.0);

      const mixedItems: CartItem[] = [
        {
          retailerId: 'SKU-BRICK-MAXI',
          name: 'Cement Maxi Bricks',
          unitPrice: 2450,
          quantity: 2, // 2 x 1000 bricks = 5m³
          unitOfMeasure: 'per 1000 bricks',
          totalPrice: 4900,
        },
        {
          retailerId: 'SKU-CEMENT-PALLET',
          name: 'Portland Cement (Pallet 40 Bags)',
          unitPrice: 4400,
          quantity: 1, // 2m³
          unitOfMeasure: 'per pallet (40 bags)',
          totalPrice: 4400,
        },
      ];
      // 5.0 + 2.0 = 7.0m³
      expect(freightCalculatorService.calculateAggregatedVolume(mixedItems)).toBe(7.0);
    });

    it('should apply 0 tipper surcharge for loads <= 6m³', () => {
      expect(freightCalculatorService.calculateTipperSurcharge(4.5)).toBe(0);
      expect(freightCalculatorService.calculateTipperSurcharge(6.0)).toBe(0);
    });

    it('should apply R250 base + R75/m³ excess tipper surcharge for loads > 6m³', () => {
      // 10m³ load -> excess 4m³ -> 250 + (4 * 75) = 550
      expect(freightCalculatorService.calculateTipperSurcharge(10.0)).toBe(550.0);

      // 7.5m³ load -> excess 1.5m³ -> 250 + (1.5 * 75) = 362.5
      expect(freightCalculatorService.calculateTipperSurcharge(7.5)).toBe(362.5);
    });

    it('should compute full freight quote combining vendor base, mileage, and tipper surcharge', async () => {
      const vendorOrigin = { lat: -26.2041, lng: 28.0473 };
      const customerSite = { lat: -26.1500, lng: 28.0800 }; // ~8-10 km

      const cart: CartItem[] = [
        {
          retailerId: 'SKU-SAND-10',
          name: 'River Sand (10m³ Bulk Tipper Load)',
          unitPrice: 3000,
          quantity: 1,
          totalPrice: 3000,
        },
      ];

      const quote = await freightCalculatorService.calculateFreightQuote(
        customerSite,
        'Stand 402, Albertinia Industrial',
        vendorOrigin,
        cart,
        {
          baseDeliveryFee: 250.0,
          perKmRate: 22.0,
        }
      );

      expect(quote.baseFlagFall).toBe(250.0);
      expect(quote.ratePerKm).toBe(22.0);
      expect(quote.totalCubicMeters).toBe(10.0);
      expect(quote.tipperSurcharge).toBe(550.0);
      expect(quote.totalFreightCost).toBe(
        Math.round((quote.baseFlagFall + quote.mileageCost! + quote.tipperSurcharge) * 100) / 100
      );
    });
  });

  describe('3. Inbound Location Pin State Machine & PostGIS Geofencing', () => {
    it('should reject location pin exceeding 45km operating radius with interactive zone exceeded alert', async () => {
      const sendButtonsSpy = vi.spyOn(whatsAppClientService, 'sendOutOfDeliveryZoneButtons');

      const session = await conversationSessionStore.getSession(customerWaId);
      session.currentStage = 'ADDRESS_INPUT';
      session.cart = [
        {
          retailerId: 'cat_sand_stone',
          name: 'Plaster Sand (6m³ Bulk Tipper Load)',
          unitPrice: 1850,
          quantity: 1,
          totalPrice: 1850,
        },
      ];
      await conversationSessionStore.saveSession(session);

      // Customer sends out-of-radius pin ~80km away
      await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
        from: customerWaId,
        id: 'wamid_loc_far',
        timestamp: `${Date.now()}`,
        type: 'location',
        location: {
          latitude: -26.9000,
          longitude: 28.5000,
          name: 'Meyerton Rural Farm 80km',
          address: 'Plot 44, Meyerton Rural',
        },
      });

      expect(sendButtonsSpy).toHaveBeenCalled();
      const callArgs = sendButtonsSpy.mock.calls[0];
      expect(callArgs[0]).toBe(customerWaId);
      expect(callArgs[1].distanceKm).toBeGreaterThan(45.0);
      expect(callArgs[1].maxRadiusKm).toBe(45.0);

      // Session must remain in ADDRESS_INPUT so the user can re-send or escalate
      const updated = await conversationSessionStore.getSession(customerWaId);
      expect(updated.currentStage).toBe('ADDRESS_INPUT');
      expect(updated.activeOrder).toBeUndefined();

      sendButtonsSpy.mockRestore();
    });

    it('should accept within-radius pin, compute haulage, persist draft order in PostgreSQL, and send quote buttons', async () => {
      const sendQuoteSpy = vi.spyOn(whatsAppClientService, 'sendOrderQuoteInteractiveButtons');

      const session = await conversationSessionStore.getSession(customerWaId);
      session.currentStage = 'ADDRESS_INPUT';
      session.cart = [
        {
          retailerId: 'cat_sand_stone',
          name: 'Plaster Sand (6m³ Bulk Tipper Load)',
          unitPrice: 1850,
          quantity: 1,
          totalPrice: 1850,
        },
      ];
      await conversationSessionStore.saveSession(session);

      // Customer sends valid site location ~14km away
      await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
        from: customerWaId,
        id: 'wamid_loc_valid',
        timestamp: `${Date.now()}`,
        type: 'location',
        location: {
          latitude: -26.1500,
          longitude: 28.1200,
          name: 'Stand 402, Albertinia Industrial',
          address: 'Stand 402, Albertinia Industrial',
        },
      });

      // 1. Session must transition to QUOTE_CALCULATED
      const updated = await conversationSessionStore.getSession(customerWaId);
      expect(updated.currentStage).toBe('QUOTE_CALCULATED');
      expect(updated.currentQuote).toBeDefined();
      expect(updated.currentQuote?.distanceKm).toBeGreaterThan(0);
      expect(updated.currentQuote?.distanceKm).toBeLessThanOrEqual(45.0);

      // 2. Draft order must be persisted in PostgreSQL with status 'pending_payment'
      expect(updated.activeOrder).toBeDefined();
      const orderRef = updated.activeOrder!.orderId;
      const dbOrder = await postgresOrderRepository.findByOrderRef(orderRef);
      expect(dbOrder).toBeDefined();
      expect(dbOrder?.current_status).toBe('pending_payment');
      expect(dbOrder?.delivery_address).toContain('Albertinia Industrial');
      expect(dbOrder?.delivery_fee).toBe(updated.currentQuote?.totalFreightCost);
      expect(dbOrder?.total_amount).toBe(dbOrder!.subtotal + dbOrder!.delivery_fee);

      // 3. Interactive Order Quote buttons dispatched to customer
      expect(sendQuoteSpy).toHaveBeenCalled();
      const quoteArgs = sendQuoteSpy.mock.calls[0];
      expect(quoteArgs[0]).toBe(customerWaId);
      expect(quoteArgs[1]).toBe(orderRef);
      expect(quoteArgs[2].totalFormatted).toContain('2372.80');

      sendQuoteSpy.mockRestore();
    });

    it('should support dispatcher escalation when customer clicks "Speak to Agent"', async () => {
      const sendTextSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage');

      await conversationStateMachine.handleInboundMessage(customerWaId, customerName, {
        from: customerWaId,
        id: 'wamid_btn_agent',
        timestamp: `${Date.now()}`,
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: { id: 'btn_speak_agent', title: 'Speak to Agent' },
        },
      });

      expect(sendTextSpy).toHaveBeenCalled();
      const textMsg = sendTextSpy.mock.calls[0][1];
      expect(textMsg).toContain('Dispatch Desk');
      expect(textMsg).toContain('+27 11 000 0000');

      sendTextSpy.mockRestore();
    });
  });
});
