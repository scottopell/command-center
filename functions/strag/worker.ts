import {defineWorker} from '../../packages/contracts/src/core.ts';
import {stragContract,type DiagnosticsReader} from '../../packages/contracts/src/diagnostics.ts';
// REQ-PK-010, REQ-ST-004: the host wires this dependency; folder packs cannot request it.
export function createStragWorker(history:DiagnosticsReader){
  return defineWorker(stragContract,{list:(_ctx,input)=>history.list(input),get:(_ctx,input)=>history.get(input.id)});
}
