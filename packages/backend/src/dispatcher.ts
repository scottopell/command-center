import {z} from 'zod';
import {AppError,envelopeSchema,type DefinedWorker,type WorkerContext} from '../../sdk/src/contracts.ts';
import {Store} from './store.ts';
import {drqsWorker} from '../../../functions/drqs/worker.ts';
import {hostWorker} from '../../../functions/host/worker.ts';
import {createStragWorker} from '../../../functions/strag/worker.ts';
import {storageNamespace} from '../../packs/src/manifest.ts';
import type {DiagnosticsReader} from '../../contracts/src/diagnostics.ts';
export const SYSTEM_PACK='cc.system';
export const systemNamespace=(id:string)=>storageNamespace(SYSTEM_PACK,id.toLowerCase());
export type RegisteredWorker={worker:DefinedWorker;namespace:string};
const emptyHistory:DiagnosticsReader={list:async()=>({items:[],total:0,truncated:false,summary:{transitions:0,stragglers:0,byFunction:[]}}),get:async()=>{throw new AppError('not_found','Transition not found');}};
// REQ-BW-002/003/004/007/009, REQ-PK-004/010: authoritative local worker schemas.
export function createDispatcher(store:Store,additional:Record<string,DefinedWorker>={},options:{history?:DiagnosticsReader;registrations?:Record<string,RegisteredWorker>}={}){
 const workers:Record<string,RegisteredWorker>={DRQS:{worker:drqsWorker,namespace:systemNamespace('drqs')},HOST:{worker:hostWorker,namespace:systemNamespace('host')},STRAG:{worker:createStragWorker(options.history??emptyHistory),namespace:systemNamespace('strag')}};
 for(const [name,worker]of Object.entries(additional)){if(workers[name])throw new Error('Duplicate worker registration');workers[name]={worker,namespace:storageNamespace('test.extension',name.toLowerCase())};}
 for(const [name,item]of Object.entries(options.registrations??{})){if(workers[name])throw new Error('Duplicate worker registration');workers[name]=item;}
 const operations:Record<string,Record<string,boolean>>={};
 for(const [name,{worker}]of Object.entries(workers)){
   if(worker.name!==name)throw new Error('Worker mnemonic differs from its contract');
   operations[name]={};for(const [op,definition]of Object.entries(worker.definition)){
     if(typeof definition.mutating!=='boolean'||typeof definition.input?.parse!=='function'||typeof definition.output?.parse!=='function'||typeof (worker.handlers as any)[op]!=='function')throw new Error('Invalid worker definition');
     operations[name][op]=definition.mutating;
   }
 }
 store.migrateLegacyNamespace('DRQS',systemNamespace('drqs'));store.migrateLegacyNamespace('HOST',systemNamespace('host'));
 const dispatch=async(raw:unknown):Promise<unknown>=>{
   const request=envelopeSchema.parse(raw),registered=Object.hasOwn(workers,request.function)?workers[request.function]:undefined;
   const contract=registered&&Object.hasOwn(registered.worker.definition,request.operation)?registered.worker.definition[request.operation]:undefined;
   if(!registered||!contract)throw new AppError('not_found','Unknown function or operation');
   const input=contract.input.parse(request.input),handler=(registered.worker.handlers as Record<string,(ctx:WorkerContext,input:any)=>Promise<unknown>>)[request.operation];let committed=false;
   let result:unknown;
   try{result=await handler({kv:store.scoped(registered.namespace,()=>{committed=true;})},input);}
   catch(error){if(committed)throw new AppError('outcome_unknown','The operation committed but its result could not be confirmed. Inspect records before retrying.');throw error;}
   try{
     const output=contract.output.parse(result),encoded=JSON.stringify(output);
     if(encoded===undefined)throw new AppError('internal','Worker results must be JSON; return explicit null instead of undefined');
     if(Buffer.byteLength(encoded,'utf8')>2*1024*1024)throw new AppError('response_too_large','The result exceeds the 2 MiB response limit. Narrow the query.');
     contract.output.parse(JSON.parse(encoded));return output;
   }catch(error){if(contract.mutating)throw new AppError('outcome_unknown','The action may have committed but its result could not be confirmed. Inspect records before retrying. No retry was attempted.');throw error;}

 };
 return Object.assign(dispatch,{operations});
}
export function publicError(error:unknown):{code:string;message:string;details?:unknown}{
 if(error instanceof z.ZodError||(error instanceof Error&&error.name==='ZodError'&&Array.isArray((error as any).issues)))return {code:'validation',message:'Invalid input or result',details:JSON.parse(JSON.stringify((error as any).issues)).slice(0,20)};
 const e=error as any;
 if(error instanceof AppError||(e instanceof Error&&e.name==='CommandCenterError'&&/^[a-z][a-z0-9_]{0,63}$/.test((e as any).code)))return {code:e.code,message:String(e.message).slice(0,4096),...(e.details===undefined?{}:{details:e.details})};
 return {code:'internal',message:'The operation could not be completed. Check the local worker log.'};
}
