import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../packages/backend/src/store.ts';
import { createDispatcher } from '../packages/backend/src/dispatcher.ts';

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'command-center-test-'));
  const store = new Store(path.join(dir, 'data.sqlite'));
  const dispatch = createDispatcher(store);
  return { store, dispatch, cleanup: async () => { store.close(); await rm(dir, { recursive: true, force: true }); } };
}
const agent = { kind: 'agent', id: 'test-agent', name: 'Test agent' };
const input = { title: 'Finding', body: 'Evidence', group: 42, actor: agent, requesters: [{ kind: 'employee', id: 'test@example.com', name: 'Test requester' }] };

// REQ-BW-005, REQ-BW-006, REQ-BW-012: test the real store, not a mocked transaction.
test('KV namespaces, null, replacement, prefix listing, rollback and expired tx handles', async () => {
  const f = await fixture();
  try {
    const a = f.store.scoped('A'), b = f.store.scoped('B');
    assert.equal(await a.get('missing'), undefined);
    await a.put('x', null); assert.equal(await a.get('x'), null); assert.equal(await b.get('x'), undefined);
    await a.put('item/a', { a: 1, b: 2 }); await a.put('item/a', { a: 3 });
    assert.deepEqual(await a.list('item/'), [{ key: 'item/a', value: { a: 3 } }]);
    let saved: any, calls = 0;
    await assert.rejects(a.transaction(async tx => { calls++; saved = tx; await tx.put('rollback', true); throw new Error('stop'); }));
    assert.equal(calls, 1); assert.equal(await a.get('rollback'), undefined);
    await assert.rejects(saved.put('late', true));
    await a.delete('x'); await a.delete('x'); assert.equal(await a.get('x'), undefined);
  } finally { await f.cleanup(); }
});

// REQ-DR-001..010, REQ-BW-003/006/011: concurrent calls pass through the actual dispatcher.
test('DRQS complete workflow, concurrent numbers/comments, defaults, literal search and immutable original', async () => {
  const f = await fixture();
  try {
    const call = (op: string, value: unknown) => f.dispatch({ function: 'DRQS', operation: op, input: value });
    const tickets: any[] = await Promise.all(Array.from({ length: 20 }, (_, i) => call('create', { ...input, title: `Finding ${i}` })));
    assert.equal(new Set(tickets.map(t => t.number)).size, 20);
    const first = tickets[0]; assert.equal(first.state, 'Q'); assert.equal(first.owner, null);
    await Promise.all(['alpha', 'beta'].map(comment => call('update', { number: first.number, comment, actor: agent })));
    await call('update', { number: first.number, comment: 'hand off', group: 44, state: 'N', owner: 'owner@example.com', actor: agent });
    await call('update', { number: first.number, comment: 'more evidence <script>', actor: agent });
    let t: any = await call('get', { number: first.number });
    assert.equal(t.title, first.title); assert.equal(t.body, 'Evidence'); assert.equal(t.group, 44); assert.equal(t.state, 'N'); assert.equal(t.owner, 'owner@example.com');
    assert.deepEqual(t.events.slice(0, 2).map((e: any) => e.comment).sort(), ['alpha', 'beta']);
    assert.equal(t.events.length, 4);
    await call('update', { number: first.number, state: 'R', owner: null, actor: agent });
    assert.equal((await call('list', { group: 44 }) as any[]).length, 0);
    assert.equal((await call('list', { state: 'all', search: '<script>' }) as any[]).length, 1);
    await call('update', { number: first.number, state: 'Q', actor: agent });
    t = await call('get', { number: first.number }); assert.equal(t.state, 'Q'); assert.equal(t.owner, null);
  } finally { await f.cleanup(); }
});

test('invalid envelopes, agents without requesters and invalid groups leave data unchanged', async () => {
  const f = await fixture();
  try {
    for (const req of [
      { function: 'NOPE', operation: 'create', input },
      { function: 'DRQS', operation: 'create', input: { ...input, requesters: [] } },
      { function: 'DRQS', operation: 'create', input: { ...input, group: 999999 } },
      { function: 'DRQS', operation: 'create', input: { ...input, title: '' } },
      { function: 'DRQS', operation: 'create', input, mutation: false },
    ]) await assert.rejects(f.dispatch(req));
    assert.deepEqual(await f.dispatch({ function: 'DRQS', operation: 'list', input: {} }), []);
  } finally { await f.cleanup(); }
});

// REQ-BW-006, REQ-DR-004, REQ-DR-007: fail the real transaction after writes.
test('storage faults roll back both counter/create and comment/routing changes',async()=>{
  const f=await fixture(),original=f.store.scoped.bind(f.store);
  function faultOn(){f.store.scoped=(namespace,committed)=>{const kv=original(namespace,committed);return {...kv,transaction:work=>kv.transaction(tx=>work({...tx,put:async(key,value)=>{await tx.put(key,value);if(key.startsWith('ticket/'))throw new Error('injected storage fault');}}))};};}
  const call=(operation:string,input:unknown)=>f.dispatch({function:'DRQS',operation,input});
  try{
    faultOn();await assert.rejects(call('create',input));assert.equal(await original('DRQS').get('next-ticket'),undefined);assert.deepEqual(await original('DRQS').list('ticket/'),[]);
    f.store.scoped=original;const ticket:any=await call('create',input);assert.equal(ticket.number,1);
    faultOn();await assert.rejects(call('update',{number:1,group:44,state:'N',comment:'must roll back'}));f.store.scoped=original;
    assert.deepEqual(await call('get',{number:1}),ticket);
  }finally{await f.cleanup();}
});
