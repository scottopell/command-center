import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {configure} from './configure.mjs';
// REQ-FF-006: conservative source guard, not a sandbox. Realms supply disposal isolation.
export {inspectFunction} from '../packages/packs/src/source-check.ts';
import {inspectFunction} from '../packages/packs/src/source-check.ts';

if(import.meta.url===pathToFileURL(process.argv[1]).href) {
  let errors=[];for(const directory of configure().functionRoots)for(const entry of await readdir(directory,{withFileTypes:true}))if(entry.isDirectory()){const file=path.join(directory,entry.name,'ui.tsx');try{errors.push(...inspectFunction(await readFile(file,'utf8'),file));}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Function lifetime guards passed');
}
