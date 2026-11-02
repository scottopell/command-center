import {systemNamespace} from '../packages/backend/src/dispatcher.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startServer } from '../packages/backend/src/server.ts';
import { call } from '../packages/cli/src/client.ts';
import { Store } from '../packages/backend/src/store.ts';
import { createDispatcher } from '../packages/backend/src/dispatcher.ts';
const exec=promisify(execFile);
const agent={kind:'agent' as const,id:'integration-agent'};
const input={title:'Transport journey',body:'A report filed without a command-center window',group:42,actor:agent,requesters:[{kind:'employee' as const,id:'reporter@example.com'}]};
// REQ-BW-001/003/004/005/010/011, REQ-DR-009/010: fresh CLI processes and persisted restart.
test('authorized transport, independent CLI complete workflow and backend restart',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'command-center-transport-'));let service=await startServer({directory,port:0});
  try{
    const request={function:'DRQS',operation:'create',input};
    for(const headers of [{},{Authorization:'Bearer wrong'},{Authorization:`Bearer ${service.connection.token}`,Origin:'https://arbitrary.example'}] as Record<string,string>[]){
      const response=await fetch(service.connection.url+'/rpc',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(request)});assert.equal(response.status,401);
    }
    assert.deepEqual(await call('DRQS','list',{},directory),[]);
    assert.equal((await stat(path.join(directory,'connection.json'))).mode&0o777,0o600);
    assert.equal((await stat(path.join(directory,'token'))).mode&0o777,0o600);
    const cli=async(...args:string[])=>JSON.parse((await exec(process.execPath,['packages/cli/src/main.ts',...args,'--data-dir',directory],{cwd:process.cwd()})).stdout);
    const groups=await cli('drqs','groups');assert.equal(groups.length,4);
    const created=await cli('drqs','create','--title',input.title,'--body',input.body,'--group','42','--requester','employee:reporter@example.com','--actor','integration-agent');
    assert.equal(created.createdBy.kind,'agent');assert.equal(created.number,1);
    await cli('drqs','update','1','--comment','route and investigate','--group','44','--state','N','--owner','owner@example.com');
    await cli('drqs','update','1','--comment','fixed','--state','R','--clear-owner');
    const t=await cli('drqs','get','1');assert.equal(t.events.length,2);assert.equal(t.group,44);assert.equal(t.state,'R');assert.equal(t.owner,null);
    assert.equal((await cli('drqs','list')).length,0);assert.equal((await cli('drqs','list','--state','all','--search','investigate')).length,1);
    await assert.rejects(cli('drqs','create','--title','bad','--body','body','--group','42'),(e:any)=>e.code===1&&JSON.parse(e.stderr).error.code==='validation');
    const port=new URL(service.connection.url).port,token=service.connection.token;await service.close();service=await startServer({directory,port:Number(port)});
    assert.equal(service.connection.token,token);assert.deepEqual(await call('DRQS','get',{number:1},directory),t);
    await call('DRQS','setIdentity',{id:'human@example.com',name:'Human'},directory);
    const human=await call('DRQS','create',{title:'Human report',body:'Evidence',group:42},directory);assert.equal(human.createdBy.kind,'human');assert.equal(human.requesters[0].id,'human@example.com');
    const equivalent=await call('DRQS','create',{...input,title:'Human report',actor:{kind:'human',id:'human@example.com',name:'Human'},requesters:[{kind:'employee',id:'human@example.com',name:'Human'}]},directory);
    for(const field of ['title','body','group','type','state','owner'] as const){if(field!=='body')assert.deepEqual(equivalent[field],human[field]);}
  }finally{await service.close();await rm(directory,{recursive:true,force:true});}
});
// REQ-BW-009: a dropped write response cannot turn into a hidden second application request.
test('lost mutation response reports outcome_unknown and never retries',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'command-center-lost-'));let admissions=0;
  const store=new Store(path.join(directory,'data.sqlite')),dispatch=createDispatcher(store);
  const server=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);admissions++;await dispatch(JSON.parse(Buffer.concat(chunks).toString()));res.destroy();});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as any;
  await writeFile(path.join(directory,'connection.json'),JSON.stringify({url:`http://127.0.0.1:${address.port}`,token:'test'}));
  try{await assert.rejects(call('DRQS','create',input,directory),(e:any)=>e.code==='outcome_unknown');assert.equal(admissions,1);assert.equal((await dispatch({function:'DRQS',operation:'list',input:{}}) as any[]).length,1);}
  finally{await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();await rm(directory,{recursive:true,force:true});}
});
test('a fault after a persistent commit is outcome_unknown, not definite failure',async()=>{
  const store=new Store(':memory:');const scoped=store.scoped.bind(store);
  store.scoped=(namespace,committed)=>{const kv=scoped(namespace,committed);return {...kv,put:async(key,value)=>{await kv.put(key,value);throw new Error('fault after commit');}};};
  const dispatch=createDispatcher(store);
  try{await assert.rejects(dispatch({function:'DRQS',operation:'setIdentity',input:{id:'saved@example.com',name:'Saved'}}),(e:any)=>e.code==='outcome_unknown');assert.equal((await scoped(systemNamespace('drqs')).get('settings/identity') as any).id,'saved@example.com');}finally{store.close();}
});
