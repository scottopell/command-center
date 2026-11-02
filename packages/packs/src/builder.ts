import {inspectFunction} from './source-check.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {run} from './process.ts';
import {build} from 'esbuild';
import ts from 'typescript';
import {manifestSchema,SDK_VERSION,type PackArtifact} from './manifest.ts';

const ignored=new Set(['.git','node_modules','.work','.tools','.generated','build','dist','.DS_Store']);
const reserved=['@command-center/sdk','react','react-dom','scheduler','zod','@tanstack/react-query','@tanstack/query-core','@types/react','@types/react-dom','@types/node','csstype','undici-types'];
const pins:Record<string,string>={'@command-center/sdk':SDK_VERSION,react:'19.3.1','react-dom':'19.3.1',zod:'4.6.7','@tanstack/react-query':'5.105.0'};

// REQ-PK-002: snapshot inputs once; generated artifacts never refer to the source checkout.
export async function snapshot(source:string,destination:string){
  const hash=createHash('sha256');let bytes=0,files=0;
  async function walk(relative:string){
    const entries=(await fs.readdir(path.join(source,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
    for(const entry of entries){
      if(ignored.has(entry.name)||entry.name==='.env'||entry.name.startsWith('.env.'))continue;
      const next=path.join(relative,entry.name),from=path.join(source,next),to=path.join(destination,next);
      if(entry.isSymbolicLink())throw new Error(`Pack source contains a symlink: ${next}. Include real files inside the pack.`);
      if(entry.isDirectory()){await fs.mkdir(to,{recursive:true});await walk(next);}
      else if(entry.isFile()){
        const contents=await fs.readFile(from);bytes+=contents.length;files++;
        if(bytes>64*1024*1024||files>4096)throw new Error('Pack source exceeds 64 MiB or 4096 files');
        await fs.mkdir(path.dirname(to),{recursive:true});await fs.writeFile(to,contents);hash.update(next).update('\0').update(contents).update('\0');
      }
    }
  }
  await fs.mkdir(destination,{recursive:true});await walk('');return hash.digest('hex');
}
async function installDependencies(root:string,toolchain:string){
  let pkg:any={};try{pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
  if(['preinstall','install','postinstall','prepare','prebuild','build','postbuild'].some(key=>pkg.scripts?.[key]))throw new Error('Pack build/install hooks are not supported; CommandCenter owns compilation');
  const dependencies={...pkg.dependencies,...pkg.devDependencies};
  for(const [name,version]of Object.entries(dependencies)){
    if(pins[name]&&version!==pins[name])throw new Error(`${name} must use the platform version ${pins[name]}`);
    if(!pins[name]&&!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(String(version)))throw new Error(`Dependency ${name} must have an exact registry version`);
  }
  if(Object.keys(dependencies).some(name=>!pins[name])){
    const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
    for(const [name,item]of Object.entries(lock.packages??{}) as [string,any][]){if(!name)continue;if(item.link||!String(item.resolved).startsWith('https://registry.npmjs.org/')||!String(item.integrity).startsWith('sha512-'))throw new Error('Use a registry lockfile with integrity hashes, without local or Git dependencies');}
    await run(process.execPath,[path.join(toolchain,'node_modules/npm/bin/npm-cli.js'),'ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:root,timeout:120000});
  }
  for(const name of reserved){
    const target=path.join(root,'node_modules',name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.rm(target,{recursive:true,force:true});
    await fs.symlink(path.join(toolchain,'node_modules',name),target,'dir');
  }
}
function checkSource(file:string,source:string){
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);const errors:string[]=[];
  function visit(node:ts.Node){
    if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)&&/^(?:https?:|node:)/.test(node.moduleSpecifier.text)&&file.endsWith('x'))errors.push('Frontend modules cannot import network or Node modules');
    if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)&&node.moduleSpecifier.text.startsWith('@command-center/')&&!node.moduleSpecifier.text.startsWith('@command-center/sdk'))errors.push('Import the standalone @command-center/sdk, not host source packages');
    if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&(!node.arguments[0]||!ts.isStringLiteral(node.arguments[0])))errors.push('Computed dynamic imports are not supported in installed packs');
    if(ts.isPropertyAssignment(node)&&node.name.getText(ast)==='resolve')errors.push('Use synchronous prepare and query hooks instead of a pre-mount resolver');
    if((ts.isMethodDeclaration(node)||ts.isPropertyAssignment(node))&&node.name.getText(ast)==='prepare'){
      const fn=ts.isMethodDeclaration(node)?node:node.initializer;if(ts.canHaveModifiers(fn)&&ts.getModifiers(fn)?.some(x=>x.kind===ts.SyntaxKind.AsyncKeyword))errors.push('Command preparation must be synchronous');
    }
    ts.forEachChild(node,visit);
  }
  for(const statement of ast.statements){if(ts.isExpressionStatement(statement))errors.push('Top-level effects are not supported');if(ts.isVariableStatement(statement)&&!(statement.declarationList.flags&ts.NodeFlags.Const))errors.push('Module-level mutable state is not supported');}
  visit(ast);if(file.endsWith('.tsx'))errors.push(...inspectFunction(source,file));if(errors.length)throw new Error(`${file}: ${[...new Set(errors)].join('; ')}`);
}

export async function buildPack(source:string,builds:string,toolchain:string,tests=false):Promise<PackArtifact>{
  source=path.resolve(source);builds=path.resolve(builds);toolchain=path.resolve(toolchain);await fs.mkdir(builds,{recursive:true});
  const temporary=await fs.mkdtemp(path.join(builds,'.staging-'));const root=path.join(temporary,'source'),out=path.join(temporary,'artifact');
  try{
    const digest=await snapshot(await fs.realpath(source),root),manifest=manifestSchema.parse(JSON.parse(await fs.readFile(path.join(root,'command-center.json'),'utf8')));
    const toolchainId=await fs.readFile(path.join(toolchain,'identity'),'utf8');const revision=createHash('sha256').update(digest).update(toolchainId).digest('hex');
    const final=path.join(builds,revision);
    await installDependencies(root,toolchain);await fs.mkdir(out,{recursive:true});
    const assetsDeclaration=path.join(root,'.cc-assets.d.ts');await fs.writeFile(assetsDeclaration,"declare module '*.css' {}\ndeclare module '*.svg' {const url:string;export default url;}\ndeclare module '*.png' {const url:string;export default url;}\n");
    const entries=manifest.functions.flatMap(f=>[f.ui,...(f.worker?[f.worker]:[])]).map(file=>path.join(root,file));
    entries.push(assetsDeclaration);
    const config:ts.CompilerOptions={target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.ReactJSX,strict:true,noEmit:true,allowImportingTsExtensions:true,resolveJsonModule:true,esModuleInterop:true,skipLibCheck:true,types:['node','react','react-dom'],typeRoots:[path.join(root,'node_modules/@types')],lib:['lib.es2023.d.ts','lib.dom.d.ts','lib.dom.iterable.d.ts']};
    const testFiles:string[]=[];
    if(tests){async function find(dir:string){for(const f of await fs.readdir(dir,{withFileTypes:true})){const next=path.join(dir,f.name);if(f.isDirectory())await find(next);else if(/\.tsx?$/.test(f.name)){entries.push(next);if(f.name.endsWith('.test.ts'))testFiles.push(next);}}}try{await find(path.join(root,'tests'));}catch(e:any){if(e.code!=='ENOENT')throw e;}}
    const program=ts.createProgram(entries,config),diagnostics=ts.getPreEmitDiagnostics(program);
    if(diagnostics.length)throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}).slice(0,16384));
    for(const file of program.getSourceFiles())if(file.fileName.startsWith(root+path.sep)&&!file.fileName.includes(`${path.sep}node_modules${path.sep}`)&&!file.fileName.includes(`${path.sep}tests${path.sep}`)&&!file.isDeclarationFile)checkSource(path.relative(root,file.fileName),file.text);
    const compile=async(entry:string,output:string,platform:'browser'|'node')=>{
      const result=await build({entryPoints:[entry],outfile:output,absWorkingDir:root,bundle:true,format:'esm',platform,target:platform==='node'?'node26':'safari17',jsx:'automatic',alias:Object.fromEntries(['react','react-dom','@tanstack/react-query','@tanstack/query-core','zod'].map(name=>[name,path.join(toolchain,'node_modules',name)])),define:{'process.env.NODE_ENV':'"production"'},metafile:true,sourcemap:true,loader:{'.png':'file','.svg':'file','.woff2':'file'},nodePaths:[path.join(root,'node_modules')],...(platform==='node'?{banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}}:{} )});
      for(const input of Object.keys(result.metafile!.inputs)){const resolved=path.resolve(root,input);if(![root,toolchain].some(base=>resolved.startsWith(path.resolve(base)+path.sep)))throw new Error(`Import escapes the pack: ${input}`);if(input.endsWith('.node'))throw new Error('Native add-ons are not supported');}
    };
    if(tests&&testFiles.length){
      const compiled:string[]=[];for(const [i,file]of testFiles.entries()){const target=path.join(temporary,'test-'+i+'.mjs');await compile(file,target,'node');compiled.push(target);}
      const output=await run(process.execPath,['--test',...compiled],{cwd:root,timeout:60000});process.stderr.write(output);
    }
    for(const f of manifest.functions){
      const bootstrap=path.join(root,`.cc-${f.id}.tsx`),directory=path.join(out,'functions',f.id,'web');await fs.mkdir(directory,{recursive:true});
      await fs.writeFile(bootstrap,`import {mount} from '@command-center/sdk/runtime';import {${f.uiExport} as definition} from ${JSON.stringify('./'+f.ui)};mount(definition,new URLSearchParams(location.search).get('tail')||'');`);
      await compile(bootstrap,path.join(directory,'app.js'),'browser');
      try{await fs.access(path.join(directory,'app.css'));}catch{await fs.writeFile(path.join(directory,'app.css'),'');}
      await fs.copyFile(path.join(toolchain,'node_modules/@command-center/sdk/src/style.css'),path.join(directory,'style.css'));
      await fs.writeFile(path.join(directory,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src commandcenter:; style-src commandcenter: \'unsafe-inline\'; img-src commandcenter: data:; font-src commandcenter:; connect-src \'none\'; frame-src \'none\'; worker-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script type="module" src="app.js"></script></body></html>');
    }
    const imports=manifest.functions.filter(f=>f.worker).map((f,i)=>`import {${f.workerExport} as w${i}} from ${JSON.stringify('./'+f.worker)};`);
    const workerEntry=path.join(root,'.cc-workers.ts');await fs.writeFile(workerEntry,imports.join('\n')+'\nexport function createWorkers(){return {'+manifest.functions.filter(f=>f.worker).map((f,i)=>`${JSON.stringify(f.mnemonic)}:w${i}`).join(',')+'};}\n');
    await compile(workerEntry,path.join(out,'worker.mjs'),'node');
    for(const asset of manifest.assets){const from=path.join(root,asset),to=path.join(out,asset);if(['artifact.json','worker.mjs','functions'].includes(asset.split('/')[0]))throw new Error(`Asset path ${asset} conflicts with installed code`);await fs.cp(from,to,{recursive:true});}
    const probe=`const m=await import(${JSON.stringify(pathToFileURL(path.join(out,'worker.mjs')).href)});const workers=m.createWorkers();let result={};for(const [name,w]of Object.entries(workers)){if(w.name!==name)throw Error('Worker mnemonic differs from manifest');result[name]={};for(const [op,d]of Object.entries(w.definition)){if(typeof w.handlers[op]!=='function'||typeof d.mutating!=='boolean'||typeof d.input?.parse!=='function'||typeof d.output?.parse!=='function')throw Error('Invalid worker contract');result[name][op]=d.mutating;}}console.log(JSON.stringify(result));`;
    const metadata=JSON.parse((await run(process.execPath,['--input-type=module','-e',probe],{timeout:10000})).trim().split('\n').at(-1)!);
    const artifact:PackArtifact={id:manifest.id,sdkVersion:manifest.sdkVersion,revision,worker:'worker.mjs',localSourceOrigins:manifest.localSourceOrigins,functions:manifest.functions.map(f=>({id:f.id,mnemonic:f.mnemonic,title:f.title,uiDirectory:`functions/${f.id}/web`,operations:metadata[f.mnemonic]??{}}))};
    await fs.writeFile(path.join(out,'artifact.json'),JSON.stringify(artifact,null,2)+'\n');try{await fs.access(final);}catch{await fs.rename(out,final);}return artifact;
  }finally{await fs.rm(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  buildPack(process.argv[2],process.argv[3],path.dirname(fileURLToPath(import.meta.url)),process.argv[4]==='--test').then(result=>console.log(JSON.stringify(result)),error=>{console.error(error.message);process.exitCode=1;});
}
