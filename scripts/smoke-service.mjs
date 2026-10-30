import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {assertRuntime,root} from './toolchain.mjs';

// REQ-FF-012, REQ-BW-001/005: packaged runtime, no installed service or live store.
assertRuntime();
const resources=path.join(root,'build/CommandCenter.app/Contents/Resources');
const runtime=path.join(resources,'runtime/node'),backend=path.join(resources,'backend.mjs');
const cli=path.join(root,'bin/command-center'),exec=promisify(execFile);
const environment={PATH:'/usr/bin:/bin:/usr/sbin:/sbin'};
const directory=await fs.mkdtemp(path.join(tmpdir(),'command center smoke '));
let child;
async function stop(){
  if(!child)return;const processToStop=child;child=undefined;
  if(processToStop.exitCode!==null||processToStop.signalCode!==null||!processToStop.pid)return;
  await new Promise(resolve=>{
    const force=setTimeout(()=>processToStop.kill('SIGKILL'),3000);
    processToStop.once('exit',()=>{clearTimeout(force);resolve();});processToStop.kill('SIGTERM');
  });
}
async function start(){
  child=spawn(runtime,[backend,'--data-dir',directory,'--port','0'],{env:environment,stdio:['ignore','ignore','pipe']});
  let failure;let stderr='';child.once('error',error=>{failure=error;});child.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString()).slice(-2000);});
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){
    if(failure)throw failure;
    if(child.exitCode!==null)throw new Error(`Packaged worker exited early: ${stderr}`);
    try{
      const connection=JSON.parse(await fs.readFile(path.join(directory,'connection.json'),'utf8'));
      if(connection.pid===child.pid){
        const health=await fetch(connection.url+'/health',{headers:{Authorization:`Bearer ${connection.token}`},signal:AbortSignal.timeout(500)});
        if(health.ok)return;
      }
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  throw new Error(`Packaged worker did not become ready: ${stderr}`);
}
async function call(...args){return JSON.parse((await exec(cli,[...args,'--data-dir',directory],{env:environment})).stdout);}
try{
  await fs.access(runtime);await fs.access(backend);await fs.access(path.join(resources,'cli.mjs'));
  await start();
  const groups=await call('drqs','groups');assert.ok(groups.length>0);
  const ticket=await call('drqs','create','--title','Packaged runtime smoke','--body','Temporary isolated verification data','--group',String(groups[0].number),'--requester','employee:smoke@example.invalid','--actor','smoke-agent');
  assert.equal(ticket.number,1);await stop();await start();
  const restored=await call('drqs','get',String(ticket.number));assert.equal(restored.title,ticket.title);
  console.log('Packaged worker and CLI passed: minimal PATH, spaced data path, ephemeral port, persisted ticket after restart. No installed service was changed.');
}finally{await stop();await fs.rm(directory,{recursive:true,force:true});}
