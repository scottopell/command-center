import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {configure,root,builtinFunctions} from './configure.mjs';

// The comparison benchmark uses the same entry, production React and targets, changing only minification.
export async function buildWebFunction(f,directory,{minify=true}={}){
  await fs.mkdir(directory,{recursive:true});
  await build({stdin:{contents:`import {mount} from './packages/sdk/src/framework.tsx';import {${f.uiExport} as definition} from './${f.ui}';mount(definition,new URLSearchParams(location.search).get('tail')||'');`,resolveDir:root,loader:'tsx'},outfile:path.join(directory,'app.js'),bundle:true,format:'esm',platform:'browser',target:'safari17',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},minify,sourcemap:true});
  await build({entryPoints:[path.join(root,'packages/sdk/src/style.css')],outfile:path.join(directory,'style.css'),bundle:true,target:'safari17',minify,sourcemap:true});
  try{await fs.access(path.join(directory,'app.css'));}catch{await fs.writeFile(path.join(directory,'app.css'),'');}
  await fs.writeFile(path.join(directory,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src commandcenter:; style-src commandcenter: \'unsafe-inline\'; img-src commandcenter: data:; font-src commandcenter:; connect-src \'none\'; frame-src \'none\'; worker-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script type="module" src="app.js"></script></body></html>');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  configure();
  await fs.mkdir('dist',{recursive:true});await fs.cp('.generated/catalog.json','dist/catalog.json');await fs.rm('dist/functions',{recursive:true,force:true});
  for(const f of builtinFunctions)await buildWebFunction(f,path.join(root,'dist/functions',f.id,'web'));
  console.log('Built minified public function frontends with source maps');
}
