import React, { Activity, Component, createContext, useContext, useEffect, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import { AppError } from './contracts.ts';
import { InvocationQueries, InvocationQueryProvider, EntryQueryProvider, type ReadClient, type QueryTransportOptions } from './queries.tsx';
import { capturePosition, restorePosition, type ReturnPosition } from './viewport.ts';
import {snapshotSequence,adjacent,type SequenceInput,type SiblingSequence} from './sequence.ts';

export interface Client extends ReadClient { openExternal(url:string):Promise<void> }
export interface CommandContext {tail:string}
export interface ResolveContext extends CommandContext {signal:AbortSignal;client:Client}
export interface FunctionDefinition<P> {mnemonic:string;title:string;prepare(ctx:CommandContext):P;View:React.ComponentType<NoInfer<P>>;screens?:ScreenRegistry}
export interface ScreenDefinition<P=any,I extends z.ZodType=z.ZodType> {params:I;View:React.ComponentType<P>}
export type ScreenRegistry=Record<string,ScreenDefinition<any,any>>;
// REQ-FF-001, REQ-NV-001: inference comes from resolution; typed destinations are immutable metadata.
export function defineFunction<R extends(ctx:CommandContext)=>any,S extends ScreenRegistry={}>(definition:{mnemonic:string;title:string;prepare:R & (ReturnType<R> extends PromiseLike<unknown>?never:unknown);View:React.ComponentType<NoInfer<ReturnType<R>>>;screens?:S}){return definition;}
export function defineScreen<I extends z.ZodType>(definition:{params:I;View:React.ComponentType<z.output<I>>}):ScreenDefinition<z.output<I>,I>{return Object.freeze(definition);}
const OpenExternalContext=createContext<((url:string)=>Promise<void>)|null>(null);
export function useOpenExternal(){const open=useContext(OpenExternalContext);if(!open)throw new Error('Source links require an active entry');return open;}
export function defineScreens<S extends ScreenRegistry>(screens:S):Readonly<S>{return Object.freeze(screens);}
type NavigationIntent='push'|'replace'|'collection';
type Navigation<S extends ScreenRegistry>={pushSequence<K extends keyof S&string>(screen:K,sequence:SequenceInput<z.input<S[K]['params']>>):void;push<K extends keyof S&string>(screen:K,params:z.input<S[K]['params']>):void;replace<K extends keyof S&string>(screen:K,params:z.input<S[K]['params']>):void};
const NavigationContext=createContext<((registry:ScreenRegistry,intent:NavigationIntent,screen:string,params:unknown)=>void)|null>(null);
export function useNavigation<S extends ScreenRegistry>(screens:S):Navigation<S>{
  const navigate=useContext(NavigationContext);if(!navigate)throw new Error('Navigation requires an entry provider.');
  return {pushSequence:(name,sequence)=>navigate(screens,'collection',name,sequence),push:(name,params)=>navigate(screens,'push',name,params),replace:(name,params)=>navigate(screens,'replace',name,params)};
}
interface Host {
  reply(id:number,body:any):void;handoff(segments:string[]):void;activate():void;pause():void;dispose():void;
  admitEntry(entryId:string):void;back():void;step(direction:-1|1):void;selectAllDisplay(entryId:string):void;diagnostics():unknown;
}
declare global {interface Window {webkit?:{messageHandlers:{commandCenter:{postMessage(message:unknown):void}}};commandCenterHost:Host}}
type Entry={transitionToken:string;createdAt:number;transitionAt:number;preparedAt:number|null;interactiveAt:number|null;id:string;name:string;params:unknown;siblings?:SiblingSequence;screen?:ScreenDefinition<any,any>;controller:AbortController;phase:'resolving'|'prepared'|'interactive'|'error'|'retired';props?:any;error?:string;viewport:HTMLElement|null;target:HTMLElement|null;position:ReturnPosition|null;restoring:boolean;needsRevalidation:boolean;preparedSent:boolean;notice:string;onQueryCommit:()=>void;navigate:(registry:ScreenRegistry,intent:NavigationIntent,name:string,params:unknown)=>void};

// This runtime is private to one disposable document. Screen lifetime is framework-owned.
export function mount<P>(definition:FunctionDefinition<P>,tail:string) {
  const rootElement=document.getElementById('root')!,root=createRoot(rootElement);
  let disposed=false,interactive=false,sourceGesture=false,sequence=0,entrySequence=0,transitionSequence=0,revision=0;
  let entries:Entry[]=[];
  let pendingNavigation:{entryId:string;intent:'push'|'replace'|'back';next?:Entry}|null=null;
  const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;cleanup:()=>void}>();
  const send=(message:object)=>{if(!disposed)window.webkit?.messageHandlers.commandCenter.postMessage(message);};
  const current=()=>entries.at(-1);
  const owned=(id:string)=>!disposed&&interactive&&!pendingNavigation&&current()?.id===id&&current()?.phase==='interactive';
  const request=(fn:string,op:string,input:unknown,options:QueryTransportOptions)=>new Promise<unknown>((resolve,reject)=>{
    if(disposed){reject(new AppError('retired','This invocation has retired.'));return;}
    if(options.signal?.aborted){reject(new AppError('cancelled','This read is no longer needed.'));return;}
    const id=++sequence,abort=()=>{const waiter=pending.get(id);if(!waiter)return;pending.delete(id);waiter.cleanup();reject(new AppError('cancelled','This read is no longer needed.'));};
    const cleanup=()=>options.signal?.removeEventListener('abort',abort);
    pending.set(id,{resolve,reject,cleanup});options.signal?.addEventListener('abort',abort,{once:true});
    send({kind:'rpc',id,function:fn,operation:op,input,entryId:options.entryId});
  });
  const data=new InvocationQueries({request,isInteractive:owned});
  function initial(entry:Entry):HTMLElement {
    const viewport=entry.viewport;if(!viewport)throw new Error('The entry viewport is not attached.');
    const markers=viewport.querySelectorAll<HTMLElement>('[data-initial-focus]');
    if(markers.length!==1)throw new Error(`Expected exactly one initial focus destination; found ${markers.length}`);
    const el=markers[0],style=getComputedStyle(el);
    if(!el.isConnected||el.matches(':disabled,[inert]')||el.closest('[inert]')||!el.getClientRects().length||style.visibility==='hidden'||style.display==='none'||el.tabIndex<0)throw new Error('Initial focus destination is hidden, disabled, detached, or not focusable');
    return el;
  }
  function fail(error:unknown,entry:Entry) {
    if(disposed||current()!==entry||entry.phase==='retired')return;
    interactive=false;entry.phase='error';entry.error=error instanceof Error?error.message:String(error);
    send({kind:'error',entryId:entry.id,message:entry.error});
  }
  function notice(message:string,entry=current()) {
    if(!entry||disposed||current()!==entry)return;
    entry.notice=message;send({kind:'refused',entryId:entry.id,message});render();
  }
  function correct(entry:Entry,claimFocus=false) {
    if(current()!==entry||!entry.viewport||!entry.position?.correcting)return;
    const result=restorePosition(entry.viewport,entry.position,initial(entry),claimFocus);
    entry.target=result.target;
    if(result.fallback&&!entry.notice){entry.notice='The previous item is no longer in this list. Position restored to a nearby item.';render();}
  }
  function prepare(entry:Entry) {
    if(disposed||current()!==entry||entry.phase==='error'||entry.phase==='retired'||entry.preparedSent)return;
    try{
      entry.target=initial(entry);
      if(entry.restoring)correct(entry,false);
      entry.phase='prepared';entry.preparedAt=performance.now();entry.preparedSent=true;
      const token=entry.transitionToken;let acknowledged=false,frame=0;
      const checkpoint=(mode:'frame'|'throttled')=>{
        if(acknowledged)return;acknowledged=true;clearTimeout(fallback);cancelAnimationFrame(frame);
        setTimeout(()=>{
          if(disposed||current()!==entry||entry.transitionToken!==token||entry.phase==='retired'||entry.phase==='error')return;
          try{const destination=initial(entry);if(entry.restoring)correct(entry,false);else entry.target=destination;send({kind:'viewReady',entryId:entry.id,transitionToken:token,renderOpportunity:mode,visibility:document.visibilityState,phases:{preparedMs:Math.round(entry.preparedAt!-entry.transitionAt),checkpointMs:Math.round(performance.now()-entry.transitionAt)}});publishSiblings();}catch(error){fail(error,entry);}
        },0);
      };
      // WKWebView can throttle rAF when occluded; a separately queued probe still tests responsiveness.
      const fallback=setTimeout(()=>checkpoint('throttled'),100);
      frame=requestAnimationFrame(()=>checkpoint('frame'));
    }catch(error){fail(error,entry);}
  }
  function makeEntry(name:string,params:unknown,screen?:ScreenDefinition<any,any>):Entry {
    const id=screen?`entry-${++entrySequence}`:'root';
    return {transitionToken:screen?`transition-${++transitionSequence}`:'root',createdAt:performance.now(),transitionAt:performance.now(),preparedAt:null,interactiveAt:null,id,name,params,screen,controller:new AbortController(),phase:'resolving',viewport:null,target:null,position:null,restoring:false,needsRevalidation:false,preparedSent:false,notice:'',
      onQueryCommit:()=>{const entry=entries.find(e=>e.id===id);if(entry&&current()===entry&&(entry.phase==='interactive'||entry.phase==='prepared'))try{correct(entry,owned(id));}catch(error){notice(error instanceof Error?error.message:String(error),entry);}},
      navigate:(registry,intent,destination,input)=>navigate(id,registry,intent,destination,input)};
  }
  function clientFor(entry:Entry):Client {
    const id=entry.id,reader=data.readClient(id,entry.controller.signal);
    return {call:reader.call,openExternal:url=>new Promise<void>((resolve,reject)=>{
      if(!owned(id)||!sourceGesture){reject(new AppError('not_ready','Open links with a fresh click once the function is interactive.'));return;}
      const requestId=++sequence;pending.set(requestId,{resolve,reject,cleanup:()=>{}});send({kind:'openExternal',id:requestId,entryId:id,url});
    })};
  }
  function resolveEntry(entry:Entry) {
    try{
      const props=entry.screen?entry.params:definition.prepare({tail});
      if(!props||typeof props!=='object'||'then' in props)throw new Error('Command preparation must return synchronous view props');
      entry.props=props;render();
    }catch(error){fail(error,entry);}
  }
  function retireEntry(entry:Entry) {
    entry.phase='retired';entry.controller.abort();entry.siblings=undefined;entry.viewport=null;entry.target=null;entry.position=null;entry.props=undefined;entry.error=undefined;entry.notice='';
  }
  function requestEntry(intent:'push'|'replace'|'back',next?:Entry) {
    const from=current();if(!from||disposed||pendingNavigation)return;
    if(intent==='push'&&entries.length>=4){notice('Navigation limit reached (4 screens). Go Back before opening another nested screen.',from);return;}
    if(intent==='back'&&entries.length===1)return;
    const target=intent==='back'?entries[entries.length-2]:next!;
    if(intent==='back')target.transitionToken=`transition-${++transitionSequence}`;
    pendingNavigation={entryId:target.id,intent,next};interactive=false;sourceGesture=false;
    send({kind:'entryRequest',entryId:target.id,fromEntryId:from.id,depth:entries.length+(intent==='push'?1:intent==='back'?-1:0),intent,transitionToken:target.transitionToken,transitionKind:intent==='replace'&&target.siblings?'sibling':intent});
  }
  function navigate(origin:string,registry:ScreenRegistry,intent:NavigationIntent,name:string,input:unknown) {
    if(!owned(origin))return;
    if(registry!==definition.screens){notice('Navigation registry does not belong to this function.');return;}
    const screen=registry[name];if(!Object.hasOwn(registry,name)||!screen){notice('Unknown screen destination.');return;}
    if(intent==='collection'){
      try{const siblings=snapshotSequence(name,screen.params,input as SequenceInput<unknown>),item=siblings.items[siblings.index];const entry=makeEntry(name,structuredClone(item.params),screen);entry.siblings=siblings;requestEntry('push',entry);}catch{notice('Invalid collection: use unique keys, a selected item and valid bounded destination parameters.');}
      return;
    }
    const parsed=screen.params.safeParse(input);if(!parsed.success){notice('Invalid screen parameters.');return;}
    requestEntry(intent,makeEntry(name,parsed.data,screen));
  }
  // REQ-NV-011/012: one adjacent replacement; plain navigation never inherits context.
  function step(direction:-1|1){
    const source=current();if(!source||!owned(source.id)||!source.siblings)return;
    const siblings=adjacent(source.siblings,direction);if(!siblings)return;
    const screen=definition.screens![siblings.screen],entry=makeEntry(siblings.screen,structuredClone(siblings.items[siblings.index].params),screen);
    entry.siblings=siblings;requestEntry('replace',entry);
  }
  function publishSiblings(){const entry=current();if(entry)send({kind:'siblings',entryId:entry.id,index:entry.siblings?entry.siblings.index+1:0,count:entry.siblings?.items.length??0});}
  function render() {if(!disposed)root.render(<RuntimeRoot revision={++revision}/>);}
  function EntryHost({entry,visible}:{entry:Entry;visible:boolean}) {
    useLayoutEffect(()=>{if(visible&&entry.props!==undefined&&!entry.error)prepare(entry);},[visible,entry.props,entry.error,entry.transitionAt]);
    // Passive child subscriptions have reattached before this parent Effect.
    useEffect(()=>{if(visible&&current()===entry&&entry.props!==undefined&&entry.needsRevalidation){entry.needsRevalidation=false;void data.revalidateVisible();}},[visible,entry.props,entry.transitionAt]);
    return <div className="entry-viewport" data-entry-id={entry.id} ref={element=>{entry.viewport=element;}} inert={!visible}>
      {entry.notice&&<div className="entry-notice" role="status">{entry.notice}</div>}
      {entry.props!==undefined&&!entry.error?<EntryBoundary entry={entry}><EntryView entry={entry}/></EntryBoundary>:<div className="entry-loading">{entry.error??'Loading…'}</div>}
    </div>;
  }
  function EntryView({entry}:{entry:Entry}) {const View=entry.screen?.View??definition.View;return <View {...entry.props}/>;}
  class EntryBoundary extends Component<{entry:Entry;children:React.ReactNode},{error:boolean}> {
    state={error:false};static getDerivedStateFromError(){return {error:true};}componentDidCatch(error:Error){fail(error,this.props.entry);}render(){return this.state.error?null:this.props.children;}
  }
  function RuntimeRoot(_props:{revision:number}) {
    return <InvocationQueryProvider session={data}>{entries.map(entry=><Activity key={entry.id} mode={current()===entry?'visible':'hidden'}>
      <NavigationContext.Provider value={entry.navigate}><EntryQueryProvider entryId={entry.id} onQueryCommit={entry.onQueryCommit}><OpenExternalContext.Provider value={clientFor(entry).openExternal}><EntryHost entry={entry} visible={current()===entry}/></OpenExternalContext.Provider></EntryQueryProvider></NavigationContext.Provider>
    </Activity>)}</InvocationQueryProvider>;
  }
  const isText=(el:Element|null):el is HTMLInputElement|HTMLTextAreaElement=>el instanceof HTMLTextAreaElement||(el instanceof HTMLInputElement&&['text','search','email','url','tel','password'].includes(el.type));
  function text(value:string,entry:Entry) {
    if(!value)return;const el=entry.target,viewport=entry.viewport;
    if(!isText(el)||!viewport?.contains(el)||el.matches(':disabled')||el.closest('[inert]')||el.readOnly||!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')throw new Error('Queued text cannot be delivered to this destination');
    if(el instanceof HTMLInputElement&&/[\r\n]/.test(value))throw new Error('Queued multiline text requires a textarea destination');
    const prototype=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,start=el.value.length;
    Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(el,el.value+value);
    try{el.setSelectionRange(start+value.length,start+value.length);}catch{}
    el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
  }
  function tab(entry:Entry) {
    const controls=Array.from(entry.viewport!.querySelectorAll<HTMLElement>('input,textarea,select,button,a[href],[tabindex]')).filter(e=>e.tabIndex>=0&&!e.matches(':disabled,[inert]')&&!e.closest('[inert]')&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
    controls.sort((a,b)=>(a.tabIndex>0?a.tabIndex:Infinity)-(b.tabIndex>0?b.tabIndex:Infinity));
    const index=controls.indexOf(entry.target!),next=controls[index+1];
    if(index<0)throw new Error('Buffered Tab lost its expected destination');
    if(!next||!isText(next)||next.readOnly)throw new Error('Buffered Tab reached an unsupported destination; only ordinary text fields are supported while loading');
    entry.target=next;next.focus();
  }
  window.commandCenterHost={
    reply(id,body){const waiter=pending.get(id);if(!waiter||disposed)return;pending.delete(id);waiter.cleanup();body.ok?waiter.resolve(body.result):waiter.reject(new AppError(body.error.code,body.error.message,body.error.details));},
    handoff(segments){const entry=current();if(disposed||!entry)throw new Error('Invocation retired');entry.target??=initial(entry);entry.target.focus({preventScroll:entry.restoring});if(document.activeElement!==entry.target)throw new Error('Initial focus could not be established');segments.forEach((segment,index)=>{if(index)tab(entry);text(segment,entry);});},
    activate(){const entry=current();if(disposed||!entry)throw new Error('Invocation retired');interactive=true;entry.phase='interactive';entry.interactiveAt=performance.now();entry.restoring=false;publishSiblings();render();},
    pause(){interactive=false;sourceGesture=false;},
    admitEntry(entryId){
      const transition=pendingNavigation;if(disposed||!transition||transition.entryId!==entryId)return;
      pendingNavigation=null;const from=current()!;
      if(from.viewport)from.position=capturePosition(from.viewport);
      if(transition.intent==='back'){entries.pop();retireEntry(from);const parent=current()!;parent.phase='prepared';parent.transitionAt=performance.now();parent.preparedAt=null;parent.interactiveAt=null;parent.preparedSent=false;parent.restoring=true;parent.needsRevalidation=true;if(parent.position)parent.position.correcting=true;render();}
      else {if(transition.intent==='replace'){entries.pop();retireEntry(from);}const entry=transition.next!;entries.push(entry);render();resolveEntry(entry);}
    },
    back(){requestEntry('back');},
    step(direction){if(direction===-1||direction===1)step(direction);},
    selectAllDisplay(entryId){
      const entry=current();if(!entry||entry.id!==entryId||!owned(entryId)||!entry.viewport||editing(document.activeElement))return;
      document.getSelection()?.selectAllChildren(entry.viewport);copySelectionFor(entryId);
    },
    diagnostics(){return {depth:entries.length,activeEntry:current()?.id,entries:entries.map(e=>({id:e.id,screen:e.name,phase:e.phase,visible:e===current(),sequenceCount:e.siblings?.items.length??0,sequenceIndex:e.siblings?e.siblings.index+1:0,ageMs:Math.round(performance.now()-e.createdAt),preparedMs:e.preparedAt===null?null:Math.round(e.preparedAt-e.transitionAt),interactiveMs:e.interactiveAt===null?null:Math.round(e.interactiveAt-e.transitionAt)})),...data.diagnostics(),deliveryWaiters:pending.size};},
    dispose(){if(disposed)return;disposed=true;interactive=false;sourceGesture=false;selectionGesture=null;if(pendingNavigation?.next)retireEntry(pendingNavigation.next);pendingNavigation=null;for(const entry of entries)retireEntry(entry);entries=[];data.dispose();root.unmount();for(const waiter of pending.values()){waiter.cleanup();waiter.reject(new AppError('retired','Invocation retired'));}pending.clear();},
  };
  const editing=(node:Node|null)=>{const element=node instanceof Element?node:node?.parentElement;return !!element?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');};
  // REQ-NV-012: document shortcuts can leave ordinary editable key behavior alone.
  document.addEventListener('keydown',event=>{
    if(!event.metaKey||!event.altKey||event.ctrlKey||event.shiftKey||!['ArrowUp','ArrowDown'].includes(event.key)||editing(event.target as Node))return;
    const entry=current();if(!entry?.siblings||!owned(entry.id))return;
    event.preventDefault();event.stopPropagation();if(!event.repeat)step(event.key==='ArrowUp'?-1:1);
  },true);
  // REQ-SH-016: copy only after a completed trusted selection gesture, never on selectionchange.
  type SelectionGesture={entryId:string;kind:'pointer'|'keyboard';moved:boolean;before:{anchor:WeakRef<Node>;focus:WeakRef<Node>;anchorOffset:number;focusOffset:number}|null};
  let selectionGesture:SelectionGesture|null=null;
  const beginSelection=(event:Event,kind:'pointer'|'keyboard')=>{const entry=current();if(event.isTrusted&&entry&&owned(entry.id)&&event.target instanceof Node&&entry.viewport?.contains(event.target)&&!editing(event.target)){const selected=document.getSelection();selectionGesture={entryId:entry.id,kind,moved:false,before:selected?.anchorNode&&selected.focusNode&&!selected.isCollapsed?{anchor:new WeakRef(selected.anchorNode),focus:new WeakRef(selected.focusNode),anchorOffset:selected.anchorOffset,focusOffset:selected.focusOffset}:null};}};
  document.addEventListener('pointerdown',event=>{selectionGesture=null;if(event.button===0)beginSelection(event,'pointer');},true);
  document.addEventListener('mousedown',event=>{if(event.isTrusted&&event.detail>1&&selectionGesture?.kind==='pointer')selectionGesture.moved=true;},true);
  document.addEventListener('pointermove',event=>{if(event.isTrusted&&event.buttons===1&&selectionGesture?.kind==='pointer')selectionGesture.moved=true;},true);
  document.addEventListener('keydown',event=>{if((event.shiftKey&&/^(Arrow|Home|End|Page)/.test(event.key))||(event.metaKey&&!event.altKey&&!event.ctrlKey&&event.key.toLowerCase()==='a'))beginSelection(event,'keyboard');},true);
  function finishSelection(event:Event,kind:'pointer'|'keyboard'){
    const gesture=selectionGesture;if(!event.isTrusted||gesture?.kind!==kind)return;selectionGesture=null;
    const selected=document.getSelection(),before=gesture.before;
    if(kind==='pointer'&&before&&!gesture.moved&&(event as PointerEvent).detail<2&&selected&&selected.anchorNode===before.anchor.deref()&&selected.focusNode===before.focus.deref()&&selected.anchorOffset===before.anchorOffset&&selected.focusOffset===before.focusOffset)return;
    copySelectionFor(gesture.entryId);
  }
  function copySelectionFor(entryId:string){
      const entry=current(),selection=document.getSelection();
      if(!entry||entry.id!==entryId||!owned(entry.id)||!entry.viewport||!selection||selection.isCollapsed||selection.rangeCount!==1||editing(document.activeElement))return;
      const range=selection.getRangeAt(0),viewport=entry.viewport;
      if(!range.intersectsNode(viewport)||editing(selection.anchorNode)||editing(selection.focusNode))return;
      const allowed=(node:Node|null)=>!!node&&(viewport.contains(node)||[rootElement,document.body,document.documentElement].includes(node as HTMLElement));
      if(!allowed(selection.anchorNode)||!allowed(selection.focusNode))return;
      if(Array.from(viewport.querySelectorAll('input,textarea,select,[contenteditable]:not([contenteditable="false"])')).some(element=>range.intersectsNode(element)))return;
      const value=selection.toString();if(!value.length)return;
      if(new TextEncoder().encode(value).length>2*1024*1024){notice('Selected text exceeds the 2 MiB clipboard limit.');return;}
      send({kind:'copySelection',entryId:entry.id,text:value});
  }
  document.addEventListener('pointerup',event=>finishSelection(event,'pointer'),true);
  document.addEventListener('pointercancel',()=>{selectionGesture=null;},true);
  document.addEventListener('keyup',event=>finishSelection(event,'keyboard'),true);
  const markIntent=(event:Event)=>{const entry=current();if(!interactive||!entry?.position||!event.isTrusted)return;if(event.target instanceof Node&&entry.viewport?.contains(event.target))entry.position.correcting=false;};
  for(const kind of ['wheel','pointerdown','keydown','touchstart'])document.addEventListener(kind,markIntent,{capture:true,passive:true});
  document.addEventListener('click',event=>{sourceGesture=interactive&&event.isTrusted;setTimeout(()=>{sourceGesture=false;},0);},true);
  for(const kind of ['click','submit','keydown'] as const)document.addEventListener(kind,event=>{if(!interactive){event.preventDefault();event.stopImmediatePropagation();if(!pendingNavigation)send({kind:'refused',entryId:current()?.id,message:'Still loading: type text and Tab; submit again once ready.'});}},true);
  document.addEventListener('securitypolicyviolation',event=>{if(!disposed)send({kind:'refused',entryId:current()?.id,message:`Function resource policy blocked ${event.violatedDirective}. Use registered worker data operations.`});});
  const entry=makeEntry('root',{});entries.push(entry);render();resolveEntry(entry);
}
