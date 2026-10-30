import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, chmod, rename } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { AppError, lookupOperation } from '../../contracts/src/index.ts';
import { Store } from './store.ts';
import { createDispatcher, publicError } from './dispatcher.ts';
import { dataDirectory, defaultPort } from './config.ts';

export const MAX_RPC_RESPONSE_BYTES = 2 * 1024 * 1024;

// REQ-BW-001/010: one per-user loopback listener; credentials never enter page content.
export async function startServer({ directory = dataDirectory(), port = defaultPort, workers }: {
  directory?: string; port?: number; workers?: Parameters<typeof createDispatcher>[1];
} = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
  let token: string;
  try { token = (await readFile(path.join(directory,'token'),'utf8')).trim(); if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid local credential file'); }
  catch (e: any) { if (e.code !== 'ENOENT') throw e; token = randomBytes(32).toString('hex'); await writeFile(path.join(directory,'token'), token, { mode: 0o600, flag: 'wx' }); }
  await chmod(path.join(directory,'token'),0o600);
  const store = new Store(path.join(directory, 'data.sqlite'));
  const dispatch = createDispatcher(store, workers);
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store');
    // REQ-QL-009, REQ-BW-009: bound serialized bytes without pretending a completed write rolled back.
    const send = (status: number, body: unknown, mutation = false) => {
      if(res.destroyed)return;
      const failure=(code:string,message:string)=>JSON.stringify({ok:false,error:{code,message}});
      let encoded:string;
      try{encoded=JSON.stringify(body);}
      catch{status=500;encoded=failure(mutation?'outcome_unknown':'internal',mutation?'The action may have committed, but its result could not be encoded. Inspect records before retrying. No retry was attempted.':'The worker result could not be encoded.');}
      if(Buffer.byteLength(encoded,'utf8')>MAX_RPC_RESPONSE_BYTES){
        status=500;encoded=failure(mutation?'outcome_unknown':'response_too_large',mutation?'The action may have committed, but its result exceeds the response limit. Inspect records before retrying. No retry was attempted.':'The result exceeds the 2 MiB response limit. Narrow the query or open the owning app.');
      }
      res.statusCode=status;res.end(encoded);
    };
    const supplied = Buffer.from(req.headers.authorization?.replace(/^Bearer /,'') ?? ''); const expected = Buffer.from(token);
    if (req.headers.origin || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { send(401,{ok:false,error:{code:'unauthorized',message:'A local client credential is required'}}); req.resume(); return; }
    if (req.method === 'GET' && req.url === '/health') { send(200,{ok:true,result:{service:'command-center',version:'0.1.0'}}); return; }
    if (req.method !== 'POST' || req.url !== '/rpc') { send(404,{ok:false,error:{code:'not_found',message:'Unknown endpoint'}}); req.resume(); return; }
    try {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 1024*1024) throw new AppError('validation','Request exceeds 1 MiB'); chunks.push(chunk); }
      let raw: unknown; try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError('validation','Expected a JSON request'); }
      const result = await dispatch(raw);
      // Successful dispatch already established a valid registered envelope; payload flags never classify writes.
      const request=raw as {function:string;operation:string};
      send(200,{ok:true,result},lookupOperation(request.function,request.operation)!.mutating);
    } catch (error) { const safe = publicError(error); if(safe.code==='internal')console.error('Worker request failed',error); send(safe.code === 'not_found' ? 404 : safe.code === 'validation' ? 400 : 500,{ok:false,error:safe}); }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  try { await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve());}); }
  catch(error) { store.close();throw error; }
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing bound address');
  const connection = { url: `http://127.0.0.1:${address.port}`, token, pid: process.pid, version: '0.1.0' };
  const temp = path.join(directory,`connection.${process.pid}.json`);
  await writeFile(temp,JSON.stringify(connection),{mode:0o600}); await rename(temp,path.join(directory,'connection.json')); await chmod(path.join(directory,'connection.json'),0o600);
  return { server, store, connection, close: async () => { await new Promise<void>(resolve=>server.close(()=>resolve())); store.close(); } };
}
if (process.argv[1] && (import.meta.url === pathToFileURL(process.argv[1]).href || process.argv[1].endsWith('backend.cjs'))) {
  const {values} = parseArgs({options:{'data-dir':{type:'string'},port:{type:'string'}},strict:true});
  const running = await startServer({ directory: values['data-dir'] || dataDirectory(), port: values.port ? Number(values.port) : defaultPort });
  console.log(`CommandCenter worker listening on ${running.connection.url}`);
  for (const sig of ['SIGTERM','SIGINT'] as const) process.once(sig,()=>{void running.close().then(()=>process.exit(0));});
}
