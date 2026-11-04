import { describe,it,expect,beforeAll,afterAll } from 'vitest';
import { createApp } from '../src/app';
import type { Server } from 'node:http';
let server:Server;let base='';
beforeAll(async()=>{
 const app=createApp();await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',()=>{const address=server.address();if(address && typeof address==='object')base='http://127.0.0.1:'+address.port;resolve();});});
});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
describe('Express administration protection',()=>{
 it('rejects anonymous access before returning any vendor data',async()=>{
  const response=await fetch(base+'/api/v1/vendors');expect(response.status).toBe(401);expect((await response.json() as any).vendors).toBeUndefined();
 });
});
