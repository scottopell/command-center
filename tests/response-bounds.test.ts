import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startServer,MAX_RPC_RESPONSE_BYTES} from '../packages/backend/src/server.ts';
import {call} from '../packages/cli/src/client.ts';
import type {JsonValue,Ticket} from '../packages/contracts/src/index.ts';

// REQ-QL-009, REQ-BW-004, REQ-BW-009: actual authenticated HTTP cannot ship unbounded results.
test('serialized RPC cap bounds large reads and reports oversized committed write as unknown',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'command-center-response-cap-'));
  const service=await startServer({directory,port:0});
  try {
    const ticket=await call('DRQS','create',{title:'Bounded fixture',body:'Fixture',group:42,actor:{kind:'agent',id:'fixture'},requesters:[{kind:'customer',id:'fixture'}]},directory);
    const key=`ticket/${String(ticket.number).padStart(16,'0')}`;
    // Stored historical data may exceed today's input limits; no app/database outside this fixture is used.
    const large:Ticket={...ticket,body:'界'.repeat(Math.ceil(MAX_RPC_RESPONSE_BYTES/3))};
    await service.store.scoped('DRQS').put(key,large as unknown as JsonValue);
    const rpc=async(operation:string,input:unknown)=>{
      const response=await fetch(service.connection.url+'/rpc',{method:'POST',headers:{Authorization:`Bearer ${service.connection.token}`,'Content-Type':'application/json'},body:JSON.stringify({function:'DRQS',operation,input})});
      const text=await response.text();assert.ok(Buffer.byteLength(text)<1024);return {status:response.status,body:JSON.parse(text)};
    };
    const read=await rpc('get',{number:ticket.number});assert.equal(read.status,500);assert.equal(read.body.error.code,'response_too_large');
    assert.equal((await call('DRQS','list',{},directory)).length,1); // Its small projected summary still works.
    const write=await rpc('update',{number:ticket.number,comment:'Exactly one committed comment'});
    assert.equal(write.status,500);assert.equal(write.body.error.code,'outcome_unknown');assert.match(write.body.error.message,/No retry/);
    const persisted=await service.store.scoped('DRQS').get(key) as unknown as Ticket;
    assert.equal(persisted.events.length,1);assert.equal(persisted.events[0].comment,'Exactly one committed comment');
    await assert.rejects(call('DRQS','get',{number:ticket.number},directory),(error:any)=>error.code==='response_too_large');
    await service.store.scoped('DRQS').put(key,{...persisted,title:large.body} as unknown as JsonValue);
    const list=await rpc('list',{});assert.equal(list.body.error.code,'response_too_large');
  } finally {await service.close();await rm(directory,{recursive:true,force:true});}
});
