import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTail } from '../functions/drqs/tail.ts';
import { groups } from '../functions/drqs/worker.ts';
// REQ-DR-003: table tests include deliberate literal spacing/case.
test('DRQS tails select only navigation and reject extra operands',()=>{
  assert.deepEqual(parseTail('',groups),{kind:'queue'});assert.deepEqual(parseTail('a 42',groups),{kind:'add',group:42});assert.deepEqual(parseTail('A',groups),{kind:'add'});
  assert.deepEqual(parseTail('G command-center',groups),{kind:'queue',group:42});assert.deepEqual(parseTail('S Baz  <script> !',groups),{kind:'queue',search:'Baz  <script> !'});assert.deepEqual(parseTail('12',groups),{kind:'ticket',number:12});
  for(const bad of ['G','A 42 extra','G 9999999','G 42 x','0','42 x','S'])assert.throws(()=>parseTail(bad,groups));
  assert.equal(groups.length,4);
  // REQ-DR-001: public project identities remain distinct across numbers and slugs.
  assert.equal(new Set(groups.map(g=>g.number)).size,groups.length);
  assert.equal(new Set(groups.map(g=>g.id)).size,groups.length);
  for(const [slug,number] of [['inbox',1],['command-center',42],['phoenix-ide',43],['paperclip',44]] as const){
    assert.deepEqual(parseTail(`G ${slug.toUpperCase()}`,groups),{kind:'queue',group:number});
    assert.deepEqual(parseTail(`A ${slug}`,groups),{kind:'add',group:number});
  }
});
