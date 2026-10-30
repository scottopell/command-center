import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// REQ-FF-011: composition is explicit build input; the public build discovers nothing.
export function configure(){
  const extension=process.env.COMMAND_CENTER_EXTENSION?fs.realpathSync(process.env.COMMAND_CENTER_EXTENSION):undefined;
  const builtinCommands=[{mnemonic:'DRQS',title:'Development request system'},{mnemonic:'HOST',title:'Host and user service inspection'},{mnemonic:'SLOW',title:'Delayed lifecycle conformance'}];
  const extra=extension?JSON.parse(fs.readFileSync(path.join(extension,'extension.json'),'utf8')):{commands:[],localSourceOrigins:[]};
  if(!Array.isArray(extra.commands)||!Array.isArray(extra.localSourceOrigins))throw new Error('Extension requires commands and localSourceOrigins arrays');
  const commands=[...builtinCommands,...extra.commands];
  if(commands.some(c=>!c||!/^[A-Z][A-Z0-9]{0,31}$/.test(c.mnemonic)||typeof c.title!=='string'||!c.title.length)||new Set(commands.map(c=>c.mnemonic)).size!==commands.length)throw new Error('Invalid or duplicate command metadata');
  const localSourceOrigins=extra.localSourceOrigins.map(origin=>{
    const url=new URL(origin);
    if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.origin!==origin)throw new Error('Source origins must be exact loopback HTTP origins');
    return origin;
  });
  const generated=path.join(root,'.generated');fs.mkdirSync(generated,{recursive:true});
  const write=(name,value)=>{const target=path.join(generated,name);if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==value)fs.writeFileSync(target,value);};
  const relative=file=>JSON.stringify('./'+path.relative(generated,file).split(path.sep).join('/'));
  if(extension)for(const file of ['contracts.ts','ui.ts','workers.ts'])if(!fs.statSync(path.join(extension,file)).isFile())throw new Error(`Missing extension entry: ${file}`);
  write('contracts.ts',`import {builtinContracts} from '../packages/contracts/src/builtins.ts';\n${extension?`import {privateContracts} from ${relative(path.join(extension,'contracts.ts'))};\nif(Object.keys(privateContracts).some(key=>Object.hasOwn(builtinContracts,key)))throw new Error('Duplicate worker contract');`:''}\nexport const contracts={...builtinContracts${extension?',...privateContracts':''}} as const;\n`);
  write('ui.ts',`import {drqs} from '../functions/drqs/ui.tsx';\nimport {host} from '../functions/host/ui.tsx';\nimport {slow} from '../functions/slow/ui.tsx';\n${extension?`import {privateFunctions} from ${relative(path.join(extension,'ui.ts'))};\nif(Object.keys(privateFunctions).some(key=>['DRQS','HOST','SLOW'].includes(key)))throw new Error('Duplicate function view');`:''}\nexport const functions={DRQS:drqs,HOST:host,SLOW:slow${extension?',...privateFunctions':''}};\n`);
  write('workers.ts',extension?`export {createWorkers as extensionWorkers} from ${relative(path.join(extension,'workers.ts'))};\n`:'export function extensionWorkers(){return {};}\n');
  write('catalog.json',JSON.stringify({commands,localSourceOrigins},null,2)+'\n');
  const config={extension,functionRoots:[path.join(root,'functions'),...(extension?[path.join(extension,'functions')]:[])],testRoots:[path.join(root,'tests'),...(extension?[path.join(extension,'tests')]:[])]};
  write('config.json',JSON.stringify(config,null,2)+'\n');
  write('tsconfig.json',JSON.stringify({extends:'../tsconfig.json',include:[...['packages','functions','tests','vite.config.ts'].map(p=>path.join(root,p)),...(extension?[path.join(extension,'functions'),path.join(extension,'tests'),path.join(extension,'contracts.ts'),path.join(extension,'workers.ts'),path.join(extension,'ui.ts')]:[])]},null,2)+'\n');
  let project=fs.readFileSync(path.join(root,'native/project.yml'),'utf8');
  if(extension)project=project.replace('sources: [CommandCenterTests]',`sources:\n      - path: CommandCenterTests\n      - path: ${JSON.stringify(path.join(extension,'native'))}`);
  fs.writeFileSync(path.join(root,'native/project.generated.yml'),project);
  return config;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const config=configure();console.log(config.extension?'Configured composed build':'Configured public build');}
