import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConversationStateMachine } from '../src/services/state-machine/conversation-state-machine';
import { conversationSessionStore } from '../src/services/state-machine/conversation-session.store';
import { whatsAppClientService } from '../src/services/whatsapp/whatsapp-client.service';
import { postgresVendorRepository } from '../src/database/postgres-vendor.repository';
import { postgresProductRepository } from '../src/database/postgres-product.repository';

const HIGIENE_VENDOR_ID = 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';
const FUNGUS_VENDOR_ID = 'e5fffa99-9e5d-4fe8-992a-2dd8df180e55';

function createInboundMessage(text: string) {
  return {
    from: '27764862942',
    id: `msg_${Date.now()}`,
    timestamp: String(Date.now()),
    type: 'text' as const,
    text: { body: text },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Higiene & Fungus No More Catalog & WhatsApp Commerce Flow', () => {
  it('loads the 7 genuine products from higiene.co.za & fungusnomore.co.za for both vendors', async () => {
    const higieneProducts = await postgresProductRepository.findByVendor(HIGIENE_VENDOR_ID);
    const fungusProducts = await postgresProductRepository.findByVendor(FUNGUS_VENDOR_ID);

    expect(higieneProducts.length).toBe(7);
    expect(fungusProducts.length).toBe(7);

    const skus = higieneProducts.map((p) => p.meta_product_retailer_id);
    expect(skus).toContain('FNM-SB-500');
    expect(skus).toContain('FNM-POM-500');
    expect(skus).toContain('FNM-COC-050');
    expect(skus).toContain('FNM-SB-2X500');
    expect(skus).toContain('FNM-POM-2X500');
    expect(skus).toContain('FNM-MIX-2X500');
    expect(skus).toContain('FNM-BNDL-ALL');

    // Never loose sand or maxi bricks
    const titles = higieneProducts.map((p) => p.title);
    expect(titles.some((t) => t.includes('Sand'))).toBe(false);
    expect(titles.some((t) => t.includes('Maxi Bricks'))).toBe(false);
  });

  it('delivers the live Fungus No More catalog when a customer messages +1 555-462-9242', async () => {
    const stateMachine = new ConversationStateMachine();
    const sendSpy = vi.spyOn(whatsAppClientService, 'sendInteractiveList').mockResolvedValue('wamid.test');

    await conversationSessionStore.resetSession('27764862942', FUNGUS_VENDOR_ID);

    await stateMachine.handleInboundMessage(
      '27764862942',
      'Vernon',
      createInboundMessage('hi'),
      { vendorId: FUNGUS_VENDOR_ID, displayPhoneNumber: '+15554629242' }
    );

    expect(sendSpy).toHaveBeenCalled();
    const [, header, body, , sections] = sendSpy.mock.calls[0];

    expect(header).toContain('Fungus No More by Higiene');
    expect(body).toContain('Fungus No More by Higiene');
    const rows = sections[0].rows;
    expect(rows.length).toBe(7);
    const titles = rows.map((r: any) => r.title);
    expect(titles).toContain('Sea Breeze Shower Gel (500 ml)');
    expect(titles).toContain('Pomegranate Shower Gel (500 ml)');
    expect(titles).toContain('Coconut Antifungal Spray (50 ml)');
    expect(titles).toContain('Complete Regimen Bundle (3-Piece)');
  });

  it('delivers the live Higiene catalog when a customer messages +1 555-344-3356', async () => {
    const stateMachine = new ConversationStateMachine();
    const sendSpy = vi.spyOn(whatsAppClientService, 'sendInteractiveList').mockResolvedValue('wamid.test');

    await conversationSessionStore.resetSession('27764862942', HIGIENE_VENDOR_ID);

    await stateMachine.handleInboundMessage(
      '27764862942',
      'Vernon',
      createInboundMessage('hi'),
      { vendorId: HIGIENE_VENDOR_ID, displayPhoneNumber: '+15553443356' }
    );

    expect(sendSpy).toHaveBeenCalled();
    const [, header, body, , sections] = sendSpy.mock.calls[0];

    expect(header).toContain('Hygienical (Pty) Ltd T/A Higiene');
    expect(body).toContain('Hygienical (Pty) Ltd T/A Higiene');
    const rows = sections[0].rows;
    expect(rows.length).toBe(7);
  });

  it('delivers product image, cart confirmation, and nationwide courier delivery quote without tipper errors', async () => {
    const stateMachine = new ConversationStateMachine();
    const imageSpy = vi.spyOn(whatsAppClientService, 'sendImageMessage').mockResolvedValue('wamid.img');
    const buttonSpy = vi.spyOn(whatsAppClientService, 'sendInteractiveButtons').mockResolvedValue('wamid.btn');
    const quoteSpy = vi.spyOn(whatsAppClientService, 'sendOrderQuoteInteractiveButtons').mockResolvedValue('wamid.quote');

    await conversationSessionStore.resetSession('27764862942', HIGIENE_VENDOR_ID);

    // 0. Customer initiates chat with "hi" -> transitions IDLE to BROWSING with catalog
    await stateMachine.handleInboundMessage(
      '27764862942',
      'Vernon',
      createInboundMessage('hi'),
      { vendorId: HIGIENE_VENDOR_ID, displayPhoneNumber: '+15553443356' }
    );

    // 1. Customer adds item #1 (Sea Breeze 500ml) from BROWSING
    await stateMachine.handleInboundMessage(
      '27764862942',
      'Vernon',
      createInboundMessage('1'),
      { vendorId: HIGIENE_VENDOR_ID, displayPhoneNumber: '+15553443356' }
    );

    // Product image was sent!
    expect(imageSpy).toHaveBeenCalled();
    const [, imageUrl, caption] = imageSpy.mock.calls[0];
    expect(imageUrl).toContain('sea-breeze-500ml.jpg');
    expect(caption).toContain('Sea Breeze Shower Gel');

    // Cart confirmation sent with "Cart Subtotal" (not Materials Subtotal) and "Courier Checkout"
    expect(buttonSpy).toHaveBeenCalled();
    const [, cartBody, buttons] = buttonSpy.mock.calls[0];
    expect(cartBody).toContain('Cart Subtotal');
    expect(cartBody).not.toContain('Materials Subtotal');
    expect(buttons[0].title).toBe('🚚 Courier Checkout');

    // 2. Customer proceeds to checkout
    await stateMachine.handleInboundMessage(
      '27764862942',
      'Vernon',
      createInboundMessage('1'),
      { vendorId: HIGIENE_VENDOR_ID, displayPhoneNumber: '+15553443356' }
    );

    // 3. Customer submits Albertinia address/location (51.72 km away)
    await stateMachine.handleInboundMessage(
      '27764862942',
      'Vernon',
      createInboundMessage('38 Station St, Albertinia, 6695, Western Cape, ZA'),
      { vendorId: HIGIENE_VENDOR_ID, displayPhoneNumber: '+15553443356' }
    );

    // Quote was generated without "out of delivery zone" or "tipper" errors
    expect(quoteSpy).toHaveBeenCalled();
    const [, , quoteDetails] = quoteSpy.mock.calls[0];
    expect(quoteDetails.deliverySummary).toContain('Courier Delivery');
    expect(quoteDetails.deliverySummary).not.toContain('Tipper');
  });
});
