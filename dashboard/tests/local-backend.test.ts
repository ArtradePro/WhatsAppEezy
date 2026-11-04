import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('../lib/auth/access', () => {
 class AccessError extends Error { constructor(public status: number, message: string) { super(message); } }
 return { AccessError, authenticatedBackendToken: vi.fn() };
});
import { authenticatedBackendToken, AccessError } from '../lib/auth/access';
import { forwardLocalBackend } from '../lib/local-backend';
import { PATCH } from '../app/api/vendor/orders/[id]/status/route';
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
beforeEach(() => { vi.mocked(authenticatedBackendToken).mockResolvedValue({ token: 'test-session' } as any); });
function request(body = { status: 'dispatched' }, origin?: string) {
 return new NextRequest('http://localhost:3002/api/vendor/orders/audit/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
}
describe('Authenticated dashboard forwarding', () => {
 it('rejects unauthenticated requests before contacting the backend', async () => {
  vi.mocked(authenticatedBackendToken).mockRejectedValue(new AccessError(401, 'Please sign in.'));
  const fetch = vi.spyOn(globalThis, 'fetch');
  expect((await forwardLocalBackend(request(), '/api/v1/vendors/audit')).status).toBe(401); expect(fetch).not.toHaveBeenCalled();
 });
 it('rejects cross-origin writes', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  expect((await forwardLocalBackend(request(undefined, 'https://other.example'), '/api/v1/vendors/audit')).status).toBe(403); expect(fetch).not.toHaveBeenCalled();
 });
 it('rejects insecure remote backends', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('BACKEND_API_URL', 'http://example.com');
  const fetch = vi.spyOn(globalThis, 'fetch');
  expect((await forwardLocalBackend(request(), '/api/v1/vendors/audit')).status).toBe(503); expect(fetch).not.toHaveBeenCalled();
 });
 it('forwards the verified session to a secure backend and preserves errors', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('BACKEND_API_URL', 'https://backend.example');
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 404 }));
  expect((await PATCH(request(), { params: { id: 'order-123' } })).status).toBe(404);
  expect(String(fetch.mock.calls[0][0])).toBe('https://backend.example/api/vendor/orders/order-123/status');
  expect((fetch.mock.calls[0][1]?.headers as Record<string,string>).Authorization).toBe('Bearer test-session');
 });
 it('does not disguise an unavailable service as a successful save', async () => {
  vi.stubEnv('NODE_ENV','development'); vi.stubEnv('BACKEND_API_URL','http://localhost:3000');
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
  expect((await forwardLocalBackend(request(), '/api/v1/vendors/audit')).status).toBe(503);
 });
 it('rejects invalid dispatch transitions', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  expect((await PATCH(request({ status: 'paid' }), { params: { id: 'order-123' } })).status).toBe(400); expect(fetch).not.toHaveBeenCalled();
 });
});
