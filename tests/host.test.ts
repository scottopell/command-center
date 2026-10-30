import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectServices, createHostWorker } from '../functions/host/worker.ts';
import type { WorkerContext } from '../packages/contracts/src/index.ts';

// REQ-HO-003/004/005: exact sources, joins, error precedence and partial failure.
test('HOST joins by Label, retains declarations without files, and diagnoses duplicates', async()=>{
  const home=await mkdtemp(path.join(tmpdir(),'command-center-host-'));
  try{
    await mkdir(path.join(home,'.local/etc'),{recursive:true});await mkdir(path.join(home,'Library/LaunchAgents'),{recursive:true});
    await writeFile(path.join(home,'.local/etc/toolkit.toml'),'[service.missing]\nsource="~/dev/missing"\n[service.example]\nprod="~/.local/opt/example"\n');
    const data:Record<string,any>={
      'different.plist':{Label:'com.scottopell.example',StartInterval:60},
      'external.plist':{Label:'org.example.external'},
      'dup1.plist':{Label:'duplicate',StartInterval:1},'dup2.plist':{Label:'duplicate'},
      'broken.plist':{}
    };
    for(const name of Object.keys(data))await writeFile(path.join(home,'Library/LaunchAgents',name),'fixture');
    const snapshot=await collectServices({home,plist:async f=>data[path.basename(f)],runtime:async()=> 'PID\tStatus\tLabel\n123\t4\tcom.scottopell.missing\n-\t0\tcom.scottopell.example\n-\t2\torg.example.external\n-\t0\tduplicate\n'});
    const rows=snapshot.services;
    assert.equal(rows.find(r=>r.label==='com.scottopell.missing')?.state,'Running');
    assert.equal(rows.find(r=>r.label==='com.scottopell.missing')?.definitionPresent,false);
    assert.equal(rows.find(r=>r.label==='com.scottopell.example')?.state,'Loaded · idle · scheduled');
    assert.equal(rows.find(r=>r.label==='org.example.external')?.state,'Loaded · stopped · last exit nonzero');
    assert.equal(rows.find(r=>r.label==='duplicate')?.definitionConflict,true);
    assert.equal(rows.find(r=>r.label==='duplicate')?.scheduled,null);
    assert(snapshot.sources.some(s=>s.path.endsWith('broken.plist')&&s.state==='discovery error'));
    const unavailable=await collectServices({home,plist:async f=>data[path.basename(f)],runtime:async()=>{throw new Error('unavailable')}});
    assert(unavailable.services.every(s=>s.loaded===null&&s.state==='Runtime unavailable'));
  }finally{await rm(home,{recursive:true,force:true});}
});

// REQ-HO-005: ownership is the worker's one bounded observation, not per-view copies.
test('HOST retains complete observations across refresh failures and recovers',async()=>{
  let step=0;
  const observations=[
    {observedAt:'2026-10-30T10:00:00Z',services:[{label:'fixture',state:'Running',pid:42}],sources:[{path:'fixture runtime',state:'ok'}]},
    {observedAt:'2026-10-30T10:01:00Z',services:[],sources:[{path:'fixture runtime',state:'unavailable',message:'read failed'}]},
    {observedAt:'2026-10-30T10:02:00Z',services:[{label:'fixture',state:'Not loaded',pid:null}],sources:[{path:'fixture runtime',state:'ok'}]},
  ];
  const worker=createHostWorker({collect:async()=>observations[step++],machine:async()=>({computerName:'fixture'}),environment:()=>({PATH:'/fixture'})});
  const read=()=>worker.handlers.snapshot({} as WorkerContext,{});
  const initial=await read();
  initial.services[0].pid=999; // Returning a result must not expose the retained object.
  const stale=await read();
  assert.equal(stale.observedAt,'2026-10-30T10:00:00Z');
  assert.equal(stale.services[0].pid,42);
  assert(stale.sources.some(s=>s.state==='stale'&&s.code==='observation_unavailable'));
  assert(stale.sources.some(s=>s.path==='fixture runtime'&&s.state==='unavailable'&&s.observedAt==='2026-10-30T10:01:00Z'));
  const recovered=await read();
  assert.equal(recovered.observedAt,'2026-10-30T10:02:00Z');
  assert.equal(recovered.services[0].state,'Not loaded');
  assert(!recovered.sources.some(s=>s.state==='stale'));
});

test('HOST initial partial inspection shows diagnostics without inventing a complete snapshot',async()=>{
  let healthy=false;
  const worker=createHostWorker({collect:async()=>({observedAt:healthy?'2026-10-30T11:01:00Z':'2026-10-30T11:00:00Z',services:[{label:'fixture',state:healthy?'Running':'Runtime unavailable'}],sources:[{path:'fixture plist',state:healthy?'ok':'discovery error',message:'fixture diagnostic'}]}),machine:async()=>({computerName:'fixture'}),environment:()=>({TZ:null})});
  const partial=await worker.handlers.snapshot({} as WorkerContext,{});
  assert.equal(partial.services[0].state,'Runtime unavailable');
  assert(partial.sources.some(s=>s.path==='HOST snapshot completeness'&&s.state==='unavailable'));
  assert(!partial.sources.some(s=>s.state==='stale'));
  healthy=true;await worker.handlers.snapshot({} as WorkerContext,{});
  healthy=false;const later=await worker.handlers.snapshot({} as WorkerContext,{});
  assert.equal(later.services[0].state,'Running');
  assert.equal(later.observedAt,'2026-10-30T11:01:00Z');
  assert(later.sources.some(s=>s.state==='stale'));
});

test('HOST bounds retained payload and refresh diagnostics',async()=>{
  let fail=false,oversized=false;
  const worker=createHostWorker({collect:async()=>({observedAt:'fixture',services:[{label:'fixture'}],sources:fail?Array.from({length:40},()=>({path:'p'.repeat(2000),state:'unavailable',message:'m'.repeat(2000)})):[{path:'fixture',state:'ok'}]}),machine:async()=>({name:oversized?'x'.repeat(1024*1024):'fixture'}),environment:()=>({})});
  await worker.handlers.snapshot({} as WorkerContext,{});oversized=true;
  await assert.rejects(()=>worker.handlers.snapshot({} as WorkerContext,{}),(error:any)=>error.code==='observation_unavailable'&&error.message.length<300);
  fail=true;const stale=await worker.handlers.snapshot({} as WorkerContext,{});
  assert.equal(stale.machine.name,'fixture');
  assert.equal(stale.sources.filter(s=>s.path==='p'.repeat(1024)).length,32);
  assert(stale.sources.every(s=>typeof s.message!=='string'||s.message.length<=512));
});

test('HOST missing configuration is absence, not a failed refresh',async()=>{
  const worker=createHostWorker({collect:async()=>({observedAt:'fixture',services:[],sources:[{path:'fixture config',state:'not configured'},{path:'fixture runtime',state:'ok'}]}),machine:async()=>({}),environment:()=>({})});
  const result=await worker.handlers.snapshot({} as WorkerContext,{});
  assert(!result.sources.some(s=>s.state==='stale'||s.state==='unavailable'));
});

test('HOST late earlier collections cannot regress the retained complete observation',async()=>{
  const observation=(time:string,state='ok')=>({observedAt:time,services:[{label:time}],sources:[{path:'fixture',state}]});
  let finishFirst!:(value:ReturnType<typeof observation>)=>void,step=0;
  const first=new Promise<ReturnType<typeof observation>>(resolve=>{finishFirst=resolve;});
  const worker=createHostWorker({collect:()=>++step===1?first:Promise.resolve(step===2?observation('newer'):observation('failed','unavailable')),machine:async()=>({}),environment:()=>({})});
  const early=worker.handlers.snapshot({} as WorkerContext,{});
  await worker.handlers.snapshot({} as WorkerContext,{});
  finishFirst(observation('earlier'));await early;
  const retained=await worker.handlers.snapshot({} as WorkerContext,{});
  assert.equal(retained.observedAt,'newer');
  assert.equal(retained.services[0].label,'newer');
});
