import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConversationStateMachine } from '../src/services/state-machine/conversation-state-machine';
import { conversationSessionStore } from '../src/services/state-machine/conversation-session.store';
import { whatsAppClientService } from '../src/services/whatsapp/whatsapp-client.service';
import { postgresVendorRepository } from '../src/database/postgres-vendor.repository';
import { postgresProductRepository } from '../src/database/postgres-product.repository';

const LCSH_VENDOR_ID = '98aaaa11-7b3c-4ef9-881d-9ff0bd270f77';

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

describe('LCSH Construction & SmartSpace Modular Routing', () => {
  it('resolves LCSH as construction_quotes with its own catalog, never brick/sand yard', async () => {
    const vendor = await postgresVendorRepository.findById(LCSH_VENDOR_ID);
    expect(vendor).toBeDefined();
    expect(vendor?.business_name).toContain('la Cock Signature Homes');
    expect(vendor?.business_type).toBe('construction_quotes');
    expect(vendor?.meta_catalog_id).toBe('cat_lcsh_007');

    const products = await postgresProductRepository.findByVendor(LCSH_VENDOR_ID);
    expect(products.length).toBeGreaterThanOrEqual(4);
    const titles = products.map((p) => p.title);
    expect(titles.some((t) => t.includes('SmartSpace'))).toBe(true);
    expect(titles.some((t) => t.includes('Light Frame Steel'))).toBe(true);
    expect(titles.some((t) => t.includes('Brick & Mortar'))).toBe(true);
    expect(titles.some((t) => t.includes('Pergolas, Carports'))).toBe(true);
    // Must never contain loose sand or maxi bricks
    expect(titles.some((t) => t.includes('Plaster Sand'))).toBe(false);
    expect(titles.some((t) => t.includes('Cement Maxi Bricks'))).toBe(false);
  });

  it('handles the website inquiry "Hello La Cock Signature Homes, I would like to inquire about modular pods, luxury builds, and pricing."', async () => {
    const stateMachine = new ConversationStateMachine();
    const sendSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage').mockResolvedValue('wamid.test');

    await conversationSessionStore.resetSession('27764862942', LCSH_VENDOR_ID);

    await stateMachine.handleInboundMessage(
      '27764862942',
      'Vernon la Cock',
      createInboundMessage('Hello La Cock Signature Homes, I would like to inquire about modular pods, luxury builds, and pricing.'),
      { vendorId: LCSH_VENDOR_ID, displayPhoneNumber: '+15553180006' }
    );

    expect(sendSpy).toHaveBeenCalled();
    const sentText = sendSpy.mock.calls[0][1];

    // Verify it never mentions shopping, bricks or sand
    expect(sentText).not.toContain('Plaster Sand');
    expect(sentText).not.toContain('Maxi Bricks');
    expect(sentText).not.toContain('shopping with');

    // Verify it acknowledges the inquiry and presents construction/smartspace options
    expect(sentText).toContain('la Cock Signature Homes');
    expect(sentText).toContain('SmartSpace Modular Pods');
    expect(sentText).toContain('Turnkey Luxury Builds');
    expect(sentText).toContain('Light Frame Steel (LSF)');
    expect(sentText).toContain('Vernon la Cock');
  });

  it('provides detailed modular homes breakdown when user asks for modular pods (option 1)', async () => {
    const stateMachine = new ConversationStateMachine();
    const sendSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage').mockResolvedValue('wamid.test');

    await conversationSessionStore.resetSession('27764862942', LCSH_VENDOR_ID);

    await stateMachine.handleInboundMessage(
      '27764862942',
      'Vernon la Cock',
      createInboundMessage('1'),
      { vendorId: LCSH_VENDOR_ID, displayPhoneNumber: '+15553180006' }
    );

    const sentText = sendSpy.mock.calls[0][1];
    expect(sentText).toContain('SmartSpace Modular Homes & Pods by LCSH');
    expect(sentText).toContain('Unit A (Cozy Retreat - 21.6 m²)');
    expect(sentText).toContain('Unit B (Practical Living - 21.6 m²)');
    expect(sentText).toContain('Unit E & F (Tranquil Twins)');
  });

  it('provides construction additions info when user asks about carports, pergolas or paving (option 3)', async () => {
    const stateMachine = new ConversationStateMachine();
    const sendSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage').mockResolvedValue('wamid.test');

    await conversationSessionStore.resetSession('27764862942', LCSH_VENDOR_ID);

    await stateMachine.handleInboundMessage(
      '27764862942',
      'Vernon la Cock',
      createInboundMessage('can you build a carport, pergola and do paving?'),
      { vendorId: LCSH_VENDOR_ID, displayPhoneNumber: '+15553180006' }
    );

    const sentText = sendSpy.mock.calls[0][1];
    expect(sentText).toContain('Specialist Construction, Additions & Outdoor Living');
    expect(sentText).toContain('Pergolas & Verandahs');
    expect(sentText).toContain('Carports & Garages');
    expect(sentText).toContain('Paving & Driveways');
    expect(sentText).toContain('Formwork & Foundations');
  });

  it('provides official quote questionnaire when user asks for quote or estimate (option 4)', async () => {
    const stateMachine = new ConversationStateMachine();
    const sendSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage').mockResolvedValue('wamid.test');

    await conversationSessionStore.resetSession('27764862942', LCSH_VENDOR_ID);

    await stateMachine.handleInboundMessage(
      '27764862942',
      'Vernon la Cock',
      createInboundMessage('I would like to get a quote for a home build in Albertinia'),
      { vendorId: LCSH_VENDOR_ID, displayPhoneNumber: '+15553180006' }
    );

    const sentText = sendSpy.mock.calls[0][1];
    expect(sentText).toContain('Request an Official LCSH Project Quote');
    expect(sentText).toContain('Project Type');
    expect(sentText).toContain('Stand / Location');
    expect(sentText).toContain('Architectural Plans');
  });

  it('provides energy and solar systems breakdown when asked about solar panels or gas geysers', async () => {
    const stateMachine = new ConversationStateMachine();
    const sendSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage').mockResolvedValue('wamid.test');

    await conversationSessionStore.resetSession('27764862942', LCSH_VENDOR_ID);

    await stateMachine.handleInboundMessage(
      '27764862942',
      'Vernon la Cock',
      createInboundMessage('Tell me about your solar panel and off grid energy systems'),
      { vendorId: LCSH_VENDOR_ID, displayPhoneNumber: '+15553180006' }
    );

    const sentText = sendSpy.mock.calls[0][1];
    expect(sentText).toContain('Sustainable Energy & Solar Systems by LCSH');
    expect(sentText).toContain('Solar Panel & Inverter Solutions');
    expect(sentText).toContain('Eco Gas Geyser Systems');
    expect(sentText).toContain('https://www.lcsh.co.za/energy/');
  });
});
