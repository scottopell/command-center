import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Store} from './store.ts';
import {createDispatcher,publicError,type RegisteredWorker} from './dispatcher.ts';
import {diagnosticsReader} from './diagnostics.ts';
import {storageNamespace,type PackArtifact} from '../../packs/src/manifest.ts';
import {API_EPOCH,epochError,type HostRuntime} from '../../packs/src/runtime-contract.ts';

export interface ActivePack {artifact:PackArtifact;directory:string}
export interface RuntimeConfiguration {directory:string;identity:string;systemRevision:string;runtime:HostRuntime;unavailable:Record<string,string>;packs:ActivePack[]}

let dispatch:ReturnType<typeof createDispatcher>|undefined,store:Store|undefined;
process.on('message',async(message:any)=>{
  if(message.kind==='start'){
    try{
      const config=message.config as RuntimeConfiguration,registrations:Record<string,RegisteredWorker>={};
      if(config.runtime.apiEpoch!==API_EPOCH)throw new Error('Incompatible host runtime epoch');
      for(const pack of config.packs){const reason=epochError(pack.artifact.apiEpoch);if(reason)throw new Error(reason);}
      await import(pathToFileURL(path.join(config.runtime.directory,'loader.mjs')).href);
      for(const pack of config.packs){
        const module=await import(pathToFileURL(path.join(pack.directory,pack.artifact.worker)).href),workers=module.createWorkers();
        for(const [name,worker]of Object.entries(workers)){
          const fn=pack.artifact.functions.find(f=>f.mnemonic===name);if(!fn)throw new Error('Worker is absent from the pack catalog');
          if(registrations[name])throw new Error('Duplicate worker');
          registrations[name]={worker:worker as any,namespace:storageNamespace(pack.artifact.id,fn.id)};
        }
      }
      store=new Store(path.join(config.directory,'data.sqlite'));dispatch=createDispatcher(store,{}, {registrations,history:diagnosticsReader(config.directory)});
      for(const pack of config.packs)for(const f of pack.artifact.functions)if(JSON.stringify(dispatch.operations[f.mnemonic]??{})!==JSON.stringify(f.operations))throw new Error('Worker operations differ from the built artifact');
      process.send?.({kind:'ready',identity:config.identity,operations:dispatch.operations});
    }catch(error){process.send?.({kind:'startupError',message:error instanceof Error?error.message:'Worker startup failed'});}
  }else if(message.kind==='call'&&dispatch){
    try{process.send?.({kind:'reply',id:message.id,body:{ok:true,result:await dispatch(message.payload)}});}
    catch(error){const safe=publicError(error);if(safe.code==='internal')console.error('Worker request failed',error);process.send?.({kind:'reply',id:message.id,body:{ok:false,error:safe}});}
  }else if(message.kind==='stop'){store?.close();process.exit(0);}
});
process.once('disconnect',()=>process.exit(0));
