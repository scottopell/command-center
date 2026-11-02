import {drqsContract,hostContract} from '../packages/contracts/src/builtins.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {QueryObserver} from '@tanstack/react-query';
import type {InvocationQueries as Session, QuerySessionOptions} from '../packages/sdk/src/queries.tsx';

// Compile the React module for Node without a DOM; tests exercise its real QueryClient/MutationCache.
const compiled=await build({entryPoints:['packages/sdk/src/queries.tsx'],bundle:true,platform:'node',format:'esm',write:false});
const {InvocationQueries}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64')) as typeof import('../packages/sdk/src/queries.tsx');
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
    const a=s.readClient('a').call(drqsContract,'list',{}),b=s.readClient('b').call(drqsContract,'list',{state:'open'});
    assert.equal(calls,1);pending.resolve([]);await Promise.all([a,b]);
    t.mock.timers.tick(6*60*1000);
    assert.deepEqual(s.queryClient.getQueryData(['DRQS','list',{state:'open'}]),[]);assert.equal(calls,1);
    // Retention preserves Back's content; a different entry's required resolution still reads fresh.
    assert.deepEqual(await s.readClient('next-entry').call(drqsContract,'list',{}),[]);assert.equal(calls,2);
    assert.equal(s.queryClient.getQueryCache().getAll()[0].gcTime,Infinity);assert.equal(s.diagnostics().queryCount,1);
    assert.throws(()=>s.queryOptions('a',drqsContract,'create' as any,{} as any),/registered read/);
    assert.throws(()=>s.mutation('a',drqsContract,'list' as any),/registered write/);
    s.dispose();assert.equal(s.diagnostics().queryCount,0);
    assert.throws(()=>s.readClient('a').call(drqsContract,'list',{}),/retired/);
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
    const read=s.readClient('entry').call(drqsContract,'groups',{});const rejected=assert.rejects(read);
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
  const observer=new QueryObserver(s.queryClient,s.queryOptions('parent',drqsContract,'groups',{}));const release=observer.subscribe(()=>{});
  try {
    const write=s.mutation('child',drqsContract,'setIdentity');await write.mutateAsync(identity);await flush();
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
  await s.readClient('parent').call(drqsContract,'groups',{});
  const observer=new QueryObserver(s.queryClient,s.queryOptions('parent',drqsContract,'groups',{}));const release=observer.subscribe(()=>{});
  try {
    const action=s.mutation('child',drqsContract,'setIdentity');const pending=action.mutateAsync(identity);await flush();
    const beforeRefresh=reads;current='parent';failRefresh=true;write.resolve(identity);assert.deepEqual(await pending,identity);await flush();
    assert.equal(action.getSnapshot().isSuccess,true);assert.equal(action.getSnapshot().error,null);
    assert.equal(reads,beforeRefresh+1);assert.equal((observer.getCurrentResult().data as any)?.[0].name,'Cached parent');assert.equal(observer.getCurrentResult().error?.message,'owner unavailable');
  } finally {release();s.dispose();}
});

// REQ-QL-006: same entry handle survives unsubscribing, revalidation and resubscription.
test('pending/unknown attempts refuse duplicates; refresh never resets unknown',async()=>{
  const write=deferred<unknown>();let admissions=0;
  const s=session(async()=>{admissions++;return write.promise;});
  try {
    const action=s.mutation('entry',drqsContract,'setIdentity'),unsubscribe=action.subscribe(()=>{});
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
    const action=s.mutation('entry',drqsContract,'setIdentity');
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
    const pending=old.mutation('old',drqsContract,'setIdentity').mutateAsync(identity);await flush();old.dispose();
    assert.equal((await fresh.readClient('fresh').call(drqsContract,'groups',{}))[0].name,'Before commit');
    value='After commit';write.resolve(identity);await pending;await flush();
    assert.equal((fresh.queryClient.getQueryData(['DRQS','groups',{}]) as any)[0].name,'Before commit');
    await fresh.queryClient.fetchQuery(fresh.queryOptions('fresh',drqsContract,'groups',{}));
    assert.equal((fresh.queryClient.getQueryData(['DRQS','groups',{}]) as any)[0].name,'After commit');assert.equal(old.diagnostics().queryCount,0);
  } finally {old.dispose();fresh.dispose();}
});

// Compile-time conformance: classification is derived from the same literal registry metadata.
function typedBoundaries(s:Session) {
  // @ts-expect-error a mutating operation cannot become a resolver query
  s.readClient('entry').call(drqsContract,'create',{});
  // @ts-expect-error a read operation cannot become a mutation handle
  s.mutation('entry',drqsContract,'list');
}

// REQ-QL-006, REQ-BW-009: malformed successful write data cannot establish non-commit.
test('invalid mutation result becomes blocked unknown rather than a retryable format rejection',async()=>{
  let calls=0;const s=session(async()=>{calls++;return {unexpected:true};});
  try {
    const action=s.mutation('entry',drqsContract,'setIdentity');
    await assert.rejects(action.mutateAsync(identity),(e:any)=>e.code==='outcome_unknown');
    await assert.rejects(action.mutateAsync(identity),(e:any)=>e.code==='outcome_unknown');
    assert.equal(calls,1);assert.equal(action.getSnapshot().isUnknown,true);
  } finally {s.dispose();}
});

// REQ-FF-002, REQ-NV-006, REQ-QL-004: repeated fresh entries do not silently reuse an old snapshot.
test('a mounted screen shows cached data immediately and revalidates without gating readiness',async()=>{
  let calls=0;const next=deferred<unknown>();const s=session(async()=>{calls++;return calls===1?group('First entry'):next.promise;});
  try{
    await s.readClient('first-entry').call(drqsContract,'groups',{});
    const observer=new QueryObserver(s.queryClient,s.queryOptions('new-entry',drqsContract,'groups',{}));const release=observer.subscribe(()=>{});
    try{
      assert.equal(calls,2);assert.equal((observer.getCurrentResult().data as any)[0].name,'First entry');assert.equal(observer.getCurrentResult().isFetching,true);
      const reveal=s.revalidateVisible();await flush();assert.equal(calls,2);
      next.resolve(group('Owner changed'));await reveal;await flush();
      assert.equal((observer.getCurrentResult().data as any)[0].name,'Owner changed');assert.equal(calls,2);
    }finally{release();}
  }finally{s.dispose();}
});
