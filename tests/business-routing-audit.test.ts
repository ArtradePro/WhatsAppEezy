import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConversationStateMachine } from '../src/services/state-machine/conversation-state-machine';
import { conversationSessionStore } from '../src/services/state-machine/conversation-session.store';
import { whatsAppClientService } from '../src/services/whatsapp/whatsapp-client.service';
const lcsh = '98aaaa11-7b3c-4ef9-881d-9ff0bd270f77';
function message(text: string) { return { from: '27000000001', id: 'audit', timestamp: '1', type: 'text' as const, text: { body: text } }; }
afterEach(() => vi.restoreAllMocks());
describe('Shared-number business routing integration', () => {
 it('rejects unknown recipient lines instead of selecting another company', async () => {
  await expect(new ConversationStateMachine().resolveTenantVendor({ displayPhoneNumber: 'unknown' })).rejects.toThrow('Unknown WhatsApp business line');
 });
 it('keeps LCSH as tenant while product follow-ups retain their support topic', async () => {
  const state = new ConversationStateMachine();
  const send = vi.spyOn(whatsAppClientService, 'sendTextMessage').mockResolvedValue('wamid.audit');
  await conversationSessionStore.resetSession('27000000001', lcsh);
  await state.handleInboundMessage('27000000001', 'Audit', message('Fungus No More'), { vendorId: lcsh });
  await state.handleInboundMessage('27000000001', 'Audit', message('What is the price?'), { vendorId: lcsh });
  const session = await conversationSessionStore.getSession('27000000001', 'Audit', { vendorId: lcsh });
  expect(session.vendorId).toBe(lcsh); expect(session.supportBusiness).toBe('higiene');
  expect(send.mock.calls.at(-1)?.[1]).toContain('need confirmation');
  await state.handleInboundMessage('27000000001', 'Audit', message('LCSH'), { vendorId: lcsh });
  expect((await conversationSessionStore.getSession('27000000001', 'Audit', { vendorId: lcsh })).supportBusiness).toBe('lcsh');
 });
 it('clarifies a mixed request without changing the existing topic', async () => {
  const state = new ConversationStateMachine();
  const send = vi.spyOn(whatsAppClientService, 'sendTextMessage').mockResolvedValue('wamid.audit');
  await conversationSessionStore.resetSession('27000000001', lcsh);
  await state.handleInboundMessage('27000000001', 'Audit', message('LCSH and Fungus No More'), { vendorId: lcsh });
  expect(send.mock.calls.at(-1)?.[1]).toContain('first?');
  expect((await conversationSessionStore.getSession('27000000001', 'Audit', { vendorId: lcsh })).vendorId).toBe(lcsh);
 });
});
