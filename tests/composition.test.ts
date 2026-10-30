import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {contracts,lookupOperation} from '../packages/contracts/src/index.ts';
import {createDispatcher} from '../packages/backend/src/dispatcher.ts';
import {Store} from '../packages/backend/src/store.ts';

// REQ-FF-011: the selected catalog, UI and workers agree in both public and composed checks.
test('build catalog matches UI and registered worker contracts',async()=>{
  const catalog=JSON.parse(readFileSync('.generated/catalog.json','utf8')) as {commands:{mnemonic:string}[]};
  const built=await build({entryPoints:['.generated/ui.ts'],bundle:true,platform:'node',format:'esm',write:false,loader:{'.css':'empty'}});
  const {functions}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
  assert.deepEqual(Object.keys(functions).sort(),catalog.commands.map(c=>c.mnemonic).sort());
  for(const [name,definition]of Object.entries(functions))assert.equal((definition as {mnemonic:string}).mnemonic,name);
  const store=new Store(':memory:');
  try{
    const dispatch=createDispatcher(store);
    for(const fn of Object.keys(contracts)){
      assert.ok(Object.hasOwn(functions,fn));
      // Invalid input must be classified before a handler can contact an owner.
      await assert.rejects(dispatch({function:fn,operation:'__not_registered__',input:{}}));
    }
    assert.equal(lookupOperation('__not_registered__','list'),undefined);
  }finally{store.close();}
});
