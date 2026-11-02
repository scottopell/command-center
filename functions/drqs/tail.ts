import seedGroups from '../../data/groups.json' with {type:'json'};
import type { Group } from '../../packages/contracts/src/index.ts';
export type Route = { kind:'queue'; group?:number; search?:string } | { kind:'add'; group?:number } | { kind:'ticket'; number:number };
// REQ-DR-003: only S consumes an arbitrary literal remainder.
export function parseTail(tail: string, groups: Group[]=seedGroups.groups): Route {
  const value = tail.trim();
  if (!value) return {kind:'queue'};
  if (/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))) return {kind:'ticket',number:Number(value)};
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(value)!;
  const action = match[1].toUpperCase(), operand = match[2] || '';
  if (action === 'S') { if (!operand) throw new Error('S requires search text'); return {kind:'queue',search:operand}; }
  if (!['A','G'].includes(action) || /\s/.test(operand)) throw new Error('Use DRQS, DRQS A [group], DRQS G group, DRQS S text, or DRQS number');
  if (!operand) { if(action==='A')return {kind:'add'}; throw new Error('G requires a group number or slug'); }
  const group = groups.find(g => String(g.number) === operand || g.id.toLowerCase() === operand.toLowerCase());
  if (!group) throw new Error(`Unknown group: ${operand}`);
  return action === 'A' ? {kind:'add',group:group.number} : {kind:'queue',group:group.number};
}
