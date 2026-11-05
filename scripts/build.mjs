import { build } from 'esbuild';
import { mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {configure} from './configure.mjs';
import {xcodegenPath} from './toolchain.mjs';
configure();
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
await mkdir('dist/runtime',{recursive:true});
await cp('.generated/catalog.json','dist/catalog.json');
await Promise.all(['backend','cli'].map(name=>build({entryPoints:[name==='backend'?'packages/backend/src/server.ts':'packages/cli/src/main.ts'],outfile:`dist/${name}.mjs`,bundle:true,platform:'node',format:'esm',target:'node26',packages:'bundle',sourcemap:true,banner:{js:"import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"}})));
// This local build uses the installed Node toolchain, preserving its dynamic-library paths.
// Distribution/notarization and a redistributable runtime are outside this local deliverable.
await rm('dist/runtime/node',{force:true});await writeFile('dist/runtime/node',`#!/bin/sh\nexec '${process.execPath.replaceAll("'","'\\''")}' "$@"\n`,{mode:0o755});
execFileSync('npm',['run','build:web'],{stdio:'inherit'});
execFileSync('npm',['run','build:toolchain'],{stdio:'inherit'});
await build({entryPoints:['packages/backend/src/runtime-worker.ts'],outfile:'dist/worker-runtime.mjs',bundle:true,platform:'node',format:'esm',target:'node26',sourcemap:true,banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
execFileSync(xcodegenPath(),['generate','--spec','project.generated.yml'],{cwd:path.join(root,'native'),stdio:'inherit'});
const derived=path.resolve(root,'.work/native');
execFileSync('xcodebuild',['-project','native/CommandCenter.xcodeproj','-scheme','CommandCenter','-configuration','Debug','-derivedDataPath',derived,'build','CODE_SIGNING_ALLOWED=NO'],{stdio:'inherit'});
await mkdir('build',{recursive:true});await rm('build/CommandCenter.app',{recursive:true,force:true});
const application=path.join(derived,'Build/Products/Debug/CommandCenter.app');
await cp(application,'build/CommandCenter.app',{recursive:true,verbatimSymlinks:true,filter:file=>!/^Contents\/(Frameworks|PlugIns)(\/|$)/.test(path.relative(application,file))});
console.log(`Built ${path.join(root,'build/CommandCenter.app')}`);
