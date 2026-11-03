import { z } from 'zod';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface KVOperations {
  get(key: string): Promise<JsonValue | undefined>;
  put(key: string, value: JsonValue): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<Array<{ key: string; value: JsonValue }>>;
}
export interface WorkerKV extends KVOperations { transaction<T>(work: (tx: KVOperations) => Promise<T>): Promise<T> }
export interface WorkerContext { kv: WorkerKV }

export class AppError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) { super(message);this.name='CommandCenterError'; this.code = code; this.details = details; }
}
export const envelopeSchema = z.strictObject({ function: z.string().min(1).max(32), operation: z.string().min(1).max(64), input: z.unknown(),revision:z.string().max(128).optional(),apiEpoch:z.number().int().positive().optional() });
export function operation<I extends z.ZodType,O extends z.ZodType>(input:I,output:O):Readonly<{input:I;output:O;mutating:false}>;
export function operation<I extends z.ZodType,O extends z.ZodType,M extends boolean>(input:I,output:O,mutating:M):Readonly<{input:I;output:O;mutating:M}>;
export function operation(input:z.ZodType,output:z.ZodType,mutating=false){return Object.freeze({input,output,mutating});}
export type Operation = Readonly<{ input: z.ZodType; output: z.ZodType; mutating: boolean }>;

export type WorkerHandlers<C extends Record<string, Operation>> = { [K in keyof C]: (ctx: WorkerContext, input: z.output<C[K]['input']>) => Promise<z.input<C[K]['output']>> };
export function defineWorker<C extends WorkerContract>(contract:C,handlers:WorkerHandlers<C['operations']>){return {name:contract.name,definition:contract.operations,handlers};}

// REQ-PK-003: clients are typed by the author's contract, not installed functions.
export interface WorkerContract<O extends Record<string,Operation> = Record<string,Operation>> {readonly name:string;readonly operations:O}
export function defineContract<const O extends Record<string,Operation>>(name:string,operations:O):WorkerContract<O>{
  if(!/^[A-Z][A-Z0-9]{0,31}$/.test(name))throw new Error('Invalid worker mnemonic');
  return Object.freeze({name,operations:Object.freeze(operations)});
}
export type OperationName<C extends WorkerContract> = keyof C['operations'] & string;
export type OperationInput<C extends WorkerContract,K extends OperationName<C>> = z.input<C['operations'][K]['input']>;
export type OperationOutput<C extends WorkerContract,K extends OperationName<C>> = z.output<C['operations'][K]['output']>;
export type ClassifiedOperation<C extends WorkerContract,M extends boolean> = {[K in OperationName<C>]:C['operations'][K] extends {mutating:M}?K:never}[OperationName<C>];
export type ReadOperation<C extends WorkerContract> = ClassifiedOperation<C,false>;
export type WriteOperation<C extends WorkerContract> = ClassifiedOperation<C,true>;
export function operationFor(worker:WorkerContract,key:string):Operation|undefined{return Object.hasOwn(worker.operations,key)?worker.operations[key]:undefined;}
export type DefinedWorker = ReturnType<typeof defineWorker>;
