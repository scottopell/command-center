import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from '../../packs/src/process.ts';
import {diagnosticsReader} from '../../backend/src/diagnostics.ts';
import {dataDirectory} from '../../backend/src/config.ts';
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { call,serviceRequest } from './client.ts';
import { AppError, type Actor } from '../../contracts/src/index.ts';

const help = `CommandCenter local agent client

  command-center drqs groups
  command-center drqs list [--group 42] [--state open|all|Q|A|N|W|R] [--search text] [--type BF]
  command-center drqs create --title text --body text --group 42 --requester employee:email [--actor name]
  command-center drqs get NUMBER
  command-center drqs update NUMBER [--comment text] [--group 44] [--state N] [--owner email|--clear-owner]
  command-center pack list
  command-center pack show ID
  command-center pack add FOLDER
  command-center pack build ID
  command-center pack apply ID --revision CANDIDATE
  command-center pack remove ID
  command-center pack check|test FOLDER
  command-center pack check-installed
  command-center strag list [--since ISO_DATE] [--function MNEMONIC] [--all]
  command-center strag get ID
  command-center host
  command-center call FUNCTION OPERATION --json '{...}'
  command-center call FUNCTION OPERATION --input-file payload.json

CLI calls are attributed to an agent unless --human is used. Agent creation
requires explicit --requester employee:email or customer:reference; repeat the
option to include multiple requesters. --human uses the configured local identity.
Results are JSON; errors are JSON on stderr with exit status 1. Writes never retry.
`;

// REQ-BW-011, REQ-DR-010: convenience parsing, with all domain decisions at the worker.
export async function main(args = process.argv.slice(2)) {
  const {values,positionals} = parseArgs({args,allowPositionals:true,strict:true,options:{
    help:{type:'boolean',short:'h'},since:{type:'string'},function:{type:'string'},all:{type:'boolean'},human:{type:'boolean'},'clear-owner':{type:'boolean'},
    title:{type:'string'},body:{type:'string'},group:{type:'string'},state:{type:'string'},type:{type:'string'},search:{type:'string'},comment:{type:'string'},owner:{type:'string'},actor:{type:'string'},'actor-name':{type:'string'},requester:{type:'string',multiple:true},json:{type:'string'},'input-file':{type:'string'},'data-dir':{type:'string'},revision:{type:'string'}
  }});
  if (values.help || !positionals.length) { console.log(help); return; }
  const directory = values['data-dir'];
  const actor: Actor | undefined = values.human ? undefined : {kind:'agent',id:values.actor || process.env.COMMAND_CENTER_AGENT || 'local-cli',name:values['actor-name'] || values.actor || 'Local coding agent'};
  let result: unknown;
  if(positionals[0].toLowerCase()==='pack'&&['list','show','add','build','apply','remove'].includes(positionals[1])){
    const action=positionals[1],argument=positionals[2];
    if(positionals.length!==(action==='list'?2:3)||action!=='list'&&!argument)throw new AppError('validation','Specify exactly one folder or pack ID (list takes no arguments)');
    if(action==='apply'&&!/^[a-f0-9]{64}$/.test(values.revision??''))throw new AppError('validation','Use pack apply ID --revision CANDIDATE, using the exact candidate returned by pack build/show');
    if(action!=='apply'&&values.revision)throw new AppError('validation','--revision is only supported by pack apply');
    if(action==='list'||action==='show'){
      const packs=await serviceRequest('/management/packs',undefined,directory);
      result=action==='list'?packs:packs.find((pack:any)=>pack.id===argument);
      if(result===undefined)throw new AppError('not_found','Pack not registered');
    }else{
      const payload=action==='add'?{action,source:path.resolve(argument)}:{action,id:argument,...(action==='apply'?{revision:values.revision}:{})};
      result=await serviceRequest('/management/packs',payload,directory,true,['add','build'].includes(action)?240000:30000);
    }
  }else if(positionals[0].toLowerCase()==='pack'){
    if(!['check','test','check-installed'].includes(positionals[1])||(positionals[1]!=='check-installed'&&!positionals[2]))throw new AppError('validation','Use pack list/show/add/build/apply/remove/check/test/check-installed; see --help');
    const artifacts=await mkdtemp(path.join(tmpdir(),'cc-pack-check-'));
    try{const base=path.dirname(fileURLToPath(import.meta.url)),toolchain=import.meta.url.endsWith('.mjs')?path.join(base,'toolchain'):fileURLToPath(new URL('../../../dist/toolchain',import.meta.url));
      if(positionals[1]==='check-installed'){
        let registrations:Array<{id:string;source:string;removed?:boolean}>=[];
        try{registrations=JSON.parse(await readFile(path.join(directory??dataDirectory(),'packs/registry.json'),'utf8'));}catch(error:any){if(error.code!=='ENOENT')throw error;}
        const checks=[];for(const pack of registrations.filter(p=>!p.removed)){
          try{await run(process.execPath,[path.join(toolchain,'builder.mjs'),pack.source,artifacts],{timeout:180000});checks.push({id:pack.id,ok:true});}
          catch(error){checks.push({id:pack.id,ok:false,error:error instanceof Error?error.message:'Pack check failed'});}
        }
        result=checks;if(checks.some(c=>!c.ok))process.exitCode=1;
      }else{const output=await run(process.execPath,[path.join(toolchain,'builder.mjs'),path.resolve(positionals[2]),artifacts,...(positionals[1]==='test'?['--test']:[])],{timeout:180000});result=JSON.parse(output.trim().split('\n').at(-1)!);}
    }finally{await rm(artifacts,{recursive:true,force:true});}
  }else if(positionals[0].toLowerCase()==='strag'){
    const history=diagnosticsReader(directory??dataDirectory());
    result=positionals[1]==='get'?await history.get(positionals[2]??''):await history.list({since:values.since,mnemonic:values.function,onlyStragglers:!values.all});
  }else if (positionals[0].toLowerCase() === 'host') result = await call('HOST','snapshot',{},directory);
  else if (positionals[0] === 'call') {
    let input: any = values['input-file'] ? JSON.parse(await readFile(values['input-file'],'utf8')) : JSON.parse(values.json || '{}');
    const fn = positionals[1]?.toUpperCase(), op = positionals[2];
    if (!fn || !op) throw new AppError('validation','Specify FUNCTION OPERATION');
    if (fn === 'DRQS' && ['create','update'].includes(op) && input.actor === undefined && actor) input = {...input,actor};
    result = await (call as any)(fn,op,input,directory);
  } else if (positionals[0].toLowerCase() === 'drqs') {
    const op = positionals[1] || 'list';
    if (op === 'groups') result = await call('DRQS','groups',{},directory);
    else if (op === 'get' || op === 'show') result = await call('DRQS','get',{number:Number(positionals[2])},directory);
    else if (op === 'list' || op === 'search') result = await call('DRQS','list',{...(values.group ? {group:Number(values.group)} : {}),...(values.state ? {state:values.state as any}:{}),...(values.type?{type:values.type as any}:{}),...(values.search || op==='search'?{search:values.search || positionals.slice(2).join(' ')}:{})},directory);
    else if (op === 'create') {
      const requesters = values.requester?.map(value => { const i = value.indexOf(':'); if(i<1)throw new AppError('validation','Use employee:email or customer:reference'); return {kind:value.slice(0,i) as 'employee'|'customer',id:value.slice(i+1)}; });
      result = await call('DRQS','create',{title:values.title || '',body:values.body || '',group:Number(values.group),...(values.type?{type:values.type as any}:{}),...(actor?{actor}:{}),...(requesters?{requesters}:{})},directory);
    } else if (op === 'update') result = await call('DRQS','update',{number:Number(positionals[2]),comment:values.comment || '',...(actor?{actor}:{}),...(values.group?{group:Number(values.group)}:{}),...(values.state?{state:values.state as any}:{}),...(values.type?{type:values.type as any}:{}),...(values['clear-owner']?{owner:null}:values.owner!==undefined?{owner:values.owner}:{})},directory);
    else throw new AppError('validation',`Unknown DRQS command: ${op}`);
  } else throw new AppError('validation','Expected drqs, host, or call');
  console.log(JSON.stringify(result,null,2));
}
if (process.argv[1]?.endsWith('cli.mjs') || process.argv[1]?.endsWith('/main.ts')) {
  main().catch((error: any)=>{console.error(JSON.stringify({error:{code:error.code || 'validation',message:error.message,details:error.details}}));process.exitCode=1;});
}
