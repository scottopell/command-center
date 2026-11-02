import React, { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MutationCache, MutationObserver, QueryClient, QueryClientProvider, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { AppError, operationFor, type WorkerContract, type OperationInput, type OperationOutput, type ReadOperation, type WriteOperation } from './contracts.ts';

export interface QueryTransportOptions { entryId:string; signal?:AbortSignal }
export interface QuerySessionOptions {
  request(fn:string,op:string,input:unknown,options:QueryTransportOptions):Promise<unknown>;
  isInteractive(entryId:string):boolean;
}
export interface ReadClient {
  call<C extends WorkerContract,K extends ReadOperation<C>>(worker:C,op:K,input:OperationInput<C,K>,options?:{signal?:AbortSignal}):Promise<OperationOutput<C,K>>;
}
function cancelled() {return new AppError('cancelled','This read is no longer needed.');}
function withSignal<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T> {
  if(!signal)return promise;
  return new Promise<T>((resolve,reject)=>{
    if(signal.aborted){reject(cancelled());return;}
    const abort=()=>{cleanup();reject(cancelled());};
    const cleanup=()=>signal.removeEventListener('abort',abort);
    signal.addEventListener('abort',abort,{once:true});
    promise.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  });
}

// REQ-QL-001, REQ-QL-002, REQ-QL-005, REQ-QL-009: operation metadata, validated keys and one invocation cache.
export class InvocationQueries {
  readonly queryClient:QueryClient;
  private disposed=false;
  constructor(private readonly transport:QuerySessionOptions) {
    this.queryClient=new QueryClient({
      defaultOptions:{queries:{gcTime:Infinity,staleTime:0,retry:false,refetchOnMount:true,refetchOnWindowFocus:false,refetchOnReconnect:false,refetchInterval:false,networkMode:'always'},mutations:{retry:false,gcTime:0,networkMode:'always'}},
      mutationCache:new MutationCache({onSuccess:()=>{
        // REQ-QL-003, REQ-QL-004: cache-owned completion survives origin pop; refresh cannot reject the committed write.
        if(!this.disposed)void this.invalidateAfterCommit();
      }}),
    });
  }
  get live(){return !this.disposed;}
  assertLive(){if(this.disposed)throw new AppError('retired','This invocation has retired.');}
  private async invalidateAfterCommit() {
    // Cancel even an initial no-data read: invalidateQueries alone may reuse its pre-commit promise.
    await this.queryClient.cancelQueries();
    if(!this.disposed)await this.queryClient.invalidateQueries({}, {throwOnError:false}).catch(()=>{});
  }
  queryOptions<C extends WorkerContract,K extends ReadOperation<C>>(entryId:string,worker:C,op:K,input:OperationInput<C,K>) {
    this.assertLive();
    const definition=operationFor(worker,op);
    if(!definition||definition.mutating)throw new AppError('contract','Queries require a registered read operation.');
    const parsed=definition.input.parse(input),fn=worker.name;
    // This closure owns descriptors and the session transport, never a screen callback or DOM node.
    return {queryKey:[fn,op,parsed] as const,queryFn:async({signal}:{signal:AbortSignal})=>{
      this.assertLive();
      const data=await this.transport.request(fn,op,parsed,{entryId,signal});
      this.assertLive();if(signal.aborted)throw cancelled();
      return definition.output.parse(data) as OperationOutput<C,K>;
    }};
  }
  readClient(entryId:string,signal?:AbortSignal):ReadClient {
    return {call:(worker,op,input,options)=>{
      this.assertLive();const callerSignal=options?.signal??signal;
      if(callerSignal?.aborted)return Promise.reject(cancelled());
      // REQ-FF-002, REQ-NV-006: a new entry awaits a current required read, even when its key was cached.
      // Retained Back does not rerun resolution; its existing observers revalidate in the background.
      return withSignal(this.queryClient.fetchQuery(this.queryOptions(entryId,worker,op,input)),callerSignal);
    }};
  }
  // REQ-QL-004: reveal refreshes active stale queries without removing cached content or focus.
  async revalidateVisible(){if(!this.disposed)await this.queryClient.refetchQueries({type:'active',stale:true},{throwOnError:false,cancelRefetch:false}).catch(()=>{});}
  diagnostics(){
    const queries=this.queryClient.getQueryCache().getAll();let cachedBytes=0,maxResponseBytes=0;
    for(const query of queries)if(query.state.data!==undefined){const bytes=new TextEncoder().encode(JSON.stringify(query.state.data)).length;cachedBytes+=bytes;maxResponseBytes=Math.max(maxResponseBytes,bytes);}
    return {queryCount:queries.length,cachedBytes,maxResponseBytes,mutationCount:this.queryClient.getMutationCache().getAll().length};
  }
  mutation<C extends WorkerContract,K extends WriteOperation<C>>(entryId:string,worker:C,op:K){
    const definition=operationFor(worker,op);if(!definition?.mutating)throw new AppError('contract','Mutations require a registered write operation.');
    return new WorkerMutationHandle<OperationInput<C,K>,OperationOutput<C,K>>(this,entryId,worker,op);
  }
  async executeMutation(entryId:string,worker:WorkerContract,op:string,input:unknown):Promise<unknown> {
    this.assertLive();if(!this.transport.isInteractive(entryId))throw new AppError('not_ready','Only the active interactive screen can submit an action.');
    const definition=operationFor(worker,op);if(!definition?.mutating)throw new AppError('contract','Not a registered mutation.');
    const parsed=definition.input.parse(input),transport=this.transport,fn=worker.name;
    const observer=new MutationObserver(this.queryClient,{retry:false,gcTime:0,networkMode:'always',mutationKey:[fn,op],
      mutationFn:async(value:unknown)=>{
        const reply=await transport.request(fn,op,value,{entryId}),result=definition.output.safeParse(reply);
        if(!result.success)throw new AppError('outcome_unknown','The action may have committed, but its result was invalid. Inspect the owner before starting another action. No retry was attempted.');
        return result.data;
      }});
    // Descriptor-only observer; its cache-level onSuccess runs even when the origin View has gone.
    const release=observer.subscribe(()=>{});
    try{return await observer.mutate(parsed);}finally{release();}
  }
  // REQ-QL-002, REQ-QL-008: clear old cache/delivery ownership; admitted owner mutations may still complete.
  dispose(){if(this.disposed)return;this.disposed=true;this.queryClient.clear();}
}

export interface MutationSnapshot<T>{status:'idle'|'pending'|'success'|'error'|'unknown';isPending:boolean;isUnknown:boolean;isSuccess:boolean;isError:boolean;data:T|undefined;error:Error|null}
function snapshot<T>(status:MutationSnapshot<T>['status'],data?:T,error:Error|null=null):MutationSnapshot<T>{return {status,isPending:status==='pending',isUnknown:status==='unknown',isSuccess:status==='success',isError:status==='error'||status==='unknown',data,error};}
// REQ-QL-006: Activity can unsubscribe effects without destroying the entry's stable handle state.
export class WorkerMutationHandle<I,O> {
  private state:MutationSnapshot<O>=snapshot('idle');
  private listeners=new Set<()=>void>();
  constructor(private session:InvocationQueries,readonly entryId:string,readonly worker:WorkerContract,readonly op:string){}
  getSnapshot=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private publish(state:MutationSnapshot<O>){this.state=state;for(const notify of this.listeners)notify();}
  mutateAsync=async(input:I):Promise<O>=>{
    if(this.state.isPending)throw new AppError('pending','This action is already pending.');
    if(this.state.isUnknown)throw new AppError('outcome_unknown','The previous action may have committed. Inspect the owner before starting a new action. No retry was attempted.');
    this.session.assertLive();this.publish(snapshot('pending'));
    try{const result=await this.session.executeMutation(this.entryId,this.worker,this.op,input) as O;this.publish(snapshot('success',result));return result;}
    catch(error){const failure=error instanceof Error?error:new Error(String(error));this.publish(snapshot<O>((failure as AppError).code==='outcome_unknown'?'unknown':'error',undefined,failure));throw failure;}
  };
}

const SessionContext=createContext<InvocationQueries|null>(null);
const EntryContext=createContext<{entryId:string;onQueryCommit?:()=>void}|null>(null);
export function InvocationQueryProvider({session,children}:{session:InvocationQueries;children:React.ReactNode}) {
  return <SessionContext.Provider value={session}><QueryClientProvider client={session.queryClient}>{children}</QueryClientProvider></SessionContext.Provider>;
}
export function EntryQueryProvider({entryId,onQueryCommit,children}:{entryId:string;onQueryCommit?:()=>void;children:React.ReactNode}) {
  return <EntryContext.Provider value={{entryId,onQueryCommit}}>{children}</EntryContext.Provider>;
}
function useScope(){const session=useContext(SessionContext),entry=useContext(EntryContext);if(!session||!entry)throw new Error('Worker queries require an invocation and entry provider.');return {session,...entry};}
export function useWorkerQuery<C extends WorkerContract,K extends ReadOperation<C>>(worker:C,op:K,input:OperationInput<C,K>):UseQueryResult<OperationOutput<C,K>,Error> {
  const {session,entryId,onQueryCommit}=useScope();
  const result=useQuery<OperationOutput<C,K>,Error>(session.queryOptions(entryId,worker,op,input));
  const commit=useRef(onQueryCommit);commit.current=onQueryCommit;
  useEffect(()=>{commit.current?.();},[result.dataUpdatedAt,result.errorUpdatedAt]);
  return result;
}
export function useWorkerMutation<C extends WorkerContract,K extends WriteOperation<C>>(worker:C,op:K) {
  const {session,entryId}=useScope();
  const [handle]=useState(()=>session.mutation(entryId,worker,op));
  if(handle.entryId!==entryId||handle.worker!==worker||handle.op!==op)throw new Error('A mutation handle cannot change its entry or operation. Mount a new action instead.');
  const state=useSyncExternalStore(handle.subscribe,handle.getSnapshot,handle.getSnapshot);
  return {...state,mutateAsync:handle.mutateAsync};
}
