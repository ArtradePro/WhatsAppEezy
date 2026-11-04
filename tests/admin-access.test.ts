import { describe, it, expect, vi, afterEach } from 'vitest';
import { AdminAccessService, protectedAdminPath, type Principal } from '../src/services/auth/admin-access.service';
import { config } from '../src/config/env';
import { db } from '../src/database/db';
const owner: Principal = { userId:'11111111-1111-4111-8111-111111111111', isPlatformAdmin:false, memberships:[{ vendor_id:'company-a', role:'owner' }] };
const service = new AdminAccessService();
const original = { url:config.SUPABASE_URL, key:config.SUPABASE_ANON_KEY };
afterEach(() => { vi.restoreAllMocks(); config.SUPABASE_URL=original.url; config.SUPABASE_ANON_KEY=original.key; });
describe('Administrative identity and company permissions', () => {
 it('requires a bearer session, even in mock mode', async () => { await expect(service.authenticate()).rejects.toMatchObject({ status:401 }); });
 it('fails closed without provider configuration', async () => {
  config.SUPABASE_URL=''; config.SUPABASE_ANON_KEY='';
  await expect(service.authenticate('Bearer forged')).rejects.toMatchObject({ status:503 });
 });
 it('rejects expired or forged sessions using provider verification', async () => {
  config.SUPABASE_URL='https://accounts.example'; config.SUPABASE_ANON_KEY='test-key';
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}',{status:401}));
  await expect(service.authenticate('Bearer forged')).rejects.toMatchObject({status:401});
 });
 it('does not grant administrator rights from client user metadata', async () => {
  config.SUPABASE_URL='https://accounts.example'; config.SUPABASE_ANON_KEY='test-key';
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({ id:owner.userId, user_metadata:{ isPlatformAdmin:true } }),{status:200}));
  vi.spyOn(db,'getPool').mockReturnValue({query:vi.fn().mockResolvedValue({rows:[]})} as any);
  expect((await service.authenticate('Bearer verified-test')).isPlatformAdmin).toBe(false);
 });
 it('permits an owner to update safe fields in the assigned company', async () => {
  await expect(service.authorize(owner,'PATCH','/api/v1/vendors/company-a',{}, {business_name:'Higiene'})).resolves.toBeUndefined();
 });
 it('blocks changing another company by guessing its identifier', async () => {
  await expect(service.authorize(owner,'PATCH','/api/v1/vendors/company-b',{}, {business_name:'Other'})).rejects.toMatchObject({status:403});
 });
 it('blocks changing financial or platform settings through a company role', async () => {
  await expect(service.authorize(owner,'PATCH','/api/v1/vendors/company-a',{}, {commission_rate:0,bank_account_number:'other'})).rejects.toMatchObject({status:403});
 });
 it('allows a viewer to read only explicitly selected assigned-company orders', async () => {
  const viewer={...owner,memberships:[{vendor_id:'company-a',role:'viewer' as const}]};
  await expect(service.authorize(viewer,'GET','/api/vendor/orders',{vendor_id:'company-a'},{})).resolves.toBeUndefined();
  await expect(service.authorize(viewer,'GET','/api/vendor/orders',{},{})).rejects.toMatchObject({status:403});
 });
 it('uses the saved order company, not a company identifier in the request body', async () => {
  vi.spyOn(db,'getPool').mockReturnValue({query:vi.fn().mockResolvedValue({rows:[{vendor_id:'company-b'}]})} as any);
  await expect(service.authorize(owner,'PATCH','/api/vendor/orders/order-1/status',{}, {vendor_id:'company-a',status:'dispatched'})).rejects.toMatchObject({status:403});
 });
 it('does not let a staff member mark an order paid', async () => {
  await expect(service.authorize(owner,'PATCH','/api/vendor/orders/order-1/status',{}, {status:'paid'})).rejects.toMatchObject({status:403});
 });
 it('keeps payouts and credential configuration platform-only', async () => {
  await expect(service.authorize(owner,'POST','/api/v1/payouts/batches/generate',{},{})).rejects.toMatchObject({status:403});
  await expect(service.authorize({...owner,isPlatformAdmin:true},'POST','/api/v1/payouts/batches/generate',{},{})).resolves.toBeUndefined();
 });
 it('protects admin APIs while preserving existing provider callback routes', () => {
  expect(protectedAdminPath('/api/v1/vendors')).toBe(true);
  expect(protectedAdminPath('/api/v1/whatsapp/configure-gupshup')).toBe(true);
  expect(protectedAdminPath('/api/webhooks/whatsapp')).toBe(false);
  expect(protectedAdminPath('/api/webhooks/gupshup')).toBe(false);
  expect(protectedAdminPath('/api/v1/payments/payfast/itn')).toBe(false);
 });
});
