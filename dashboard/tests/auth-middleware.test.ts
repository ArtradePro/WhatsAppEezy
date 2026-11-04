import { describe,it,expect,vi,afterEach,beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const mocked=vi.hoisted(()=>({ getUser:vi.fn(), config:vi.fn() }));
vi.mock('@supabase/ssr',()=>({createServerClient:()=>({auth:{getUser:mocked.getUser}})}));
vi.mock('../lib/auth/config',()=>({authConfiguration:mocked.config}));
import { middleware } from '../middleware';
beforeEach(()=>{mocked.config.mockReturnValue({url:'https://accounts.example',key:'test'});mocked.getUser.mockResolvedValue({data:{user:null},error:null});});
afterEach(()=>vi.clearAllMocks());
describe('Dashboard entry protection',()=>{
 it('shows sign-in when the project is not configured',async()=>{
  mocked.config.mockReturnValue(null);
  const response=await middleware(new NextRequest('http://localhost:3002/'));
  expect(response.headers.get('location')).toBe('http://localhost:3002/login'); expect(mocked.getUser).not.toHaveBeenCalled();
 });
 it('does not trust a forged session cookie',async()=>{
  const response=await middleware(new NextRequest('http://localhost:3002/',{headers:{cookie:'session=admin'}}));
  expect(response.headers.get('location')).toContain('/login');expect(mocked.getUser).toHaveBeenCalled();
 });
 it('returns an authentication error for protected API requests',async()=>{
  expect((await middleware(new NextRequest('http://localhost:3002/api/vendor/orders'))).status).toBe(401);
 });
 it('keeps unscoped legacy financial adapters unavailable even after sign-in',async()=>{
  mocked.getUser.mockResolvedValue({data:{user:{id:'verified'}},error:null});
  expect((await middleware(new NextRequest('http://localhost:3002/api/vendor/payouts/export'))).status).toBe(503);
 });
 it('allows sign-out without requiring an unexpired identity',async()=>{
  expect((await middleware(new NextRequest('http://localhost:3002/api/auth/logout',{method:'POST'}))).status).toBe(200);
  expect(mocked.getUser).not.toHaveBeenCalled();
 });
});
