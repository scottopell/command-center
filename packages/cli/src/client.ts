import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError, lookupOperation, type FunctionName, type InputFor, type OperationName, type OutputFor } from '../../contracts/src/index.ts';
import { dataDirectory } from '../../backend/src/config.ts';

// REQ-BW-009/011: one request; no automatic redispatch after an uncertain response.
export async function call<F extends FunctionName, K extends OperationName<F>>(fn: F, operation: K, input: InputFor<F,K>, directory = dataDirectory()): Promise<OutputFor<F,K>> {
  const definition = lookupOperation(fn,operation);
  let metadata:any;try{const catalog=JSON.parse(await readFile(path.join(directory,'packs/catalog.json'),'utf8'));metadata=catalog.commands?.find((item:any)=>item.mnemonic===fn);}catch{}
  const mutation=metadata?.operations?.[operation]??definition?.mutating??true;
  return await serviceRequest('/rpc',{function:fn,operation,input,...(metadata?.revision?{revision:metadata.revision}:{})},directory,mutation) as OutputFor<F,K>;
}

// REQ-PK-014: shared authenticated local transport; no automatic redispatch.
export async function serviceRequest(route:string,payload:unknown=undefined,directory=dataDirectory(),mutation=false,timeoutMs=30000):Promise<any>{
  let connection: {url:string;token:string};
  try { connection = JSON.parse(await readFile(path.join(directory,'connection.json'),'utf8')); }
  catch { throw new AppError('unavailable','Local service is not installed or has not started. Run npm run service:install.'); }
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(connection.url)) throw new AppError('unavailable','Invalid local service address');
  let response: Response;
  try {
    response = await fetch(`${connection.url}${route}`,{method:payload===undefined?'GET':'POST',headers:{Authorization:`Bearer ${connection.token}`,'Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
  } catch { throw new AppError(mutation ? 'outcome_unknown' : 'unavailable', mutation ? 'The response was lost. The operation may have committed; inspect the records before retrying.' : 'The local service could not be reached.'); }
  let body: any;
  try { body = await response.json(); } catch { throw new AppError(mutation ? 'outcome_unknown' : 'unavailable','The service response could not be read; no retry was attempted.'); }
  if(!body||typeof body!=='object'||typeof body.ok!=='boolean')throw new AppError(mutation?'outcome_unknown':'unavailable','Malformed service response; inspect status before retrying. No retry was attempted.');
  if (!response.ok || !body.ok) throw new AppError(body.error?.code ?? 'internal', body.error?.message ?? 'Local request failed', body.error?.details);
  return body.result;
}
