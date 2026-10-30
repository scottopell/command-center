import {test} from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {snapshotSequence,adjacent} from '../packages/ui/src/sequence.ts';
const schema=z.strictObject({id:z.number().int().positive(),label:z.string().default('detail')});
// REQ-NV-010/011: snapshot order/parameters outlive source mutation without owning any records or views.
test('sequence snapshots validate, detach and normalize destinations; movement never wraps',()=>{
  const input={items:[{key:'b',params:{id:42}},{key:'c',params:{id:43}}],selectedKey:'b'};
  const original=snapshotSequence('detail',schema,input);
  input.items.reverse();input.items[0].params.id=999;
  assert.deepEqual(original.items,[{key:'b',params:{id:42,label:'detail'}},{key:'c',params:{id:43,label:'detail'}}]);
  assert.equal(adjacent(original,-1),null);
  const next=adjacent(original,1)!;assert.equal(next.index,1);assert.equal(original.index,0);
  assert.equal(adjacent(next,1),null);assert.equal(adjacent(next,-1)?.index,0);
});
// REQ-NV-010: reject malformed context before stack mutation or worker reads.
test('sequence bounds reject duplicate/missing keys, bad destinations, non-JSON and oversized descriptors',()=>{
  const invalid=[{items:[],selectedKey:'x'}, {items:[{key:'x',params:{id:1}},{key:'x',params:{id:2}}],selectedKey:'x'},
    {items:[{key:'x',params:{id:'1'}}],selectedKey:'x'}, {items:[{key:'x',params:{id:1}}],selectedKey:'missing'},
    {items:Array.from({length:201},(_,i)=>({key:String(i),params:{id:i+1}})),selectedKey:'0'},
    {items:[{key:'x',params:{id:1,label:'界'.repeat(22000)}}],selectedKey:'x'}];
  for(const value of invalid)assert.throws(()=>snapshotSequence('detail',schema,value));
  assert.throws(()=>snapshotSequence('detail',z.any(),{items:[{key:'x',params:{callback:()=>{}}}],selectedKey:'x'}));
});
