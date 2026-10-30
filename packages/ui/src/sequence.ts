import {z} from 'zod';
import {AppError} from '../../contracts/src/index.ts';

export interface SequenceInput<P> {items:ReadonlyArray<{key:string;params:P}>;selectedKey:string}
export interface SiblingSequence {screen:string;items:ReadonlyArray<{key:string;params:unknown}>;index:number}
// REQ-NV-010: private, detached descriptors; no records, callbacks or visited-view cache.
export function snapshotSequence(screen:string,schema:z.ZodType,input:SequenceInput<unknown>):SiblingSequence {
  const descriptors=z.array(z.strictObject({key:z.string().min(1).max(128),params:z.unknown()})).min(1).max(200).parse(input.items);
  const keys=new Set<string>();
  const items=descriptors.map(item=>{
    if(keys.has(item.key))throw new AppError('contract','Collection item keys must be unique.');
    keys.add(item.key);
    const params=schema.parse(item.params);z.json().parse(params);
    return {key:item.key,params};
  });
  const index=items.findIndex(item=>item.key===input.selectedKey);
  if(index<0)throw new AppError('contract','The selected collection item is missing.');
  const encoded=JSON.stringify(items);
  if(new TextEncoder().encode(encoded).length>64*1024)throw new AppError('contract','Collection descriptors exceed 64 KiB.');
  return {screen,items:JSON.parse(encoded),index};
}

// REQ-NV-011: stepping changes only the cursor; replacement owns screen disposal.
export function adjacent(sequence:SiblingSequence,direction:-1|1):SiblingSequence|null {
  const index=sequence.index+direction;
  return index<0||index>=sequence.items.length?null:{...sequence,index};
}
