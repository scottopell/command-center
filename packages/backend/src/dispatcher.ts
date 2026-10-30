import { z } from 'zod';
import { AppError, contracts, envelopeSchema, lookupOperation, type Operation, type WorkerContext } from '../../contracts/src/index.ts';
import { Store } from './store.ts';
import { drqsWorker } from '../../../functions/drqs/worker.ts';
import { hostWorker } from '../../../functions/host/worker.ts';
import {extensionWorkers} from '../../../.generated/workers.ts';

// REQ-BW-002/003/004/007/008/009: the registry, never caller flags, controls dispatch.
export function createDispatcher(store: Store, additional:ReturnType<typeof extensionWorkers> = extensionWorkers()) {
  if(Object.keys(additional).some(key=>['DRQS','HOST'].includes(key)))throw new Error('Duplicate worker registration');
  const workers = { DRQS: drqsWorker, HOST: hostWorker, ...additional };
  if(Object.keys(workers).sort().join(',')!==Object.keys(contracts).sort().join(','))throw new Error('Worker registrations must match the operation catalog');
  for(const [fn,worker]of Object.entries(workers))for(const [op,definition]of Object.entries(worker.definition)){
    if(lookupOperation(fn,op)!==definition||typeof (worker.handlers as Record<string,unknown>)[op]!=='function')throw new Error('Worker definition differs from its registered contract');
  }
  return async (raw: unknown): Promise<unknown> => {
    const request = envelopeSchema.parse(raw);
    const contract = lookupOperation(request.function, request.operation);
    if (!contract) throw new AppError('not_found', 'Unknown function or operation');
    const input = contract.input.parse(request.input);
    const worker = workers[request.function as keyof typeof workers];
    const handler = (worker.handlers as Record<string, (ctx: WorkerContext, input: any) => Promise<unknown>>)[request.operation];
    let committed = false;
    try {
      const result = await handler({ kv: store.scoped(request.function, () => { committed = true; }) }, input);
      return contract.output.parse(result);
    } catch(error) {
      if(committed)throw new AppError('outcome_unknown','The operation committed but its result could not be confirmed. Inspect records before retrying.');
      throw error;
    }
  };
}
export function publicError(error: unknown) {
  if (error instanceof z.ZodError) return { code: 'validation', message: 'Invalid input or result', details: error.flatten() };
  if (error instanceof AppError) return { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) };
  return { code: 'internal', message: 'The operation could not be completed. Check the local worker log.' };
}
