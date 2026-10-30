import { mkdir, writeFile, readFile, copyFile, chmod } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {configure} from './configure.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const label='com.scottopell.command-center',domain=`gui/${userInfo().uid}`;
const directory=process.env.COMMAND_CENTER_DATA_DIR||path.join(homedir(),'Library/Application Support/CommandCenter');
const resources=path.join(root,'build/CommandCenter.app/Contents/Resources');
const plist=path.join(homedir(),'Library/LaunchAgents',`${label}.plist`);
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
if(process.argv[2]==='stop') {try{execFileSync('/bin/launchctl',['bootout',`${domain}/${label}`],{stdio:'pipe'});}catch{};console.log('Local service stopped. npm run service:install restarts it.');}
else if(process.argv[2]==='install') {
  configure();
  if(await readFile(path.join(root,'.generated/catalog.json'),'utf8')!==await readFile(path.join(resources,'catalog.json'),'utf8'))throw new Error('Build this source composition with npm run build before installing its service.');
  await readFile(path.join(resources,'backend.mjs'));
  await mkdir(path.dirname(plist),{recursive:true});await mkdir(path.join(directory,'logs'),{recursive:true,mode:0o700});
  // launchd runs outside the app's Documents access grant. Install its own small payload
  // in Application Support and give it an accessible working directory.
  const serviceDirectory=path.join(directory,'service');await mkdir(serviceDirectory,{recursive:true,mode:0o700});
  const args=[path.join(serviceDirectory,'node'),path.join(serviceDirectory,'backend.mjs'),'--data-dir',directory];
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(s=>`<string>${escape(s)}</string>`).join('')}</array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>WorkingDirectory</key><string>${escape(directory)}</string><key>StandardOutPath</key><string>${escape(path.join(directory,'logs/worker.log'))}</string><key>StandardErrorPath</key><string>${escape(path.join(directory,'logs/worker-error.log'))}</string><key>ThrottleInterval</key><integer>3</integer></dict></plist>\n`;
  let exists=false;try{await readFile(plist);exists=true;}catch{}
  if(exists){const old=execFileSync('/usr/bin/plutil',['-extract','Label','raw',plist],{encoding:'utf8'}).trim();if(old!==label)throw new Error('Refusing to replace a LaunchAgent with another identity');try{execFileSync('/bin/launchctl',['bootout',`${domain}/${label}`],{stdio:'pipe'});}catch{}}
  await copyFile(path.join(resources,'backend.mjs'),path.join(serviceDirectory,'backend.mjs'));await copyFile(path.join(resources,'runtime/node'),path.join(serviceDirectory,'node'));await chmod(path.join(serviceDirectory,'node'),0o700);
  await writeFile(plist,xml,{mode:0o600});execFileSync('/bin/launchctl',['bootstrap',domain,plist],{stdio:'inherit'});
  let ready=false;
  for(let attempt=0;attempt<50;attempt++){try{const c=JSON.parse(await readFile(path.join(directory,'connection.json'),'utf8'));const response=await fetch(c.url+'/health',{headers:{Authorization:`Bearer ${c.token}`},signal:AbortSignal.timeout(200)});if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  if(!ready)throw new Error(`Service did not become ready. Inspect ${path.join(directory,'logs/worker-error.log')}`);
  console.log(`Installed ${label}. Agents can use bin/command-center while the app is closed.`);
} else throw new Error('Use install or stop');
