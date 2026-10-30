import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {QueryObserver} from '@tanstack/react-query';
import type {InvocationQueries as Session, QuerySessionOptions} from '../packages/ui/src/queries.tsx';

// Compile the React module for Node without a DOM; tests exercise its real QueryClient/MutationCache.
const compiled=await build({entryPoints:['packages/ui/src/queries.tsx'],bundle:true,platform:'node',format:'esm',write:false});
const {InvocationQueries}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64')) as typeof import('../packages/ui/src/queries.tsx');
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const group=(name:string)=>[{number:42,id:'fixture',name,products:[]}];
const identity={id:'fixture@example.test',name:'Fixture'};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function session(request:QuerySessionOptions['request'],isInteractive:QuerySessionOptions['isInteractive']=()=>true){return new InvocationQueries({request,isInteractive});}

// REQ-QL-001/002/009: normalized inputs deduplicate, and inactive cache outlives five minutes.
test('validated read keys deduplicate, stay cached past five minutes, and release on dispose',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  let calls=0;const pending=deferred<unknown>();
  const s=session(async()=>{calls++;return pending.promise;});
  try {
    const a=s.readClient('a').call('DRQS','list',{}),b=s.readClient('b').call('DRQS','list',{state:'open'});
    assert.equal(calls,1);pending.resolve([]);await Promise.all([a,b]);
    t.mock.timers.tick(6*60*1000);
    assert.deepEqual(s.queryClient.getQueryData(['DRQS','list',{state:'open'}]),[]);assert.equal(calls,1);
    // Retention preserves Back's content; a different entry's required resolution still reads fresh.
    assert.deepEqual(await s.readClient('next-entry').call('DRQS','list',{}),[]);assert.equal(calls,2);
    assert.equal(s.queryClient.getQueryCache().getAll()[0].gcTime,Infinity);assert.equal(s.diagnostics().queryCount,1);
    assert.throws(()=>s.queryOptions('a','DRQS','create' as any,{} as any),/registered read/);
    assert.throws(()=>s.mutation('a','DRQS','list' as any),/registered write/);
    s.dispose();assert.equal(s.diagnostics().queryCount,0);
    assert.throws(()=>s.readClient('a').call('DRQS','list',{}),/retired/);
  } finally {s.dispose();t.mock.timers.reset();}
});

// REQ-QL-005: query cancellation consumes AbortSignal and ignores an owner that finishes anyway.
test('cancelled reads remove their transport waiter and cannot overwrite a newer result',async()=>{
  const pending=deferred<unknown>();let waiters=0,signals:AbortSignal[]=[];
  const s=session(async(_fn,_op,_input,{signal})=>{
    waiters++;signals.push(signal!);
    return new Promise((resolve,reject)=>{
      const abort=()=>{waiters--;reject(Object.assign(new Error('cancelled'),{code:'cancelled'}));};
      signal!.addEventListener('abort',abort,{once:true});
      pending.promise.then(value=>{if(signal!.aborted)return;signal!.removeEventListener('abort',abort);waiters--;resolve(value);},reject);
    });
  });
  try {
    const read=s.readClient('entry').call('DRQS','groups',{});const rejected=assert.rejects(read);
    await s.queryClient.cancelQueries();await rejected;
    assert.equal(signals[0].aborted,true);assert.equal(waiters,0);
    s.queryClient.setQueryData(['DRQS','groups',{}],group('New'));
    pending.resolve(group('Old'));await flush();
    assert.equal((s.queryClient.getQueryData(['DRQS','groups',{}]) as any)[0].name,'New');
  } finally {s.dispose();}
});

// REQ-QL-003/005: a pre-commit initial request must not become the post-commit snapshot.
test('committed mutation cancels an old initial read before broad active invalidation',async()=>{
  const first=deferred<unknown>();let reads=0;
  const s=session(async(_fn,op,_input,{signal})=>{
    if(op==='setIdentity')return identity;
    reads++;if(reads>1)return group('After commit');
    return new Promise((resolve,reject)=>{signal!.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});first.promise.then(resolve,reject);});
  });
  const observer=new QueryObserver(s.queryClient,s.queryOptions('parent','DRQS','groups',{}));const release=observer.subscribe(()=>{});
  try {
    const write=s.mutation('child','DRQS','setIdentity');await write.mutateAsync(identity);await flush();
    first.resolve(group('Before commit'));await flush();
    assert.equal(reads,2);assert.equal((observer.getCurrentResult().data as any)?.[0].name,'After commit');
  } finally {release();s.dispose();}
});

// REQ-QL-003/004/006: callback ownership is invocation-wide, independent of popped UI/effects.
test('popped-origin write still invalidates parent, and failed refresh cannot fail committed mutation',async()=>{
  const write=deferred<unknown>();let current='child',reads=0,failRefresh=false;
  const s=session(async(_fn,op)=>{
    if(op==='setIdentity')return write.promise;
    reads++;if(failRefresh)throw new Error('owner unavailable');return group('Cached parent');
  },id=>id===current);
  await s.readClient('parent').call('DRQS','groups',{});
  const observer=new QueryObserver(s.queryClient,s.queryOptions('parent','DRQS','groups',{}));const release=observer.subscribe(()=>{});
  try {
    const action=s.mutation('child','DRQS','setIdentity');const pending=action.mutateAsync(identity);await flush();
    current='parent';failRefresh=true;write.resolve(identity);assert.deepEqual(await pending,identity);await flush();
    assert.equal(action.getSnapshot().isSuccess,true);assert.equal(action.getSnapshot().error,null);
    assert.equal(reads,2);assert.equal((observer.getCurrentResult().data as any)?.[0].name,'Cached parent');assert.equal(observer.getCurrentResult().error?.message,'owner unavailable');
  } finally {release();s.dispose();}
});

// REQ-QL-006: same entry handle survives unsubscribing, revalidation and resubscription.
test('pending/unknown attempts refuse duplicates; refresh never resets unknown',async()=>{
  const write=deferred<unknown>();let admissions=0;
  const s=session(async()=>{admissions++;return write.promise;});
  try {
    const action=s.mutation('entry','DRQS','setIdentity'),unsubscribe=action.subscribe(()=>{});
    const pending=action.mutateAsync(identity);const rejection=assert.rejects(pending,(e:any)=>e.code==='outcome_unknown');
    await assert.rejects(action.mutateAsync(identity),(e:any)=>e.code==='pending');await flush();assert.equal(admissions,1);
    unsubscribe();write.reject(Object.assign(new Error('Response lost'),{code:'outcome_unknown'}));await rejection;
    await s.revalidateVisible();const again=action.subscribe(()=>{});
    assert.equal(action.getSnapshot().isUnknown,true);await assert.rejects(action.mutateAsync(identity),(e:any)=>e.code==='outcome_unknown');assert.equal(admissions,1);again();
  } finally {s.dispose();}
});

// REQ-QL-006/007: a new explicit action after success/rejection is not an automatic retry.
test('new explicit attempts work after success/rejection, but inactive entries cannot dispatch',async()=>{
  let interactive=true,admissions=0;
  const s=session(async()=>{admissions++;if(admissions===1)throw Object.assign(new Error('Rejected'),{code:'validation'});return identity;},()=>interactive);
  try {
    const action=s.mutation('entry','DRQS','setIdentity');
    await assert.rejects(action.mutateAsync(identity));assert.equal(action.getSnapshot().status,'error');
    await action.mutateAsync(identity);await action.mutateAsync(identity);assert.equal(admissions,3);
    interactive=false;await assert.rejects(action.mutateAsync(identity),(e:any)=>e.code==='not_ready');assert.equal(admissions,3);
  } finally {s.dispose();}
});

// REQ-QL-008: new UI does not await an earlier admitted write, and old completion stays old.
test('dispose/relaunch starts a fresh snapshot without an old-mutation completion barrier',async()=>{
  const write=deferred<unknown>();let value='Before commit';
  const request:QuerySessionOptions['request']=async(_fn,op)=>op==='setIdentity'?write.promise:group(value);
  const old=session(request),fresh=session(request);
  try {
    const pending=old.mutation('old','DRQS','setIdentity').mutateAsync(identity);await flush();old.dispose();
    assert.equal((await fresh.readClient('fresh').call('DRQS','groups',{}))[0].name,'Before commit');
    value='After commit';write.resolve(identity);await pending;await flush();
    assert.equal((fresh.queryClient.getQueryData(['DRQS','groups',{}]) as any)[0].name,'Before commit');
    await fresh.queryClient.fetchQuery(fresh.queryOptions('fresh','DRQS','groups',{}));
    assert.equal((fresh.queryClient.getQueryData(['DRQS','groups',{}]) as any)[0].name,'After commit');assert.equal(old.diagnostics().queryCount,0);
  } finally {old.dispose();fresh.dispose();}
});

// Compile-time conformance: classification is derived from the same literal registry metadata.
function typedBoundaries(s:Session) {
  // @ts-expect-error a mutating operation cannot become a resolver query
  s.readClient('entry').call('DRQS','create',{});
  // @ts-expect-error a read operation cannot become a mutation handle
  s.mutation('entry','DRQS','list');
}

// REQ-QL-006, REQ-BW-009: malformed successful write data cannot establish non-commit.
test('invalid mutation result becomes blocked unknown rather than a retryable format rejection',async()=>{
  let calls=0;const s=session(async()=>{calls++;return {unexpected:true};});
  try {
    const action=s.mutation('entry','DRQS','setIdentity');
    await assert.rejects(action.mutateAsync(identity),(e:any)=>e.code==='outcome_unknown');
    await assert.rejects(action.mutateAsync(identity),(e:any)=>e.code==='outcome_unknown');
    assert.equal(calls,1);assert.equal(action.getSnapshot().isUnknown,true);
  } finally {s.dispose();}
});

// REQ-FF-002, REQ-NV-006, REQ-QL-004: repeated fresh entries do not silently reuse an old snapshot.
test('new entry revalidates a previously cached detail before admission without a second View fetch',async()=>{
  let calls=0,value='First entry';const next=deferred<unknown>();
  const s=session(async()=>{calls++;return calls===1?group(value):next.promise;});
  try {
    await s.readClient('first-entry').call('DRQS','groups',{});assert.equal(calls,1);
    // Model first entry being popped, owner state changing, and the same detail pushed anew.
    value='Owner changed';let resolved=false;
    const required=s.readClient('new-entry').call('DRQS','groups',{}).then(data=>{resolved=true;return data;});
    await flush();assert.equal(calls,2);assert.equal(resolved,false);
    assert.equal((s.queryClient.getQueryData(['DRQS','groups',{}]) as any)[0].name,'First entry');
    next.resolve(group(value));assert.equal((await required)[0].name,'Owner changed');
    // A prepared View attaches to the freshly resolved key; refetchOnMount:false avoids duplicate work.
    const observer=new QueryObserver(s.queryClient,s.queryOptions('new-entry','DRQS','groups',{}));const release=observer.subscribe(()=>{});
    try {await flush();assert.equal(calls,2);assert.equal((observer.getCurrentResult().data as any)[0].name,'Owner changed');}
    finally {release();}
  } finally {s.dispose();}
});
