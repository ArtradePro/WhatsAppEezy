import { describe, it, expect } from 'vitest';
import { payFastService } from '../src/services/payment/payfast.service';
import { CheckoutOrder } from '../src/types/state.types';
import { PayFastITNPayload } from '../src/types/payfast.types';
import { ledgerService } from '../src/services/ledger/ledger.service';

describe('PayFast Split-Checkout & ITN Verification', () => {
  const sampleOrder: CheckoutOrder = {
    orderId: 'ORD-TEST-9988',
    customerWhatsApp: '27821234567',
    customerName: 'John Builder',
    items: [
      {
        retailerId: 'SKU-BRICK-01',
        name: 'Clay Bricks',
        unitPrice: 450.0,
        quantity: 2,
        totalPrice: 900.0,
      },
    ],
    itemsSubtotal: 900.0,
    freightQuote: {
      distanceKm: 12.0,
      durationMinutes: 20,
      durationText: '20 mins',
      freightTier: 'Tier 1',
      baseFlagFall: 350.0,
      ratePerKm: 25.0,
      totalFreightCost: 650.0,
      vendorDepotCoordinates: { lat: -26.2041, lng: 28.0473 },
    },
    totalAmount: 1550.0,
    currency: 'ZAR',
    paymentStatus: 'PAYMENT_PENDING',
    vendorWhatsApp: '27829876543',
    createdAt: new Date().toISOString(),
  };

  it('should generate valid PayFast checkout URL with MD5 signature', () => {
    const checkoutUrl = payFastService.generateCheckoutUrl(sampleOrder);

    expect(checkoutUrl).toBeDefined();
    expect(checkoutUrl).toContain('https://sandbox.payfast.co.za/eng/process?');
    expect(checkoutUrl).toContain('merchant_id=');
    expect(checkoutUrl).toContain('amount=1550.00');
    expect(checkoutUrl).toContain('m_payment_id=ORD-TEST-9988');
    expect(checkoutUrl).toContain('signature=');
  });

  it('should verify valid ITN signature and reject tampered signature', () => {
    const rawData = {
      m_payment_id: 'ORD-TEST-9988',
      pf_payment_id: '12345678',
      payment_status: 'COMPLETE',
      amount_gross: '1550.00',
      amount_fee: '-35.50',
      amount_net: '1514.50',
      custom_str1: '27821234567',
      custom_str2: '27829876543',
      custom_str3: 'ORD-TEST-9988',
    };

    const validSignature = payFastService.generateSignature(rawData, 'payfast_secure_passphrase');
    const validPayload = { ...rawData, signature: validSignature };

    expect(payFastService.verifySignature(validPayload)).toBe(true);

    // Tampered payload
    const tamperedPayload = { ...validPayload, amount_gross: '9999.00' };
    expect(payFastService.verifySignature(tamperedPayload)).toBe(false);
  });

  it('should process payment notification, split 8% platform commission vs vendor payout net, and record in ledger', async () => {
    const itnPayload: PayFastITNPayload = {
      m_payment_id: 'ORD-TEST-9988',
      pf_payment_id: 'PF-TX-9988-12',
      payment_status: 'COMPLETE',
      amount_gross: '1550.00',
      amount_fee: '35.00',
      amount_net: '1515.00',
      custom_str1: '27821234567',
      custom_str2: '27829876543',
      custom_str3: 'ORD-TEST-9988',
      signature: '',
    };

    const ledgerEntry = await payFastService.processPaymentNotification(itnPayload);

    expect(ledgerEntry).toBeDefined();
    expect(ledgerEntry.grossAmount).toBe(1550.0);
    // Platform commission is 8% of 1550 = 124.00
    expect(ledgerEntry.platformCommissionAmount).toBe(124.0);
    // Vendor net payout = 1550 - 124 - 35 = 1391.00
    expect(ledgerEntry.vendorPayoutNet).toBe(1391.0);
    expect(ledgerEntry.status).toBe('SETTLED');

    // Verify stored in ledger service
    const retrieved = await ledgerService.getEntryByOrderId('ORD-TEST-9988');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.pfPaymentId).toBe('PF-TX-9988-12');
  });
});
