import { describe,it,expect,beforeAll,afterAll,vi } from 'vitest';
import { createFastifyApp } from '../src/fastify-app';
import { adminAccessService } from '../src/services/auth/admin-access.service';
const app=createFastifyApp();
beforeAll(async()=>{await app.ready();});
afterAll(async()=>{await app.close();});
describe('Backend HTTP access guard',()=>{
 it('blocks vendor reads without a verified session',async()=>{
  const response=await app.inject({method:'GET',url:'/api/v1/virtual-numbers'});
  expect(response.statusCode).toBe(401);
 });
 it('does not require an admin session for the health probe',async()=>{
  expect((await app.inject({method:'GET',url:'/health'})).statusCode).toBe(200);
 });
 it('permits an authorized platform action after both checks succeed',async()=>{
  const auth=vi.spyOn(adminAccessService,'authenticate').mockResolvedValue({userId:'test',isPlatformAdmin:true,memberships:[]});
  const authorize=vi.spyOn(adminAccessService,'authorize').mockResolvedValue();
  try {
   const response=await app.inject({method:'GET',url:'/api/v1/virtual-numbers',headers:{authorization:'Bearer test'}});
   expect(response.statusCode).toBe(200);expect(authorize).toHaveBeenCalled();
  } finally {auth.mockRestore();authorize.mockRestore();}
 });
});
