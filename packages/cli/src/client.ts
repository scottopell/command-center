import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError, lookupOperation, type FunctionName, type InputFor, type OperationName, type OutputFor } from '../../contracts/src/index.ts';
import { dataDirectory } from '../../backend/src/config.ts';

// REQ-BW-009/011: one request; no automatic redispatch after an uncertain response.
export async function call<F extends FunctionName, K extends OperationName<F>>(fn: F, operation: K, input: InputFor<F,K>, directory = dataDirectory()): Promise<OutputFor<F,K>> {
  let connection: {url:string;token:string};
  try { connection = JSON.parse(await readFile(path.join(directory,'connection.json'),'utf8')); }
  catch { throw new AppError('unavailable','Local service is not installed or has not started. Run npm run service:install.'); }
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(connection.url)) throw new AppError('unavailable','Invalid local service address');
  const definition = lookupOperation(fn,operation);
  let metadata:any;try{const catalog=JSON.parse(await readFile(path.join(directory,'packs/catalog.json'),'utf8'));metadata=catalog.commands?.find((item:any)=>item.mnemonic===fn);}catch{}
  const mutation=metadata?.operations?.[operation]??definition?.mutating??true;
  let response: Response;
  try {
    response = await fetch(`${connection.url}/rpc`,{method:'POST',headers:{Authorization:`Bearer ${connection.token}`,'Content-Type':'application/json'},body:JSON.stringify({function:fn,operation,input,...(metadata?.revision?{revision:metadata.revision}:{})}),signal:AbortSignal.timeout(30000),redirect:'error'});
  } catch { throw new AppError(mutation ? 'outcome_unknown' : 'unavailable', mutation ? 'The response was lost. The operation may have committed; inspect the records before retrying.' : 'The local service could not be reached.'); }
  let body: any;
  try { body = await response.json(); } catch { throw new AppError(mutation ? 'outcome_unknown' : 'unavailable','The service response could not be read; no retry was attempted.'); }
  if (!response.ok || !body.ok) throw new AppError(body.error?.code ?? 'internal', body.error?.message ?? 'Local request failed', body.error?.details);
  return body.result;
}
