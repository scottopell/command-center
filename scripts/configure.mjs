import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {assertRuntime} from './toolchain.mjs';
import {builtinContracts} from '../packages/contracts/src/builtins.ts';
import {stragContract} from '../packages/contracts/src/diagnostics.ts';
import {API_EPOCH} from '../packages/packs/src/runtime-contract.ts';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const builtinFunctions=[{id:'drqs',mnemonic:'DRQS',title:'Development request system',ui:'functions/drqs/ui.tsx',uiExport:'drqs'},{id:'host',mnemonic:'HOST',title:'Host and user services',ui:'functions/host/ui.tsx',uiExport:'host'},{id:'slow',mnemonic:'SLOW',title:'Lifecycle conformance',ui:'functions/slow/ui.tsx',uiExport:'slow'},{id:'strag',mnemonic:'STRAG',title:'Transition diagnostics',ui:'functions/strag/ui.tsx',uiExport:'strag'}];
export function configure(){
  assertRuntime();
  if(process.env.COMMAND_CENTER_EXTENSION)throw new Error('Build-time source composition is retired. Add the private folder using CommandCenter → Manage Functions.');
  const hash=createHash('sha256');
  function scan(directory){for(const file of fs.readdirSync(path.join(root,directory),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(directory,file.name);if(file.isDirectory())scan(p);else if(/\.(?:ts|tsx|css|json)$/.test(file.name))hash.update(p).update(fs.readFileSync(path.join(root,p)));}}
  for(const directory of ['packages','functions','data'])scan(directory);hash.update(fs.readFileSync(path.join(root,'package-lock.json')));
  const definitions={...builtinContracts,STRAG:stragContract.operations};
  const system={id:'cc.system',apiEpoch:API_EPOCH,revision:hash.digest('hex'),worker:'worker-runtime.mjs',functions:builtinFunctions.map(f=>({id:f.id,mnemonic:f.mnemonic,title:f.title,uiDirectory:`functions/${f.id}/web`,operations:Object.fromEntries(Object.entries(definitions[f.mnemonic]??{}).map(([key,d])=>[key,d.mutating]))})),localSourceOrigins:[]};
  const generated=path.join(root,'.generated');fs.mkdirSync(generated,{recursive:true});
  const write=(name,value)=>{const target=path.join(generated,name);if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==value)fs.writeFileSync(target,value);};
  write('catalog.json',JSON.stringify({apiEpoch:API_EPOCH,commands:system.functions.map(f=>({...f,apiEpoch:API_EPOCH,packId:system.id,revision:system.revision})),localSourceOrigins:[],system},null,2)+'\n');
  write('ui.ts',builtinFunctions.map(f=>`import {${f.uiExport}} from '../${f.ui}';`).join('\n')+'\nexport const functions={'+builtinFunctions.map(f=>`${f.mnemonic}:${f.uiExport}`).join(',')+'};\n');
  const config={functionRoots:[path.join(root,'functions')],testRoots:[path.join(root,'tests')]};
  write('config.json',JSON.stringify(config,null,2)+'\n');write('tsconfig.json',JSON.stringify({extends:'../tsconfig.json',include:[...['packages','functions','tests'].map(p=>path.join(root,p))]},null,2)+'\n');
  fs.writeFileSync(path.join(root,'native/project.generated.yml'),fs.readFileSync(path.join(root,'native/project.yml'),'utf8'));return config;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){configure();console.log('Configured public runtime-pack host');}
