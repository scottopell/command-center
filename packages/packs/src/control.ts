import {z} from 'zod';

// REQ-PK-007/014: all management clients name the same validated commands.
const id=z.string().min(1).max(128);
export const managementActionSchema=z.discriminatedUnion('action',[
  z.strictObject({action:z.literal('add'),source:z.string().min(1).max(4096)}),
  z.strictObject({action:z.literal('build'),id}),
  z.strictObject({action:z.literal('apply'),id,revision:z.string().regex(/^[a-f0-9]{64}$/)}),
  z.strictObject({action:z.literal('remove'),id}),
  z.strictObject({action:z.literal('purge'),id}),
]);
