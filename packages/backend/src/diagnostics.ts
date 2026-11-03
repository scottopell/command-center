import fs from 'node:fs/promises';
import path from 'node:path';
import {AppError} from '../../contracts/src/core.ts';
import {transitionSchema,diagnosticFilterSchema,type DiagnosticsReader,type TransitionRecord} from '../../contracts/src/diagnostics.ts';

// REQ-ST-003/004, REQ-PK-010: native owns writes; this facade exposes no path or mutation.
export function diagnosticsReader(directory:string):DiagnosticsReader {
  const root=path.join(directory,'diagnostics');
  async function read(id:string){
    if(!/^[A-Za-z0-9-]{1,128}$/.test(id))throw new AppError('validation','Invalid transition identifier');
    const file=path.join(root,id+'.json');
    try{if((await fs.stat(file)).size>65536)throw new Error('Oversized diagnostic');return transitionSchema.parse(JSON.parse(await fs.readFile(file,'utf8')));}
    catch(e:any){if(e.code==='ENOENT')throw new AppError('not_found','Transition not found');throw e;}
  }
  return Object.freeze({get:read,list:async (raw:Parameters<DiagnosticsReader['list']>[0])=>{
    const input=diagnosticFilterSchema.parse(raw),since=input.since??new Date(Date.now()-7*86400000).toISOString();let names:string[]=[];
    try{names=(await fs.readdir(root)).filter(n=>/^[A-Za-z0-9-]{1,128}\.json$/.test(n)).slice(0,10000);}catch(e:any){if(e.code!=='ENOENT')throw e;}
    const records:TransitionRecord[]=[];
    for(let i=0;i<names.length;i+=32){const batch=await Promise.allSettled(names.slice(i,i+32).map(n=>read(n.slice(0,-5))));for(const item of batch)if(item.status==='fulfilled'&&item.value.startedAt>=since&&(!input.mnemonic||item.value.mnemonic===input.mnemonic.toUpperCase()))records.push(item.value);}
    records.sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
    const groups=new Map<string,{mnemonic:string;transitions:number;stragglers:number;maximumMs:number}>();
    const eligible=records.filter(r=>r.sloEligible);
    for(const r of eligible){const g=groups.get(r.mnemonic)??{mnemonic:r.mnemonic,transitions:0,stragglers:0,maximumMs:0};g.transitions++;g.stragglers+=Number(r.straggler);g.maximumMs=Math.max(g.maximumMs,r.elapsedMs);groups.set(r.mnemonic,g);}
    const filtered=records.filter(r=>!input.onlyStragglers||(r.sloEligible&&r.straggler));
    return {items:filtered.slice(0,input.limit),total:filtered.length,truncated:filtered.length>input.limit,summary:{transitions:eligible.length,excludedTransitions:records.length-eligible.length,stragglers:eligible.filter(r=>r.straggler).length,byFunction:[...groups.values()].sort((a,b)=>b.stragglers-a.stragglers)}};
  }});
}
