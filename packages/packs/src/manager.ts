import fs from 'node:fs/promises';
import {watch,type FSWatcher} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {parsePackManifest,assertNoConflicts,storageNamespace,type PackArtifact,type PackRegistration} from './manifest.ts';
import {run} from './process.ts';
import {AppError} from '../../contracts/src/core.ts';
import type {WorkerRuntime} from '../../backend/src/runtime.ts';
import type {ActivePack,RuntimeConfiguration} from '../../backend/src/runtime-worker.ts';
import type {Store} from '../../backend/src/store.ts';
import {API_EPOCH,epochError,type HostRuntime} from './runtime-contract.ts';

export interface RuntimeCatalog {identity:string;apiEpoch:number;runtime:HostRuntime;commands:Array<{mnemonic:string;title:string;id:string;packId:string;revision:string;webDirectory:string;apiEpoch:number;checkedWith?:string;unavailableReason?:string;operations:Record<string,boolean>}>;localSourceOrigins:string[]}
export class PackManager {
  private registrations:PackRegistration[]=[];
  private watchers=new Map<string,FSWatcher>();
  private timers=new Map<string,ReturnType<typeof setTimeout>>();
  private building=new Set<string>();
  private jobs=new Map<string,Promise<PackRegistration>>();
  private dirty=new Set<string>();
  private maintenance=false;
  private closed=false;
  private persistence:Promise<unknown>=Promise.resolve();
  private hostRuntime!:HostRuntime;
  readonly root:string;
  readonly builds:string;
  readonly directory:string;readonly toolchain:string;readonly system:ActivePack;private runtime:WorkerRuntime;private store:Store;
  constructor(directory:string,toolchain:string,system:ActivePack,runtime:WorkerRuntime,store:Store){this.directory=directory;this.toolchain=toolchain;this.system=system;this.runtime=runtime;this.store=store;this.root=path.join(directory,'packs');this.builds=path.join(this.root,'builds');}
  async initialize(){
    const directory=path.join(this.toolchain,'runtime');
    this.hostRuntime={...JSON.parse(await fs.readFile(path.join(directory,'runtime.json'),'utf8')),directory};
    if(epochError(this.hostRuntime.apiEpoch))throw new Error('Host runtime API epoch does not match this service. Reinstall CommandCenter.');
    await fs.mkdir(this.builds,{recursive:true,mode:0o700});
    try{this.registrations=JSON.parse(await fs.readFile(path.join(this.root,'registry.json'),'utf8'));if(!Array.isArray(this.registrations)||this.registrations.length>128)throw new Error('Invalid installed pack registry');}
    catch(e:any){if(e.code!=='ENOENT')throw e;}
    for(const r of this.registrations){if(r.status==='building')r.status='changed';if(!r.removed){if(r.active){const {artifact}=await this.artifact(r.active);r.incompatible=epochError(artifact.apiEpoch);}this.watch(r);}}
    await this.save();
  }
  private async artifact(revision:string){
    if(!/^[a-f0-9]{64}$/.test(revision))throw new Error('Invalid artifact revision');
    const directory=path.join(this.builds,revision),artifact=JSON.parse(await fs.readFile(path.join(directory,'artifact.json'),'utf8')) as PackArtifact;
    if(artifact.revision!==revision)throw new Error('Artifact identity mismatch');return {directory,artifact};
  }
  async activePacks(){
    const packs:ActivePack[]=[];for(const r of this.registrations)if(r.active&&!r.removed){const pack=await this.artifact(r.active);if(pack.artifact.id!==r.id)throw new Error('Pack registry identity mismatch');packs.push(pack);}return packs;
  }
  async configuration(packs?:ActivePack[]):Promise<RuntimeConfiguration>{
    const selected=packs??await this.activePacks();assertNoConflicts([this.system.artifact,...selected.map(p=>p.artifact)]);
    const identity=createHash('sha256').update(JSON.stringify([this.system.artifact.revision,this.hostRuntime.fingerprint,...selected.map(p=>[p.artifact.id,p.artifact.revision]).sort()])).digest('hex');
    const unavailable=Object.fromEntries(selected.flatMap(p=>{const reason=epochError(p.artifact.apiEpoch);return reason?p.artifact.functions.map(f=>[f.mnemonic,reason]):[];}));
    return {directory:this.directory,identity,systemRevision:this.system.artifact.revision,runtime:this.hostRuntime,unavailable,packs:selected.filter(p=>!epochError(p.artifact.apiEpoch))};
  }
  async catalog():Promise<RuntimeCatalog>{
    const packs=[this.system,...await this.activePacks()];
    return {identity:this.runtime.identity,apiEpoch:API_EPOCH,runtime:this.hostRuntime,commands:packs.flatMap(p=>p.artifact.functions.map(f=>({mnemonic:f.mnemonic,title:f.title,id:f.id,packId:p.artifact.id,revision:p.artifact.revision,apiEpoch:p.artifact.apiEpoch,checkedWith:p.artifact.checkedWith,unavailableReason:epochError(p.artifact.apiEpoch),webDirectory:path.join(p.directory,f.uiDirectory),operations:f.operations}))),localSourceOrigins:[...new Set(packs.filter(p=>!epochError(p.artifact.apiEpoch)).flatMap(p=>p.artifact.localSourceOrigins))]};
  }
  async publish(){await this.atomic('catalog.json',await this.catalog());}
  private atomic(name:string,value:unknown){
    const work=this.persistence.then(async()=>{const file=path.join(this.root,`.${randomUUID()}.json`);await fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});await fs.rename(file,path.join(this.root,name));});this.persistence=work.catch(()=>{});return work;
  }
  private save(){return this.atomic('registry.json',this.registrations);}
  list(){return this.registrations.map(r=>({...r,building:this.building.has(r.id)}));}
  private find(id:string){const r=this.registrations.find(r=>r.id===id);if(!r)throw new AppError('not_found','Pack not registered');return r;}
  async add(source:string){
    if(this.maintenance)throw new AppError('maintenance','An update is already in progress');
    source=await fs.realpath(source);const manifest=parsePackManifest(JSON.parse(await fs.readFile(path.join(source,'command-center.json'),'utf8')));
    if(manifest.id===this.system.artifact.id)throw new AppError('conflict','System package identities cannot be installed from folders');
    const old=this.registrations.find(r=>r.id===manifest.id);
    if(old&&!old.removed&&old.source!==source)throw new AppError('conflict',`Pack ${manifest.id} is already registered from another folder`);
    if(!old&&this.registrations.length>=128)throw new AppError('validation','At most 128 packs may be registered');
    const r=old??{id:manifest.id,source,status:'changed' as const};r.source=source;r.removed=false;if(!old)this.registrations.push(r);await this.save();this.watch(r);await this.build(r.id);return this.find(r.id);
  }
  private watch(r:PackRegistration){
    this.watchers.get(r.id)?.close();
    try{this.watchers.set(r.id,watch(r.source,{recursive:true},(_event,file)=>{
      if(!file||String(file).split(path.sep).some(p=>['.git','node_modules','.work','.tools','.generated','build','dist'].includes(p)))return;
      if(this.closed||r.removed)return;
      if(this.building.has(r.id)){this.dirty.add(r.id);return;}
      clearTimeout(this.timers.get(r.id));r.status='changed';void this.save();
      this.timers.set(r.id,setTimeout(()=>{this.timers.delete(r.id);void this.build(r.id).catch(()=>{});},350));
    }).on('error',error=>{r.status='failed';r.error=error.message;void this.save();}));}
    catch(error){r.status='failed';r.error=error instanceof Error?error.message:'Source folder unavailable';}
  }
  async build(id:string){
    if(this.closed)throw new Error('Pack manager is closed');
    const r=this.find(id);if(r.removed)throw new AppError('not_found','Pack has been removed');
    clearTimeout(this.timers.get(id));this.timers.delete(id);
    const existing=this.jobs.get(id);if(existing)return existing;
    this.building.add(id);
    const job=(async()=>{
      do{
        this.dirty.delete(id);r.status='building';delete r.error;await this.save();let failure:unknown;
        try{
          const output=await run(process.execPath,[path.join(this.toolchain,'builder.mjs'),r.source,this.builds],{timeout:180000});
          const artifact=JSON.parse(output.trim().split('\n').at(-1)!) as PackArtifact;if(artifact.id!==id)throw new Error('Source changed its pack identity; register the new pack explicitly');
          assertNoConflicts([this.system.artifact,...(await this.activePacks()).filter(p=>p.artifact.id!==id).map(p=>p.artifact),artifact]);
          r.candidate=artifact.revision;r.status=r.active===r.candidate?'active':'ready';
        }catch(error){failure=error;r.status='failed';r.error=error instanceof Error?error.message:'Pack build failed';}
        await this.save();
        if(failure&&(!this.dirty.has(id)||r.removed||this.closed))throw new AppError('build_failed',r.error??'Pack build failed');
      }while(this.dirty.has(id)&&!r.removed&&!this.closed);
      return r;
    })();
    this.jobs.set(id,job);
    try{return await job;}finally{this.building.delete(id);this.jobs.delete(id);}
  }
  async apply(id:string,revision:string){
    // REQ-PK-007/014: capture the requested immutable candidate before maintenance.
    if(!/^[a-f0-9]{64}$/.test(revision))throw new AppError('validation','Apply requires an exact candidate revision');
    const selectedRevision=this.find(id).candidate;
    if(selectedRevision!==revision)throw new AppError('conflict','Candidate changed. Inspect the pack and apply its exact candidate revision. This request was not admitted.');
    const r=this.find(id);if(r.removed||!r.candidate||!['ready','active'].includes(r.status)||this.building.has(id))throw new AppError('validation','Build a valid candidate before applying');
    const candidateRevision=revision;
    return this.change(async()=>{
      const candidate=await this.artifact(candidateRevision);const reason=epochError(candidate.artifact.apiEpoch);if(reason)throw new AppError('update_required',reason);
      if(r.active===candidateRevision)return {pack:{...r},catalog:await this.catalog()};
      const selected=[...(await this.activePacks()).filter(p=>p.artifact.id!==id),candidate];
      const previousConfig=await this.configuration();const config=await this.configuration(selected);await this.runtime.pauseAndDrain();
      const previous=r.active;
      try{
        await this.runtime.replace(config);r.active=candidateRevision;r.functionIds=[...new Set([...(r.functionIds??[]),...candidate.artifact.functions.map(f=>f.id)])];if(r.status!=='failed'){r.status=this.building.has(id)?'building':r.candidate===candidateRevision?'active':'ready';delete r.error;}
        delete r.incompatible;await this.save();await this.publish();
      }catch(error){r.active=previous;r.status='failed';r.error=error instanceof Error?error.message:'Activation failed';if(this.runtime.identity!==previousConfig.identity)await this.runtime.replace(previousConfig).catch(()=>{});await this.save();throw error;}
      finally{this.runtime.resume();}
      return {pack:r,catalog:await this.catalog()};
    });
  }
  async remove(id:string){
    const r=this.find(id);if(r.removed)return {catalog:await this.catalog()};
    return this.change(async()=>{
      const previousConfig=await this.configuration(),previous=r.active;
      const selected=(await this.activePacks()).filter(p=>p.artifact.id!==id),config=await this.configuration(selected);await this.runtime.pauseAndDrain();
      try{await this.runtime.replace(config);r.removed=true;delete r.active;await this.save();await this.publish();this.watchers.get(id)?.close();this.watchers.delete(id);}
      catch(error){r.removed=false;r.active=previous;if(this.runtime.identity!==previousConfig.identity)await this.runtime.replace(previousConfig).catch(()=>{});await this.save();throw error;}
      finally{this.runtime.resume();}
      return {catalog:await this.catalog()};
    });
  }
  async purge(id:string){
    const r=this.find(id);if(!r.removed)throw new AppError('validation','Remove the pack before deleting its retained data');
    for(const fn of r.functionIds??[])this.store.deleteNamespace(storageNamespace(id,fn));return {deleted:true};
  }
  private async change<T>(work:()=>Promise<T>){if(this.maintenance)throw new AppError('maintenance','Another update is in progress');this.maintenance=true;try{return await work();}finally{this.maintenance=false;}}
  async close(){this.closed=true;this.dirty.clear();for(const w of this.watchers.values())w.close();for(const t of this.timers.values())clearTimeout(t);this.watchers.clear();while(this.building.size)await new Promise(r=>setTimeout(r,10));await this.persistence;}
}
