import { describe, it, expect, vi, afterEach } from 'vitest';
import axios from 'axios';
import { config } from '../src/config/env';
import { WhatsAppClientService } from '../src/services/whatsapp/whatsapp-client.service';
const originalMock = config.MOCK_EXTERNAL_APIS;
afterEach(() => { config.MOCK_EXTERNAL_APIS = originalMock; vi.restoreAllMocks(); });
describe('WhatsApp transport audit regressions', () => {
 it('mock mode never refreshes credentials or contacts a provider', async () => {
  config.MOCK_EXTERNAL_APIS = true;
  const client = new WhatsAppClientService();
  client.configureGupshup('test-key');
  const post = vi.spyOn(axios, 'post').mockRejectedValue(new Error('network must not be called'));
  const refresh = vi.spyOn(client, 'refreshGupshupCustomerAppTokenIfNeeded');
  expect(await client.sendTextMessage('27000000000', 'test')).toContain('wamid.mock_');
  expect(refresh).not.toHaveBeenCalled(); expect(post).not.toHaveBeenCalled();
 });
 it('concurrent replies keep the correct source number and brand', async () => {
  const client = new WhatsAppClientService();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = client.withInboundLine(undefined, '15553180006', async () => {
    await gate;
    return [(client as any).activeSourceNumber, (client as any).activeAppName];
  });
  const second = await client.withInboundLine(undefined, '15553443356', async () => {
    release();
    return [(client as any).activeSourceNumber, (client as any).activeAppName];
  });
  expect(await first).toEqual(['15553180006', 'LCSHSmartspace']);
  expect(second).toEqual(['15553443356', 'Higiene']);
 });
 it('provider failure is not disguised as successful delivery', async () => {
  config.MOCK_EXTERNAL_APIS = false;
  const client = new WhatsAppClientService();
  vi.spyOn(client, 'refreshGupshupCustomerAppTokenIfNeeded').mockResolvedValue('test-key');
  vi.spyOn(axios, 'post').mockRejectedValue(new Error('provider unavailable'));
  await expect(client.sendTextMessage('27000000000', 'test')).rejects.toThrow('delivery request failed');
 });
});
