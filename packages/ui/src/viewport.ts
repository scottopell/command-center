// REQ-NV-005: one owned viewport, stable optional item IDs and deterministic fallback.
export interface ReturnPosition {
  top:number; left:number; anchor:string|null; offset:number; order:string[];
  focus:WeakRef<HTMLElement>|null; correcting:boolean;
}
function items(viewport:HTMLElement) { return Array.from(viewport.querySelectorAll<HTMLElement>('[data-nav-item]')); }
function focusable(el:HTMLElement|null):HTMLElement|null {
  if(!el||!el.isConnected||el.closest('[inert]'))return null;
  if(el.tabIndex>=0&&!el.matches(':disabled'))return el;
  return el.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"],a[href]');
}
export function capturePosition(viewport:HTMLElement):ReturnPosition {
  const rows=items(viewport),focus=document.activeElement instanceof HTMLElement&&viewport.contains(document.activeElement)?document.activeElement:null;
  const rect=viewport.getBoundingClientRect();
  const anchor=focus?.closest<HTMLElement>('[data-nav-item]')??rows.find(row=>row.getBoundingClientRect().bottom>rect.top);
  return {top:viewport.scrollTop,left:viewport.scrollLeft,anchor:anchor?.dataset.navItem??null,
    offset:anchor?anchor.getBoundingClientRect().top-rect.top:0,order:rows.map(row=>row.dataset.navItem!),
    focus:focus?new WeakRef(focus):null,correcting:true};
}
export function restorePosition(viewport:HTMLElement,position:ReturnPosition,initial:HTMLElement,claimFocus:boolean):{target:HTMLElement;fallback:boolean} {
  const rows=items(viewport),byId=new Map(rows.map(row=>[row.dataset.navItem!,row]));
  let anchor=position.anchor?byId.get(position.anchor):undefined,fallback=false;
  if(position.anchor&&!anchor){
    const at=position.order.indexOf(position.anchor);
    const choices=[...position.order.slice(at+1),...position.order.slice(0,Math.max(0,at)).reverse()];
    anchor=choices.map(key=>byId.get(key)).find(row=>row!==undefined);fallback=true;
  }
  viewport.scrollTop=position.top;viewport.scrollLeft=position.left;
  if(anchor)viewport.scrollTop+=anchor.getBoundingClientRect().top-viewport.getBoundingClientRect().top-position.offset;
  const old=position.focus?.deref();
  const target=(!fallback&&old&&viewport.contains(old)?focusable(old):null)??focusable(anchor??null)??initial;
  if(claimFocus)target.focus({preventScroll:true});
  return {target,fallback};
}
