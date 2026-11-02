import {z} from 'zod';
import {defineContract,operation} from './core.ts';
export const transitionSchema=z.strictObject({
  id:z.string().regex(/^[A-Za-z0-9-]{1,128}$/),mnemonic:z.string().max(32),packId:z.string().max(96),functionId:z.string().max(96),revision:z.string().max(128),command:z.string().max(4096),
  kind:z.enum(['launch','push','replace','back','sibling']),startedAt:z.string(),elapsedMs:z.number().nonnegative(),straggler:z.boolean(),outcome:z.enum(['pending','ready','error','canceled','superseded']),
  phases:z.record(z.string().max(64),z.number()),operations:z.array(z.strictObject({function:z.string().max(32),operation:z.string().max(64),durationMs:z.number().nonnegative(),outcome:z.string().max(64)})).max(32),
  context:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()])),
});
export type TransitionRecord=z.infer<typeof transitionSchema>;
export const diagnosticFilterSchema=z.strictObject({since:z.iso.datetime().optional(),mnemonic:z.string().max(32).optional(),onlyStragglers:z.boolean().default(true),limit:z.number().int().min(1).max(200).default(100)});
export const diagnosticsListSchema=z.strictObject({items:z.array(transitionSchema).max(200),total:z.number().int(),truncated:z.boolean(),summary:z.strictObject({transitions:z.number().int(),stragglers:z.number().int(),byFunction:z.array(z.strictObject({mnemonic:z.string(),transitions:z.number().int(),stragglers:z.number().int(),maximumMs:z.number()}))})});
export const stragContract=defineContract('STRAG',{
  list:operation(diagnosticFilterSchema,diagnosticsListSchema),
  get:operation(z.strictObject({id:z.string().regex(/^[A-Za-z0-9-]{1,128}$/)}),transitionSchema),
});
export interface DiagnosticsReader {
  list(input:z.input<typeof diagnosticFilterSchema>):Promise<z.output<typeof diagnosticsListSchema>>;
  get(id:string):Promise<TransitionRecord>;
}
