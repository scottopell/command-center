import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {configure,root,builtinFunctions} from './configure.mjs';
configure();
await fs.mkdir('dist',{recursive:true});await fs.cp('.generated/catalog.json','dist/catalog.json');await fs.rm('dist/functions',{recursive:true,force:true});
for(const f of builtinFunctions){
  const directory=path.join(root,'dist/functions',f.id,'web');await fs.mkdir(directory,{recursive:true});
  await build({stdin:{contents:`import {mount} from './packages/sdk/src/framework.tsx';import {${f.uiExport} as definition} from './${f.ui}';mount(definition,new URLSearchParams(location.search).get('tail')||'');`,resolveDir:root,loader:'tsx'},outfile:path.join(directory,'app.js'),bundle:true,format:'esm',platform:'browser',target:'safari17',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},sourcemap:true});
  await fs.copyFile('packages/sdk/src/style.css',path.join(directory,'style.css'));try{await fs.access(path.join(directory,'app.css'));}catch{await fs.writeFile(path.join(directory,'app.css'),'');}
  await fs.writeFile(path.join(directory,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src commandcenter:; style-src commandcenter: \'unsafe-inline\'; img-src commandcenter: data:; font-src commandcenter:; connect-src \'none\'; frame-src \'none\'; worker-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script type="module" src="app.js"></script></body></html>');
}
console.log('Built independent public function frontends');
