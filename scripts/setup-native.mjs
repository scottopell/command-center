import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {assertRuntime,root,xcodegen,nativeToolDirectory,nativeToolBinary} from './toolchain.mjs';

// REQ-FF-012: the official universal tool is pinned by version and published digest.
assertRuntime();
if(process.platform!=='darwin')throw new Error('Native tool setup requires macOS.');
try{
  const installed=execFileSync(nativeToolBinary,['--version'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  if(installed===`Version: ${xcodegen.version}`){console.log(`XcodeGen ${xcodegen.version} is already installed locally.`);process.exit(0);}
}catch{}
const parent=path.join(root,'.work','native-tool-setup');await fs.mkdir(parent,{recursive:true});
const temporary=await fs.mkdtemp(path.join(parent,'download-'));
try{
  console.log(`Downloading official XcodeGen ${xcodegen.version} universal release…`);
  const response=await fetch(xcodegen.url,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`XcodeGen download failed: HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!==xcodegen.sha256)throw new Error('XcodeGen checksum mismatch; no tool was installed.');
  const archive=path.join(temporary,'xcodegen.zip'),unpacked=path.join(temporary,'unpacked');
  await fs.writeFile(archive,bytes);execFileSync('/usr/bin/ditto',['-x','-k',archive,unpacked]);
  const binary=path.join(unpacked,'xcodegen','bin','xcodegen');await fs.chmod(binary,0o755);
  if(execFileSync(binary,['--version'],{encoding:'utf8'}).trim()!==`Version: ${xcodegen.version}`)throw new Error('Downloaded tool reported an unexpected version.');
  await fs.mkdir(path.dirname(nativeToolDirectory),{recursive:true});
  await fs.rm(nativeToolDirectory,{recursive:true,force:true});await fs.rename(unpacked,nativeToolDirectory);
  console.log(`Installed checksum-verified XcodeGen ${xcodegen.version} under .tools/.`);
}finally{await fs.rm(temporary,{recursive:true,force:true});}
