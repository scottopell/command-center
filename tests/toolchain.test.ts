import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,manifest,xcodegen} from '../scripts/toolchain.mjs';

// REQ-FF-012: the documented pins and fresh-install lock cannot drift separately.
test('toolchain and direct dependency pins agree with the lockfile',()=>{
  const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  for(const file of ['.nvmrc','.node-version'])assert.equal(fs.readFileSync(path.join(root,file),'utf8').trim(),manifest.engines.node);
  assert.equal(manifest.packageManager,`npm@${manifest.engines.npm}`);
  for(const kind of ['dependencies','devDependencies'] as const)for(const [name,version]of Object.entries(manifest[kind])){
    assert.match(version as string,/^\d+\.\d+\.\d+$/);
    assert.equal(lock.packages['node_modules/'+name]?.version,version);
    assert.equal(lock.packages[''][kind][name],version);
  }
  for(const item of Object.values(lock.packages) as any[])if(item.resolved&&!item.link){
    assert.equal(new URL(item.resolved).origin,'https://registry.npmjs.org');
    assert.match(item.integrity,/^sha512-/);
  }
  assert.equal(new URL(xcodegen.url).origin,'https://github.com');
  assert.ok(xcodegen.url.includes('/'+xcodegen.version+'/'));
  assert.match(xcodegen.sha256,/^[a-f0-9]{64}$/);
});
