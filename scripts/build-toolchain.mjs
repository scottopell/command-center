import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {root} from './toolchain.mjs';
import {buildHostRuntime} from '../packages/packs/src/runtime-build.ts';
// REQ-PK-002/003: the installed host carries its compiler and SDK, not checkout paths.
const destination=path.join(root,'dist/toolchain');await fs.rm(destination,{recursive:true,force:true});await fs.mkdir(path.join(destination,'node_modules/@command-center'),{recursive:true});
const dependencies=['esbuild','@esbuild/'+process.platform+'-'+process.arch,'typescript','react','react-dom','scheduler','zod','@tanstack/react-query','@tanstack/query-core','@types/react','@types/react-dom','@types/node','csstype','undici-types'];
for(const name of dependencies)await fs.cp(await fs.realpath(path.join(root,'node_modules',name)),path.join(destination,'node_modules',name),{recursive:true,dereference:true});
await fs.cp(path.join(root,'packages/sdk'),path.join(destination,'node_modules/@command-center/sdk'),{recursive:true});
await buildHostRuntime(root,path.join(destination,'runtime'));
const npm=process.env.npm_execpath;if(!npm)throw new Error('Build the toolchain using npm run build:toolchain');
await fs.cp(path.resolve(path.dirname(await fs.realpath(npm)),'..'),path.join(destination,'node_modules/npm'),{recursive:true,dereference:true});
await build({entryPoints:['packages/packs/src/builder.ts'],outfile:path.join(destination,'builder.mjs'),bundle:true,format:'esm',platform:'node',target:'node26',external:['esbuild','typescript'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
const catalog=JSON.parse(await fs.readFile('.generated/catalog.json','utf8'));await fs.writeFile(path.join(destination,'identity'),catalog.system.revision+'\n');
console.log('Pack compiler and SDK packaged');
