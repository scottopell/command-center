import {defineWorker} from '@command-center/sdk/worker';
import {contract} from './contract.ts';
export const notesWorker=defineWorker(contract,{
  read:async({kv})=>(await kv.list('note/')).map(item=>({key:item.key,text:String(item.value)})),
  save:async({kv},input)=>{await kv.put('note/'+Date.now(),input.text);return {saved:true as const};},
});
