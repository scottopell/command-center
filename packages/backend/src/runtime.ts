import {fork,type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {AppError} from '../../contracts/src/core.ts';
import type {RuntimeConfiguration} from './runtime-worker.ts';
import {API_EPOCH} from '../../packs/src/runtime-contract.ts';

// REQ-PK-006/007: one shared replaceable runtime; pending tracks handlers, not sockets.
export class WorkerRuntime {
  private child?:ChildProcess;
  private sequence=0;
  private pending=new Map<number,{resolve:(body:any)=>void;reject:(error:Error)=>void;mutation:boolean}>();
  private accepting=true;
  private ready=false;
  private configuration?:RuntimeConfiguration;
  operations:Record<string,Record<string,boolean>>={};
  identity='';
  private revisions:Record<string,string>={};
  private unavailable:Record<string,string>={};
  get activeHandlers(){return this.pending.size;}
  get available(){return this.ready && Boolean(this.child?.connected);}
  get admissionOpen(){return this.accepting;}
  async start(configuration:RuntimeConfiguration){
    this.ready=false;this.configuration=configuration;
    this.unavailable=configuration.unavailable;
    this.revisions=Object.fromEntries([...['DRQS','HOST','STRAG'].map(name=>[name,configuration.systemRevision]),...configuration.packs.flatMap(p=>p.artifact.functions.map(f=>[f.mnemonic,p.artifact.revision]))]);
    const entry=new URL(import.meta.url.endsWith('.mjs')?'./worker-runtime.mjs':'./runtime-worker.ts',import.meta.url);
    const child=fork(fileURLToPath(entry),[],{stdio:['ignore','inherit','inherit','ipc'],serialization:'json'});this.child=child;
    await new Promise<void>((resolve,reject)=>{
      let settled=false;const timer=setTimeout(()=>finish(new Error('Worker startup exceeded 10 seconds')),10000);
      const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve();};
      child.on('message',(message:any)=>{
        if(this.child!==child)return;
        if(message.kind==='ready'){if(message.identity!==configuration.identity){finish(new Error('Worker installation identity mismatch'));return;}this.operations=message.operations;this.identity=message.identity;this.ready=true;finish();}
        else if(message.kind==='startupError')finish(new Error(message.message));
        else if(message.kind==='reply'){const waiter=this.pending.get(message.id);if(waiter){this.pending.delete(message.id);waiter.resolve(message.body);}}
      });
      child.once('error',error=>finish(error));
      child.once('exit',()=>{
        finish(new Error('Worker process exited during startup'));
        if(this.child===child){
          this.child=undefined;this.ready=false;
          for(const waiter of this.pending.values())waiter.reject(new AppError(waiter.mutation?'outcome_unknown':'unavailable',waiter.mutation?'Worker stopped; the operation may have committed. Inspect records before retrying.':'The worker process is unavailable.'));
          this.pending.clear();
        }
      });
      child.send({kind:'start',config:configuration});
    });
  }
  async call(payload:any){
    if(!this.accepting)throw new AppError('maintenance','CommandCenter is applying an update; this request was not admitted');
    if(!this.available)throw new AppError('unavailable','The worker process is unavailable');
    if(payload?.apiEpoch!==undefined&&payload.apiEpoch!==API_EPOCH)throw new AppError('update_required','Update required: this view uses a different API epoch. Restart the matching CommandCenter app. This request was not admitted.');
    if(Object.hasOwn(this.unavailable,payload?.function))throw new AppError('update_required',this.unavailable[payload.function]);
    if(payload?.revision&&payload.revision!==this.revisions[payload.function])throw new AppError('conflict','The function has been updated. Relaunch before making another request. This request was not admitted.');
    const id=++this.sequence,mutation=this.operations[payload?.function]?.[payload?.operation]===true;
    return new Promise<any>((resolve,reject)=>{this.pending.set(id,{resolve,reject,mutation});this.child!.send({kind:'call',id,payload},error=>{if(error){const waiter=this.pending.get(id);this.pending.delete(id);waiter?.reject(new AppError(mutation?'outcome_unknown':'unavailable','Worker communication failed; no retry was attempted'));}});});
  }
  async pauseAndDrain(timeout=5000){
    this.accepting=false;const until=performance.now()+timeout;
    while(this.pending.size){if(performance.now()>=until){this.accepting=true;throw new AppError('maintenance','Update postponed: admitted work is still running. No handler was terminated.');}await new Promise(resolve=>setTimeout(resolve,10));}
  }
  resume(){this.accepting=true;}
  private async stopIdle(){
    const child=this.child;if(!child)return;
    if(child.exitCode!==null||child.signalCode!==null){this.child=undefined;this.ready=false;return;}
    if(this.pending.size)throw new Error('Cannot stop a worker with admitted work');
    await new Promise<void>(resolve=>{const timer=setTimeout(()=>child.kill('SIGTERM'),2000);child.once('exit',()=>{clearTimeout(timer);resolve();});if(child.connected)child.send({kind:'stop'},()=>{});else child.kill('SIGTERM');});
    if(this.child===child)this.child=undefined;
  }
  async replace(configuration:RuntimeConfiguration){
    if(this.accepting||this.pending.size)throw new Error('Pause and drain before replacing workers');
    const previous=this.configuration!;await this.stopIdle();
    try{await this.start(configuration);}catch(error){await this.start(previous).catch(()=>{});throw error;}
  }
  async close(){await this.pauseAndDrain(30000);await this.stopIdle();}
}
