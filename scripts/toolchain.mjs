import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
export const xcodegen=Object.freeze({
  version:'2.46.0',
  url:'https://github.com/yonaskolb/XcodeGen/releases/download/2.46.0/xcodegen.zip',
  sha256:'4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806',
});
export const nativeToolDirectory=path.join(root,'.tools',`xcodegen-${xcodegen.version}`);
export const nativeToolBinary=path.join(nativeToolDirectory,'xcodegen','bin','xcodegen');

// REQ-FF-012: build entry points reject a different runtime before generating output.
export function assertRuntime(){
  if(process.versions.node!==manifest.engines.node)throw new Error(`Use Node ${manifest.engines.node}; found ${process.versions.node}. Install the version in .nvmrc/.node-version first.`);
}
export function xcodegenPath(){
  const candidate=fs.existsSync(nativeToolBinary)?nativeToolBinary:'xcodegen';
  let version;
  try{version=execFileSync(candidate,['--version'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
  catch{throw new Error('XcodeGen is missing. Run npm run setup:native; no Homebrew or sudo is required.');}
  if(version!==`Version: ${xcodegen.version}`)throw new Error(`Use XcodeGen ${xcodegen.version}; found ${version}. Run npm run setup:native.`);
  return candidate;
}
