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
  constructor(code: string, message: string, details?: unknown) { super(message); this.code = code; this.details = details; }
}
export const envelopeSchema = z.strictObject({ function: z.string().min(1).max(32), operation: z.string().min(1).max(64), input: z.unknown() });
export function operation<I extends z.ZodType, O extends z.ZodType, M extends boolean = false>(input: I, output: O, mutating: M = false as M) { return Object.freeze({ input, output, mutating }); }
export type Operation = Readonly<{ input: z.ZodType; output: z.ZodType; mutating: boolean }>;

export type WorkerHandlers<C extends Record<string, Operation>> = { [K in keyof C]: (ctx: WorkerContext, input: z.output<C[K]['input']>) => Promise<z.input<C[K]['output']>> };
export function defineWorker<C extends Record<string, Operation>>(definition: C, handlers: WorkerHandlers<C>) { return { definition, handlers }; }
