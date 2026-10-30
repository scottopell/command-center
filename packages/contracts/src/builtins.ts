import {z} from 'zod';
import {operation} from './core.ts';
export const actorSchema = z.strictObject({ kind: z.enum(['human', 'agent']), id: z.string().trim().min(1).max(254), name: z.string().trim().max(254).optional() });
export type Actor = z.infer<typeof actorSchema>;
export const requesterSchema = z.strictObject({ kind: z.enum(['employee', 'customer']), id: z.string().trim().min(1).max(254), name: z.string().trim().max(254).optional() }).refine(r => r.kind !== 'employee' || z.email().safeParse(r.id).success, { message: 'Employee requester must be an email reference', path: ['id'] });
export const groupSchema = z.strictObject({ number: z.number().int().positive(), id: z.string(), name: z.string(), products: z.array(z.string()) });
export type Group = z.infer<typeof groupSchema>;
export const TYPES = Object.freeze({ BF: 'Bug Fix', EN: 'Enhancement', OU: 'Operational Update', WP: 'World Problem', MO: 'Major Outage' });
export const STATES = Object.freeze({ Q: 'Open', A: 'Acknowledged', N: 'Needs information', W: 'Withdrawn', R: 'Resolved' });
export const typeSchema = z.enum(['BF', 'EN', 'OU', 'WP', 'MO']);
export const stateSchema = z.enum(['Q', 'A', 'N', 'W', 'R']);
const ticketNumber = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const eventSchema = z.strictObject({ sequence: z.number().int(), at: z.string(), actor: actorSchema, comment: z.string(), changes: z.record(z.string(), z.unknown()) });
export const ticketSchema = z.strictObject({ number: ticketNumber, title: z.string(), body: z.string(), group: z.number(), type: typeSchema, state: stateSchema, owner: z.string().nullable(), createdBy: actorSchema, requesters: z.array(requesterSchema), createdAt: z.string(), updatedAt: z.string(), events: z.array(eventSchema) });
export type Ticket = z.infer<typeof ticketSchema>;
export const summarySchema = ticketSchema.omit({ body: true, events: true });
export type TicketSummary = z.infer<typeof summarySchema>;


const empty=z.strictObject({});
const identity=z.strictObject({id:z.email(),name:z.string().trim().min(1).max(254)});
export const builtinContracts = {
  DRQS: {
    groups: operation(empty, z.array(groupSchema)),
    identity: operation(empty, identity),
    setIdentity: operation(identity, identity, true),
    list: operation(z.strictObject({ group: ticketNumber.optional(), state: z.union([stateSchema, z.enum(['open', 'all'])]).default('open'), type: typeSchema.optional(), search: z.string().max(100000).optional() }), z.array(summarySchema)),
    get: operation(z.strictObject({ number: ticketNumber }), ticketSchema),
    create: operation(z.strictObject({ title: z.string().trim().min(1).max(240), body: z.string().min(1).max(100000).refine(v => v.trim().length > 0, 'Description is required'), group: ticketNumber, type: typeSchema.default('BF'), actor: actorSchema.optional(), requesters: z.array(requesterSchema).max(100).optional() }), ticketSchema, true),
    update: operation(z.strictObject({ number: ticketNumber, comment: z.string().max(100000).default(''), group: ticketNumber.optional(), state: stateSchema.optional(), type: typeSchema.optional(), owner: z.union([z.email(), z.null()]).optional(), actor: actorSchema.optional() }), ticketSchema, true),
  },
  HOST: { snapshot: operation(empty, z.strictObject({ machine: z.record(z.string(), z.unknown()), environment: z.record(z.string(), z.string().nullable()), services: z.array(z.record(z.string(), z.unknown())), sources: z.array(z.record(z.string(), z.unknown())), observedAt: z.string() })) },
} as const;
