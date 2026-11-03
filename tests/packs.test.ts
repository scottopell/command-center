import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {SourceMap} from 'node:module';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {buildPack} from '../packages/packs/src/builder.ts';
import {startServer} from '../packages/backend/src/server.ts';
import {storageNamespace,assertNoConflicts} from '../packages/packs/src/manifest.ts';

async function fixture(){const root=await fs.mkdtemp(path.join(tmpdir(),'cc pack test ')),source=path.join(root,'source');await fs.cp('examples/notes-pack',source,{recursive:true});return {root,source,builds:path.join(root,'builds'),toolchain:path.resolve('dist/toolchain')};}
async function until(check:()=>boolean){const deadline=Date.now()+10000;while(!check()){if(Date.now()>deadline)throw new Error('Timed out waiting for fixture state');await new Promise(r=>setTimeout(r,5));}}

// REQ-PK-002/003: real compiler, local SDK and self-contained artifacts, not a mocked registry.
test('pack builds use the standalone SDK and reject source/dependency escapes',async()=>{
  const f=await fixture();
  try{
    const artifact=await buildPack(f.source,f.builds,f.toolchain);assert.equal(artifact.id,'example.notes');assert.deepEqual(artifact.functions[0].operations,{read:false,save:true});
    const web=await fs.readFile(path.join(f.builds,artifact.revision,'functions/notes/web/app.js'),'utf8');assert.ok(web.includes('Installed from an independent folder'));assert.ok(!web.includes('Development request system'));
    // Separate linked maps retain source content without inflating the launch payload.
    assert.match(web,/sourceMappingURL=app\.js\.map/);
    const webRoot=path.join(f.builds,artifact.revision,'functions/notes/web');
    assert.match(web,/@command-center\/runtime\//);assert.ok(Buffer.byteLength(web)<50000);
    const browserMap=JSON.parse(await fs.readFile(path.join(webRoot,'app.js.map'),'utf8'));
    assert.ok(!browserMap.sources.some((file:string)=>file.includes('/sdk/src/')||file.includes('/react-dom/')));
    for(const file of ['app.js']){
      const map=JSON.parse(await fs.readFile(path.join(webRoot,file+'.map'),'utf8'));
      assert.equal(map.version,3);assert.ok(map.mappings.length);assert.equal(map.sourcesContent.length,map.sources.length);
      assert.ok(map.sourcesContent.every((source:unknown)=>typeof source==='string'));
    }
    const styleMap=JSON.parse(await fs.readFile(path.join(f.toolchain,'runtime/browser/style.css.map'),'utf8'));assert.equal(styleMap.version,3);assert.ok(styleMap.mappings.length);
    const sourceMap=new SourceMap(JSON.parse(await fs.readFile(path.join(webRoot,'app.js.map'),'utf8')));
    const beforeLiteral=web.slice(0,web.indexOf('Installed from an independent folder')).split('\n');
    const original=sourceMap.findEntry(beforeLiteral.length-1,beforeLiteral.at(-1)!.length);
    assert.ok('originalSource' in original);assert.match(String(original.originalSource),/ui\.tsx$/);
    await fs.symlink('/tmp',path.join(f.source,'outside'));await assert.rejects(buildPack(f.source,f.builds,f.toolchain),/symlink/);await fs.unlink(path.join(f.source,'outside'));
    await fs.writeFile(path.join(f.source,'package.json'),JSON.stringify({scripts:{build:'arbitrary-code'}}));await assert.rejects(buildPack(f.source,f.builds,f.toolchain),/hooks/);await fs.unlink(path.join(f.source,'package.json'));
    const ui=await fs.readFile(path.join(f.source,'ui.tsx'),'utf8');await fs.writeFile(path.join(f.source,'ui.tsx'),ui.replace('prepare({tail})','async prepare({tail})'));await assert.rejects(buildPack(f.source,f.builds,f.toolchain),/prepare|Promise|synchronous/);
    const legacy=JSON.parse(await fs.readFile(path.join(f.source,'command-center.json'),'utf8'));delete legacy.apiEpoch;legacy.sdkVersion='1.0.0';await fs.writeFile(path.join(f.source,'command-center.json'),JSON.stringify(legacy));
    await assert.rejects(buildPack(f.source,f.builds,f.toolchain),/Update required.*missing/);
  }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

// REQ-PK-011: an unchanged installed artifact uses a new SDK, never edited source.
test('same-epoch host SDK updates reach installed workers without rebuilding or applying source',async()=>{
  const f=await fixture(),directory=path.join(f.root,'data');let service=await startServer({directory,port:0}),open=true;
  try{
    await service.packs.add(f.source);await service.packs.apply('example.notes');
    await service.runtime.call({function:'NOTES',operation:'save',input:{text:'Original data'}});
    const before=(await service.packs.catalog()).commands.find(f=>f.mnemonic==='NOTES')!;
    const workerFile=path.join(directory,'packs/builds',before.revision,'worker.mjs'),original=await fs.readFile(workerFile,'utf8');
    const checkedWith=before.checkedWith;await service.close();open=false;
    await fs.appendFile(path.join(f.source,'worker.ts'),"\nthrow new Error('UNAPPLIED SOURCE MUST NOT RUN');\n");
    await fs.rename(f.source,f.source+' unavailable');
    const resources=path.join(f.root,'new-host'),sdk=path.join(resources,'toolchain/runtime');await fs.cp(path.join(f.toolchain,'runtime'),sdk,{recursive:true});
    await fs.rename(path.join(sdk,'node/contracts.mjs'),path.join(sdk,'node/contracts-base.mjs'));
    await fs.writeFile(path.join(sdk,'node/contracts.mjs'),`export * from './contracts-base.mjs';import {defineWorker as original} from './contracts-base.mjs';export function defineWorker(contract,handlers){const worker=original(contract,handlers);return {...worker,handlers:{...worker.handlers,read:async(ctx,input)=>(await handlers.read(ctx,input)).map(row=>({...row,text:'SDK B: '+row.text}))}}};`);
    const manifest=JSON.parse(await fs.readFile(path.join(sdk,'runtime.json'),'utf8'));manifest.fingerprint=createHash('sha256').update(manifest.fingerprint+'fixture-B').digest('hex');await fs.writeFile(path.join(sdk,'runtime.json'),JSON.stringify(manifest));
    service=await startServer({directory,port:0,resources});open=true;
    const after=(await service.packs.catalog()).commands.find(f=>f.mnemonic==='NOTES')!;
    assert.equal(after.revision,before.revision);assert.equal(after.checkedWith,checkedWith);assert.equal(after.unavailableReason,undefined);
    assert.notEqual(checkedWith,(await service.packs.catalog()).runtime.fingerprint);
    assert.equal(await fs.readFile(workerFile,'utf8'),original);
    const reply=await service.runtime.call({function:'NOTES',operation:'read',input:{},revision:before.revision});assert.equal(reply.result[0].text,'SDK B: Original data');
    assert.equal((await service.store.scoped(storageNamespace('example.notes','notes')).list('note/'))[0].value,'Original data');
  }finally{if(open)await service.close();await fs.rm(f.root,{recursive:true,force:true});}
});

// REQ-PK-012: incompatibility cannot execute worker startup, block other functions, or erase data.
test('missing and mismatched installed epochs stay unavailable until a compatible pack is applied',async()=>{
  for(const epoch of [undefined,99]){
    const f=await fixture(),directory=path.join(f.root,'data');let service=await startServer({directory,port:0}),open=true;
    try{
      await service.packs.add(f.source);await service.packs.apply('example.notes');
      await service.runtime.call({function:'NOTES',operation:'save',input:{text:'Retain across epoch change'}});
      const active=service.packs.list()[0].active!,artifactFile=path.join(directory,'packs/builds',active,'artifact.json');await service.close();open=false;
      const artifact=JSON.parse(await fs.readFile(artifactFile,'utf8'));artifact.apiEpoch=epoch;await fs.writeFile(artifactFile,JSON.stringify(artifact));
      await fs.writeFile(path.join(directory,'packs/builds',active,'worker.mjs'),"throw new Error('INCOMPATIBLE WORKER MUST NOT EXECUTE');");
      service=await startServer({directory,port:0});open=true;
      assert.match(service.packs.list()[0].incompatible!,/Update required/);
      assert.match((await service.packs.catalog()).commands.find(f=>f.mnemonic==='NOTES')!.unavailableReason!,/Update required/);
      await assert.rejects(service.runtime.call({function:'NOTES',operation:'read',input:{}}),(e:any)=>e.code==='update_required');
      const groups=await service.runtime.call({function:'DRQS',operation:'groups',input:{}});assert.ok(groups.result.length>0);
      await assert.rejects(service.packs.apply('example.notes'),/Update required/);
      const sourceManifest=JSON.parse(await fs.readFile(path.join(f.source,'command-center.json'),'utf8'));sourceManifest.apiEpoch=99;await fs.writeFile(path.join(f.source,'command-center.json'),JSON.stringify(sourceManifest));
      await assert.rejects(buildPack(f.source,f.builds,f.toolchain),/Update required/);
      sourceManifest.apiEpoch=1;await fs.writeFile(path.join(f.source,'command-center.json'),JSON.stringify(sourceManifest));await fs.appendFile(path.join(f.source,'worker.ts'),'\n// compatible rebuild\n');
      await service.packs.build('example.notes');await service.packs.apply('example.notes');
      assert.equal(service.packs.list()[0].incompatible,undefined);
      const restored=await service.runtime.call({function:'NOTES',operation:'read',input:{}});assert.equal(restored.result[0].text,'Retain across epoch change');
      await assert.rejects(service.runtime.call({function:'NOTES',operation:'read',input:{},apiEpoch:99}),(e:any)=>e.code==='update_required');
    }finally{if(open)await service.close();await fs.rm(f.root,{recursive:true,force:true});}
  }
});

// REQ-PK-001/004/005/007/009: registered source is not the execution location or storage identity.
test('installed packs survive missing source, reject collisions, retain isolated data and recover failed activation',async()=>{
  const f=await fixture(),directory=path.join(f.root,'data');const service=await startServer({directory,port:0});
  const rpc=async(operation:string,input:unknown={})=>{
    const res=await fetch(service.connection.url+'/rpc',{method:'POST',headers:{Authorization:`Bearer ${service.connection.token}`,'Content-Type':'application/json'},body:JSON.stringify({function:'NOTES',operation,input})});return res.json() as Promise<any>;
  };
  try{
    await service.packs.add(f.source);assert.equal(service.packs.list()[0].status,'ready');assert.equal((await rpc('read')).error.code,'not_found');
    const checked=await promisify(execFile)(process.execPath,['packages/cli/src/main.ts','pack','check-installed','--data-dir',directory]);assert.deepEqual(JSON.parse(checked.stdout),[{id:'example.notes',ok:true}]);
    const prior=service.runtime.identity;await service.packs.apply('example.notes');assert.notEqual(service.runtime.identity,prior);
    await assert.rejects(service.runtime.call({function:'NOTES',operation:'save',input:{text:'Never admitted'},revision:'stale'}),(e:any)=>e.code==='conflict');
    assert.deepEqual((await rpc('save',{text:'Original owner data'})).result,{saved:true});
    const moved=path.join(f.root,'source moved');await fs.rename(f.source,moved);
    assert.equal((await rpc('read')).result[0].text,'Original owner data');
    const other=path.join(f.root,'other');await fs.cp(moved,other,{recursive:true});const manifest=JSON.parse(await fs.readFile(path.join(other,'command-center.json'),'utf8'));manifest.id='example.other';await fs.writeFile(path.join(other,'command-center.json'),JSON.stringify(manifest));
    await assert.rejects(service.packs.add(other),/NOTES.*both/);assert.equal((await rpc('read')).result[0].text,'Original owner data');
    await service.packs.remove('example.notes');await service.packs.build('example.other');await service.packs.apply('example.other');assert.deepEqual((await rpc('read')).result,[]);
    assert.notEqual(storageNamespace('example.notes','notes'),storageNamespace('example.other','notes'));
    await service.packs.remove('example.other');await service.packs.add(moved);await service.packs.apply('example.notes');assert.equal((await rpc('read')).result[0].text,'Original owner data');
    // A new candidate can compile but still fail at process startup. No candidate requests are admitted.
    await fs.appendFile(path.join(moved,'worker.ts'),'\n// candidate revision\n');await service.packs.build('example.notes');const candidate=service.packs.list().find(p=>p.id==='example.notes')!.candidate!;
    const identity=service.runtime.identity;await fs.writeFile(path.join(directory,'packs/builds',candidate,'worker.mjs'),"throw new Error('injected startup failure');");
    await assert.rejects(service.packs.apply('example.notes'),/injected startup failure/);assert.equal(service.runtime.identity,identity);assert.equal(service.runtime.admissionOpen,true);assert.equal((await rpc('read')).result[0].text,'Original owner data');
    await assert.rejects(service.packs.purge('example.notes'),/Remove the pack/);
    await service.packs.remove('example.notes');await service.packs.purge('example.notes');assert.deepEqual(await service.store.scoped(storageNamespace('example.notes','notes')).list(),[]);
  }finally{await service.close();await fs.rm(f.root,{recursive:true,force:true});}
});

// REQ-PK-006: a disconnected HTTP client does not retire its admitted handler.
test('maintenance drains admitted handlers after disconnect, rejects new requests, and postpones on deadline',async()=>{
  const f=await fixture();const worker=path.join(f.source,'worker.ts');await fs.writeFile(worker,(await fs.readFile(worker,'utf8')).replace("await kv.put('note/'","await new Promise(resolve=>setTimeout(resolve,600));await kv.put('note/'"));
  const service=await startServer({directory:path.join(f.root,'data'),port:0});
  try{
    await service.packs.add(f.source);await service.packs.apply('example.notes');
    const controller=new AbortController();const write=fetch(service.connection.url+'/rpc',{method:'POST',headers:{Authorization:`Bearer ${service.connection.token}`,'Content-Type':'application/json'},body:JSON.stringify({function:'NOTES',operation:'save',input:{text:'Committed after caller disconnect'}}),signal:controller.signal}).catch(()=>undefined);
    await until(()=>service.runtime.activeHandlers===1);controller.abort();await write;
    await assert.rejects(service.runtime.pauseAndDrain(15),/postponed/);assert.equal(service.runtime.admissionOpen,true);assert.equal(service.runtime.activeHandlers,1);
    const drain=service.runtime.pauseAndDrain(2000);await assert.rejects(service.runtime.call({function:'NOTES',operation:'read',input:{}}),(e:any)=>e.code==='maintenance');await drain;
    assert.equal(service.runtime.activeHandlers,0);service.runtime.resume();const reply=await service.runtime.call({function:'NOTES',operation:'read',input:{}});assert.equal(reply.result[0].text,'Committed after caller disconnect');
  }finally{await service.close();await fs.rm(f.root,{recursive:true,force:true});}
});
