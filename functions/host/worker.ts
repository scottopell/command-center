import {hostContract} from '../../packages/contracts/src/builtins.ts';
import { homedir, hostname, arch, uptime } from 'node:os';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createConnection } from 'node:net';
import { parse as parseToml } from 'smol-toml';
import { AppError, contracts, defineWorker, type OutputFor } from '../../packages/contracts/src/index.ts';

const execute = promisify(execFile);
async function command(program: string, args: string[]) { return (await execute(program, args, { timeout: 5000, maxBuffer: 4 * 1024 * 1024 })).stdout; }
type Runtime = { pid: number | null; exit: number | null };
type Source = { path: string; state: string; message?: string };
export function parseRuntime(text: string): Map<string, Runtime> {
  const lines = text.trim().split('\n');
  if (!/^PID\s+Status\s+Label\s*$/.test(lines[0] ?? '')) throw new Error('Unrecognized launchd inventory');
  const result = new Map<string, Runtime>();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const m = line.trim().match(/^(\d+|-)\s+(-?\d+|-)\s+(\S+)$/);
    if (!m) throw new Error('Incomplete launchd inventory');
    result.set(m[3], { pid: m[1] === '-' ? null : Number(m[1]), exit: m[2] === '-' ? null : Number(m[2]) });
  }
  return result;
}
function probe(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let finished = false;
    const done = (value: boolean) => { if (!finished) { finished = true; socket.destroy(); resolve(value); } };
    socket.setTimeout(250, () => done(false)); socket.once('connect', () => done(true)); socket.once('error', () => done(false));
  });
}
function portFor(plist: Record<string, any>): number | null {
  const candidates: unknown[] = Object.entries(plist.EnvironmentVariables ?? {}).filter(([key]) => /(?:^|_)PORT$/i.test(key)).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v);
  const args = plist.ProgramArguments ?? [];
  for (let i=0;i<args.length;i++) if (typeof args[i] === 'string') {
    if (args[i] === '--port') candidates.push(args[i+1]);
    if (args[i].startsWith('--port=')) candidates.push(args[i].slice(7));
  }
  return candidates.map(Number).find(n => Number.isInteger(n) && n > 0 && n <= 65535) ?? null;
}
export interface HostDependencies {
  home?: string;
  runtime?: () => Promise<string>;
  plist?: (file: string) => Promise<Record<string, any>>;
  port?: (port: number) => Promise<boolean>;
  listener?: (pid: number, port: number) => Promise<boolean | null>;
}

// REQ-HO-003/004/005: independent sources, exact Label join, no toolkit executable import.
export async function collectServices(deps: HostDependencies = {}) {
  const home = deps.home ?? homedir(), configPath = path.join(home, '.local/etc/toolkit.toml');
  const sources: Source[] = [];
  const declarations = new Map<string, { name: string; source: string | null; prod: string | null; notes: string | null }>();
  const expand = (p: unknown) => typeof p === 'string' ? p.startsWith('~/') ? path.join(home, p.slice(2)) : p : null;
  try {
    const config = parseToml(await readFile(configPath, 'utf8')) as Record<string, any>;
    if (config.service !== undefined && (!config.service || typeof config.service !== 'object' || Array.isArray(config.service))) throw new Error('service must contain named tables');
    const entries = Object.entries(config.service ?? {}) as [string, Record<string, unknown>][];
    for (const [name, svc] of entries) {
      if (!svc || typeof svc !== 'object' || Array.isArray(svc)) throw new Error(`Invalid service declaration: ${name}`);
      for (const field of ['source','prod','notes']) if (svc[field] !== undefined && typeof svc[field] !== 'string') throw new Error(`service.${name}.${field} must be text`);
    }
    for (const [name, svc] of entries) declarations.set(`com.scottopell.${name}`, { name, source: expand(svc.source), prod: expand(svc.prod), notes: typeof svc.notes === 'string' ? svc.notes : null });
    sources.push({ path: configPath, state: 'ok' });
  } catch (error: any) { sources.push({ path: configPath, state: error.code === 'ENOENT' ? 'not configured' : 'unavailable', message: error.message }); }
  const definitions = new Map<string, { file: string; data: Record<string, any> }[]>();
  const directory = path.join(home, 'Library/LaunchAgents');
  try {
    const files = (await readdir(directory, { withFileTypes: true })).filter(f => (f.isFile() || f.isSymbolicLink()) && f.name.endsWith('.plist')).sort((a,b)=>a.name.localeCompare(b.name));
    for (const f of files) {
      const file = path.join(directory, f.name);
      try {
        const data = await (deps.plist ?? (async file => JSON.parse(await command('/usr/bin/plutil', ['-convert','json','-o','-',file]))))(file);
        if (typeof data.Label !== 'string' || !data.Label.trim()) throw new Error('Missing valid Label');
        definitions.set(data.Label, [...(definitions.get(data.Label) ?? []), { file, data }]);
      } catch (error: any) { sources.push({ path: file, state: 'discovery error', message: error.message }); }
    }
    sources.push({ path: directory, state: 'ok' });
  } catch (error: any) { sources.push({ path: directory, state: error.code === 'ENOENT' ? 'not configured' : 'unavailable', message: error.message }); }
  let runtime: Map<string, Runtime> | null = null;
  try { runtime = parseRuntime(await (deps.runtime ?? (()=>command('/bin/launchctl',['list'])))()); sources.push({ path: 'launchctl list (current user)', state: 'ok' }); }
  catch (error: any) { sources.push({ path: 'launchctl list (current user)', state: 'unavailable', message: error.message }); }
  const labels = [...new Set([...declarations.keys(), ...definitions.keys()])].sort();
  const services = await Promise.all(labels.map(async label => {
    const declared = declarations.get(label), entries = definitions.get(label) ?? [];
    const p = entries.length === 1 ? entries[0].data : {};
    const rt = runtime?.get(label), pid = rt?.pid ?? null, lastExit = rt?.exit ?? null;
    const loaded = runtime ? runtime.has(label) : null;
    const scheduled = entries.length === 1 ? Object.hasOwn(p, 'StartInterval') || Object.hasOwn(p,'StartCalendarInterval') : null;
    const state = runtime === null ? 'Runtime unavailable' : pid ? 'Running' : !loaded ? 'Not loaded' : lastExit !== null && lastExit !== 0 ? 'Loaded · stopped · last exit nonzero' : scheduled ? 'Loaded · idle · scheduled' : 'Loaded · idle';
    const port = portFor(p);
    const reachable = port ? await (deps.port ?? probe)(port).catch(()=>false) : null;
    // Reachability can belong to a different process; inspect the matched PID separately.
    let listening: boolean | null = null;
    if (port && pid) {
      try { listening = await (deps.listener ?? (async (pid, port) => { try { return (await command('/usr/sbin/lsof',['-nP','-a','-p',String(pid),`-iTCP:${port}`,'-sTCP:LISTEN','-Fn'])).split('\n').some(l=>l.startsWith('n')); } catch (e: any) { return e.code === 1 ? false : null; } }))(pid, port); }
      catch { listening = null; }
    }
    return { label, name: declared?.name ?? label, declared: !!declared, source: declared?.source ?? null, prod: declared?.prod ?? null, notes: declared?.notes ?? null, plistPaths: entries.map(e=>e.file), definitionConflict: entries.length > 1, definitionPresent: entries.length > 0, loaded, pid, lastExit, scheduled, state, program: p.ProgramArguments?.[0] ?? p.Program ?? null, workingDirectory: p.WorkingDirectory ?? null, logPath: p.StandardErrorPath ?? p.StandardOutPath ?? null, port, reachable, listening, health: 'Not assessed', observedAt: new Date().toISOString() };
  }));
  return { services, sources, observedAt: new Date().toISOString() };
}

type Snapshot=OutputFor<'HOST','snapshot'>;
export interface HostWorkerDependencies {
  collect?:()=>Promise<{services:Snapshot['services'];sources:Source[];observedAt:string}>;
  machine?:()=>Promise<Snapshot['machine']>;
  environment?:()=>Snapshot['environment'];
}
async function machineSnapshot():Promise<Snapshot['machine']>{
  const get=async(program:string,args:string[],fallback:string)=>{try{return (await command(program,args)).trim();}catch{return fallback;}};
  return {computerName:await get('/usr/sbin/scutil',['--get','ComputerName'],hostname()),hostname:hostname(),osVersion:await get('/usr/bin/sw_vers',['-productVersion'],'Unknown'),architecture:arch(),uptimeSeconds:uptime(),applicationVersion:'0.1.0',workingDirectory:process.cwd()};
}
function boundedSnapshot(snapshot:Snapshot):Snapshot{
  const encoded=JSON.stringify(snapshot);
  if(Buffer.byteLength(encoded)>1024*1024)throw new AppError('observation_unavailable','HOST observations exceed the 1 MiB snapshot limit. No previous complete observation was replaced.');
  return JSON.parse(encoded) as Snapshot;
}
// REQ-HO-005: one service-owned, bounded plain-data observation; no view/cache callbacks.
export function createHostWorker(deps:HostWorkerDependencies={}){
  let lastComplete:Snapshot|undefined,lastCompleteRequest=0,requestSequence=0;
  return defineWorker(hostContract,{
    snapshot:async()=>{
      const request=++requestSequence,snapshot=await (deps.collect??collectServices)();
      const failures=snapshot.sources.filter(source=>source.state==='unavailable'||source.state==='discovery error');
      if(failures.length&&lastComplete){
        const diagnostics=failures.slice(0,32).map(source=>({path:source.path.slice(0,1024),state:source.state,message:(source.message??'Observation unavailable').slice(0,512),observedAt:snapshot.observedAt}));
        return {...structuredClone(lastComplete),sources:[{path:'HOST snapshot refresh',state:'stale',code:'observation_unavailable',message:'Last complete snapshot retained. Current source errors do not establish absence.',observedAt:snapshot.observedAt},...diagnostics,...(failures.length>32?[{path:'HOST snapshot refresh',state:'unavailable',message:'Additional source errors omitted.'}]:[])]};
      }
      const result=boundedSnapshot({...snapshot,machine:await (deps.machine??machineSnapshot)(),environment:(deps.environment??(()=>Object.fromEntries(['PATH','LANG','LC_ALL','TZ'].map(key=>[key,process.env[key]??null]))))()});
      if(failures.length){
        result.sources.unshift({path:'HOST snapshot completeness',state:'unavailable',code:'observation_unavailable',message:'Partial initial observation. Failed sources are unavailable, not empty.',observedAt:snapshot.observedAt});
        return result;
      }
      // A slower earlier collection must not replace a later requested complete snapshot.
      if(request>lastCompleteRequest){lastComplete=structuredClone(result);lastCompleteRequest=request;}
      return result;
    },
  });
}
export const hostWorker=createHostWorker();
