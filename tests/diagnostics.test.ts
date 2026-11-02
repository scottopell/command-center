import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {diagnosticsReader} from '../packages/backend/src/diagnostics.ts';

// REQ-ST-003/004: history and CLI are available with no listener and no function view.
test('diagnostic history filters stragglers with a denominator and supports offline CLI',async()=>{
  const directory=await fs.mkdtemp(path.join(tmpdir(),'cc-diagnostics-'));await fs.mkdir(path.join(directory,'diagnostics'));
  try{
    const base={mnemonic:'NOTES',packId:'example.notes',functionId:'notes',revision:'fixture',command:'NOTES',kind:'launch',startedAt:new Date().toISOString(),outcome:'ready',phases:{},operations:[],context:{appActive:true}};
    for(const [id,elapsedMs]of [['fast',100],['slow',700]] as const)await fs.writeFile(path.join(directory,'diagnostics',id+'.json'),JSON.stringify({...base,id,elapsedMs,straggler:elapsedMs>500}));
    await fs.writeFile(path.join(directory,'diagnostics/broken.json'),'incomplete');
    const history=diagnosticsReader(directory),list=await history.list({});assert.equal(list.total,1);assert.equal(list.items[0].id,'slow');assert.equal(list.summary.transitions,2);assert.equal(list.summary.stragglers,1);
    assert.equal((await history.list({onlyStragglers:false})).items.length,2);assert.equal((await history.list({mnemonic:'HOST'})).total,0);
    await assert.rejects(history.get('../outside'));assert.equal((await history.get('slow')).elapsedMs,700);
    const {stdout}=await promisify(execFile)(process.execPath,['packages/cli/src/main.ts','strag','list','--data-dir',directory]);assert.equal(JSON.parse(stdout).items[0].id,'slow');
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
