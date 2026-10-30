import { defineFunction,defineScreen,defineScreens,useNavigation } from '../packages/ui/src/framework.tsx';
import {useWorkerQuery,useWorkerMutation} from '../packages/ui/src/queries.tsx';
import {z} from 'zod';
import type { Client } from '../packages/ui/src/framework.tsx';
// REQ-FF-001, REQ-BW-003: these errors must remain errors, not any-based inference.
defineFunction({mnemonic:'GOOD',title:'Good',resolve:async()=>({count:1}),View:({count}:{count:number})=><div>{count}</div>});
defineFunction({mnemonic:'BAD',title:'Bad',resolve:async()=>({count:1}),
  // @ts-expect-error resolver props are incompatible with this View
  View:({count}:{count:string})=><div>{count}</div>});
function typeChecks(client:Client){
  // @ts-expect-error wrong payload field type
  void client.call('DRQS','get',{number:'42'});
  // @ts-expect-error unknown operation
  void client.call('HOST','create',{});
}
void typeChecks;
const screens=defineScreens({detail:defineScreen({params:z.strictObject({id:z.number()}),resolve:async({params})=>({id:params.id}),View:({id})=><div>{id}</div>})});
function NavigationTypeChecks(){
  const navigation=useNavigation(screens);
  navigation.push('detail',{id:42});
  navigation.pushSequence('detail',{items:[{key:'42',params:{id:42}}],selectedKey:'42'});
  // @ts-expect-error collection destination parameters follow the registered schema
  navigation.pushSequence('detail',{items:[{key:'42',params:{id:'42'}}],selectedKey:'42'});
  // @ts-expect-error collection destination must be registered
  navigation.pushSequence('unknown',{items:[],selectedKey:'42'});
  // @ts-expect-error destination must be declared
  navigation.push('unknown',{id:42});
  // @ts-expect-error destination parameters follow its schema
  navigation.replace('detail',{id:'42'});
  useWorkerQuery('DRQS','get',{number:42});
  // @ts-expect-error writes are not queries
  useWorkerQuery('DRQS','setIdentity',{id:'test@example.com',name:'Fixture'});
  // @ts-expect-error reads are not mutations
  useWorkerMutation('DRQS','list');
  const status=useWorkerMutation('DRQS','setIdentity');
  // @ts-expect-error mutation input follows registered schema
  void status.mutateAsync({id:42,name:'Fixture'});
  return null;
}
void NavigationTypeChecks;
