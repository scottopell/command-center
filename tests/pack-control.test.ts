import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import {startServer} from '../packages/backend/src/server.ts';
import {storageNamespace} from '../packages/packs/src/manifest.ts';
import {serviceRequest} from '../packages/cli/src/client.ts';
const exec=promisify(execFile);

// REQ-PK-007/014: actual CLI subprocesses, authenticated HTTP, compiler, worker and store.
test('agent CLI manages exact candidates without a native window and retains data on removal',async()=>{
  const root=await fs.mkdtemp(path.join(tmpdir(),'cc pack control ')),directory=path.join(root,'data'),source=path.join(root,'source');
  await fs.cp('examples/notes-pack',source,{recursive:true});const service=await startServer({directory,port:0});
  const cli=async(...args:string[])=>JSON.parse((await exec(process.execPath,['packages/cli/src/main.ts',...args,'--data-dir',directory])).stdout);
  const fails=(...args:string[])=>assert.rejects(cli(...args),(error:any)=>error.code===1&&JSON.parse(error.stderr).error.code!==undefined);
  try{
    assert.deepEqual(await cli('pack','list'),[]);await fails('pack','show','missing');
    const added=await cli('pack','add',source);assert.equal(added.id,'example.notes');assert.match(added.candidate,/^[a-f0-9]{64}$/);
    assert.equal((await cli('pack','show',added.id)).active,undefined);
    const built=await cli('pack','build',added.id);assert.equal(built.candidate,added.candidate);
    const tested=await cli('pack','test',source);assert.equal(tested.revision,built.candidate);
    const before=service.runtime.identity;await fails('pack','apply',added.id);
    await assert.rejects(cli('pack','apply',added.id,'--revision','0'.repeat(64)),(e:any)=>JSON.parse(e.stderr).error.code==='conflict');
    assert.equal(service.runtime.identity,before);assert.equal(service.runtime.admissionOpen,true);
    for(const payload of [null,{action:'apply',id:added.id},{action:'apply',id:added.id,revision:built.candidate,extra:true}]){
      const response=await fetch(service.connection.url+'/management/packs',{method:'POST',headers:{Authorization:`Bearer ${service.connection.token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
      assert.equal(response.status,400);assert.equal(service.runtime.identity,before);
    }
    const applied=await cli('pack','apply',added.id,'--revision',built.candidate);assert.equal(applied.pack.active,built.candidate);
    const identity=service.runtime.identity;await cli('pack','apply',added.id,'--revision',built.candidate);assert.equal(service.runtime.identity,identity);
    await cli('call','NOTES','save','--json',JSON.stringify({text:'Data survives agent activation'}));
    const ui=path.join(source,'ui.tsx');await fs.writeFile(ui,(await fs.readFile(ui,'utf8')).replace('Installed from an independent folder','Agent-built candidate'));
    const next=await cli('pack','build',added.id);assert.notEqual(next.candidate,built.candidate);
    await assert.rejects(cli('pack','apply',added.id,'--revision',built.candidate),(e:any)=>JSON.parse(e.stderr).error.code==='conflict');
    assert.equal((await cli('pack','show',added.id)).active,built.candidate);
    // A committed activation with an oversized reply is unknown, never a rejected write.
    const apply=service.packs.apply.bind(service.packs);let activations=0;
    service.packs.apply=async(id,revision)=>{activations++;return {...await apply(id,revision),extra:'x'.repeat(2*1024*1024)};};
    await assert.rejects(cli('pack','apply',added.id,'--revision',next.candidate),(e:any)=>JSON.parse(e.stderr).error.code==='outcome_unknown');
    assert.equal(activations,1);service.packs.apply=apply;
    assert.equal((await cli('pack','show',added.id)).active,next.candidate);
    assert.equal((await cli('call','NOTES','read','--json','{}'))[0].text,'Data survives agent activation');
    await cli('pack','remove',added.id);assert.equal((await cli('pack','show',added.id)).removed,true);
    await cli('pack','remove',added.id);await fails('pack','purge',added.id);
    assert.equal((await service.store.scoped(storageNamespace(added.id,'notes')).list('note/'))[0].value,'Data survives agent activation');
  }finally{await service.close();await fs.rm(root,{recursive:true,force:true});}
});

test('agent CLI exposes failed build diagnostics without activating the candidate',async()=>{
  const root=await fs.mkdtemp(path.join(tmpdir(),'cc bad pack ')),directory=path.join(root,'data'),source=path.join(root,'source');await fs.cp('examples/notes-pack',source,{recursive:true});
  const ui=path.join(source,'ui.tsx');await fs.writeFile(ui,(await fs.readFile(ui,'utf8')).replace('prepare({tail})','async prepare({tail})'));
  const service=await startServer({directory,port:0});
  try{
    await assert.rejects(exec(process.execPath,['packages/cli/src/main.ts','pack','add',source,'--data-dir',directory]),(error:any)=>{const reply=JSON.parse(error.stderr);return error.code===1&&reply.error.code==='build_failed'&&/prepare|Promise|synchronous/.test(reply.error.message);});
    const pack=service.packs.list()[0];assert.equal(pack.status,'failed');assert.equal(pack.active,undefined);assert.equal(service.runtime.admissionOpen,true);
  }finally{await service.close();await fs.rm(root,{recursive:true,force:true});}
});

test('management transport never retries a lost or malformed mutation response',async()=>{
  const directory=await fs.mkdtemp(path.join(tmpdir(),'cc control transport '));let calls=0,mode='disconnect';
  const server=createServer((request,response)=>{calls++;assert.equal(request.headers.authorization,'Bearer fixture-token');if(mode==='disconnect')request.socket.destroy();else response.end('null');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number};
  await fs.writeFile(path.join(directory,'connection.json'),JSON.stringify({url:`http://127.0.0.1:${address.port}`,token:'fixture-token'}));
  try{
    await assert.rejects(serviceRequest('/management/packs',{action:'remove',id:'example.notes'},directory,true),(error:any)=>error.code==='outcome_unknown');assert.equal(calls,1);
    mode='malformed';await assert.rejects(serviceRequest('/management/packs',{action:'apply',id:'example.notes',revision:'a'.repeat(64)},directory,true),(error:any)=>error.code==='outcome_unknown');assert.equal(calls,2);
    await assert.rejects(serviceRequest('/management/packs',undefined,directory),(error:any)=>error.code==='unavailable');assert.equal(calls,3);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(directory,{recursive:true,force:true});}
});
