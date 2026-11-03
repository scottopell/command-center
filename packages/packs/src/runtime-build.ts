import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {build,type Plugin} from 'esbuild';
import {API_EPOCH} from './runtime-contract.ts';

const modules:Record<string,{entry:string;default?:boolean}>={
  '@command-center/sdk':{entry:'sdk'},'@command-center/sdk/contracts':{entry:'contracts'},'@command-center/sdk/worker':{entry:'contracts'},
  '@command-center/sdk/framework':{entry:'framework'},'@command-center/sdk/runtime':{entry:'framework'},'@command-center/sdk/queries':{entry:'queries'},
  react:{entry:'react',default:true},'react/jsx-runtime':{entry:'jsx-runtime',default:true},'react/jsx-dev-runtime':{entry:'jsx-dev-runtime',default:true},
  'react-dom':{entry:'react-dom',default:true},'react-dom/client':{entry:'react-dom-client',default:true},scheduler:{entry:'scheduler',default:true},
  '@tanstack/react-query':{entry:'react-query'},'@tanstack/query-core':{entry:'query-core'},zod:{entry:'zod',default:true},
};
export const providedPackages=['@command-center/sdk','react','react-dom','scheduler','@tanstack/react-query','@tanstack/query-core','zod'];

// ESM facades also handle third-party CommonJS require('react') without a browser require shim.
export function runtimeImports(hostRoot?:string):Plugin {
  const internal:Record<string,string>=hostRoot?Object.fromEntries([
    ['packages/sdk/src/index.ts','@command-center/sdk'],['packages/sdk/src/contracts.ts','@command-center/sdk/contracts'],
    ['packages/sdk/src/framework.tsx','@command-center/sdk/framework'],['packages/sdk/src/queries.tsx','@command-center/sdk/queries'],
    ['packages/contracts/src/core.ts','@command-center/sdk/contracts'],
  ].map(([file,name])=>[path.resolve(hostRoot,file),name])):{};
  return {name:'host-runtime',setup(builder){
    builder.onResolve({filter:/.*/},args=>{
      if(args.namespace==='cc-runtime')return {path:args.path,external:true};
      const name=Object.hasOwn(modules,args.path)?args.path:internal[path.resolve(args.resolveDir,args.path)];
      if(name)return {path:name,namespace:'cc-runtime'};
      if(providedPackages.some(name=>args.path===name||args.path.startsWith(name+'/')))throw new Error(`Unsupported host-provided module: ${args.path}`);
    });
    builder.onLoad({filter:/.*/,namespace:'cc-runtime'},args=>{
      const descriptor=modules[args.path],specifier='@command-center/runtime/'+descriptor.entry;
      return {contents:`export * from ${JSON.stringify(specifier)};${descriptor.default?`export {default} from ${JSON.stringify(specifier)};`:''}`,loader:'js'};
    });
  }};
}

// REQ-PK-011: platform entries are built together so all module/context identities are shared.
export async function buildHostRuntime(root:string,directory:string,{minify=true}={}) {
  await fs.rm(directory,{recursive:true,force:true});await fs.mkdir(directory,{recursive:true});
  const entries=path.join(root,'.generated/runtime-entries');await fs.mkdir(entries,{recursive:true});
  const require=createRequire(path.join(root,'package.json')),entryPoints:Record<string,string>={};
  for(const [specifier,descriptor]of Object.entries(modules)){
    if(entryPoints[descriptor.entry])continue;
    let contents:string;
    if(specifier.startsWith('@command-center/sdk')){
      const file={sdk:'index.ts',contracts:'contracts.ts',framework:'framework.tsx',queries:'queries.tsx'}[descriptor.entry]!;
      contents=`export * from ${JSON.stringify(path.join(root,'packages/sdk/src',file))};`;
    }else {
      const names=Object.keys(require(specifier)).filter(name=>name!=='default'&&/^[A-Za-z_$][\w$]*$/.test(name));
      contents=`import * as namespace from ${JSON.stringify(specifier)};const value=Reflect.get(namespace,'default')??namespace;${descriptor.default?'export default value;':''}${names.map((name,i)=>`const v${i}=Object.hasOwn(namespace,${JSON.stringify(name)})?Reflect.get(namespace,${JSON.stringify(name)}):Reflect.get(value,${JSON.stringify(name)});export {v${i} as ${name}};`).join('')}`;
    }
    const file=path.join(entries,descriptor.entry+'.js');await fs.writeFile(file,contents);entryPoints[descriptor.entry]=file;
  }
  const aliases=Object.fromEntries(providedPackages.filter(name=>name!=='@command-center/sdk').map(name=>[name,path.join(root,'node_modules',name)]));
  for(const platform of ['browser','node'] as const)await build({entryPoints,outdir:path.join(directory,platform),bundle:true,splitting:true,format:'esm',platform,target:platform==='browser'?'safari17':'node26',outExtension:{'.js':platform==='browser'?'.js':'.mjs'},chunkNames:'chunks/[name]-[hash]',alias:aliases,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},minify:platform==='browser'&&minify,sourcemap:true});
  await build({entryPoints:[path.join(root,'packages/sdk/src/style.css')],outfile:path.join(directory,'browser/style.css'),bundle:true,target:'safari17',minify,sourcemap:true});
  const imports=Object.fromEntries([...new Set(Object.values(modules).map(m=>m.entry))].map(name=>['@command-center/runtime/'+name,'browser/'+name+'.js']));
  const nodeImports=Object.fromEntries(Object.keys(imports).map(name=>[name,'./node/'+name.split('/').at(-1)+'.mjs']));
  await fs.writeFile(path.join(directory,'loader.mjs'),`import {registerHooks} from 'node:module';const imports=${JSON.stringify(nodeImports)};registerHooks({resolve(specifier,context,next){if(Object.hasOwn(imports,specifier))return {url:new URL(imports[specifier],import.meta.url).href,shortCircuit:true};if(specifier.startsWith('@command-center/runtime/'))throw new Error('Unsupported host runtime module: '+specifier);return next(specifier,context);}});\n`);
  const hash=createHash('sha256').update(String(API_EPOCH));
  async function scan(base:string){for(const f of (await fs.readdir(base,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(base,f.name);if(f.isDirectory())await scan(file);else hash.update(path.relative(directory,file)).update(await fs.readFile(file));}}
  await scan(directory);const manifest={apiEpoch:API_EPOCH,fingerprint:hash.digest('hex'),imports};
  await fs.writeFile(path.join(directory,'runtime.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
