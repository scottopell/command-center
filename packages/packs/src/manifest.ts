import {z} from 'zod';
import {createHash} from 'node:crypto';

export const SDK_VERSION='1.0.0';
const identifier=z.string().regex(/^[a-z][a-z0-9.-]{0,95}$/);
const relative=z.string().min(1).max(512).refine(p=>!p.startsWith('/')&&!p.includes('\\')&&!p.split('/').some(s=>s==='..'||s==='.'),'Use a path inside the pack');
export const manifestSchema=z.strictObject({
  id:identifier,sdkVersion:z.literal(SDK_VERSION),
  functions:z.array(z.strictObject({id:identifier,mnemonic:z.string().regex(/^[A-Z][A-Z0-9]{0,31}$/),title:z.string().min(1).max(160),ui:relative,uiExport:z.string().regex(/^[A-Za-z_$][\w$]*$/),worker:relative.optional(),workerExport:z.string().regex(/^[A-Za-z_$][\w$]*$/).optional()})).min(1).max(64),
  assets:z.array(relative).max(64).default([]),
  localSourceOrigins:z.array(z.string().refine(value=>{try{const u=new URL(value);return u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)&&!u.username&&!u.password&&u.origin===value;}catch{return false;}},'Use an exact loopback HTTP origin')).max(32).default([]),
}).superRefine((m,ctx)=>{
  for(const key of ['id','mnemonic'] as const)if(new Set(m.functions.map(f=>f[key])).size!==m.functions.length)ctx.addIssue({code:'custom',message:`Duplicate function ${key}`,path:['functions']});
  for(const f of m.functions)if(Boolean(f.worker)!==Boolean(f.workerExport))ctx.addIssue({code:'custom',message:'worker and workerExport must be supplied together',path:['functions']});
});
export type PackManifest=z.output<typeof manifestSchema>;
export interface InstalledFunction {id:string;mnemonic:string;title:string;uiDirectory:string;operations:Record<string,boolean>}
export interface PackArtifact {id:string;sdkVersion:string;revision:string;worker:string;functions:InstalledFunction[];localSourceOrigins:string[]}
export interface PackRegistration {id:string;source:string;active?:string;candidate?:string;removed?:boolean;functionIds?:string[];status:'changed'|'building'|'ready'|'failed'|'active';error?:string}
// REQ-PK-004: mnemonic changes cannot transfer storage ownership.
export function storageNamespace(packId:string,functionId:string){return 'pack-'+createHash('sha256').update(`${packId}\0${functionId}`).digest('hex');}
export function assertNoConflicts(packs:PackArtifact[]){
  const identities=new Set<string>(),commands=new Map<string,string>();
  for(const pack of packs){
    if(identities.has(pack.id))throw new Error(`Pack ${pack.id} is already installed`);identities.add(pack.id);
    for(const f of pack.functions){const prior=commands.get(f.mnemonic);if(prior)throw new Error(`${f.mnemonic} is provided by both ${prior} and ${pack.id}; remove the conflict before applying`);commands.set(f.mnemonic,pack.id);}
  }
}
