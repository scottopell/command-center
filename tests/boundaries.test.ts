import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectFunction } from '../scripts/check-function-boundaries.mjs';
// REQ-FF-006: reject common ways to accidentally retain big payloads across launches.
test('function source guard rejects retained mutable state and globals',()=>{
  for(const source of ['let blob;','const cache = new Map();','const draft = {};','function View(){window.blob = result;}','globalThis.blob = data;'])assert.ok(inspectFunction(source).length);
  assert.deepEqual(inspectFunction('const code = "DRQS"; function View(){const [data,setData]=useState(null);} export const drqs=defineFunction({});'),[]);
});
