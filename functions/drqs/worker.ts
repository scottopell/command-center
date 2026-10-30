import { userInfo } from 'node:os';
import directory from '../../data/groups.json' with { type: 'json' };
import { AppError, contracts, defineWorker, ticketSchema, type Actor, type Group, type JsonValue, type Ticket, type WorkerContext } from '../../packages/contracts/src/index.ts';

export const groups: Group[] = directory.groups;
const key = (number: number) => `ticket/${String(number).padStart(16, '0')}`;
function requireGroup(number: number) { if (!groups.some(g => g.number === number)) throw new AppError('validation', `Unknown group: ${number}`, { group: ['Select an existing group'] }); }
async function localIdentity(ctx: WorkerContext) {
  const saved = await ctx.kv.get('settings/identity') as { id: string; name: string } | undefined;
  const username = userInfo().username;
  return saved ?? { id: `${username}@local.invalid`, name: username };
}
async function actorFor(ctx: WorkerContext, input?: Actor): Promise<Actor> {
  if (input) return { ...input, name: input.name || input.id };
  return { kind: 'human', ...await localIdentity(ctx) };
}

// REQ-DR-001..010: fresh domain implementation; no Quick SDK or browser storage.
export const drqsWorker = defineWorker(contracts.DRQS, {
  groups: async () => groups,
  identity: localIdentity,
  setIdentity: async (ctx, input) => { await ctx.kv.put('settings/identity', input); return input; },
  list: async (ctx, input) => {
    if (input.group !== undefined) requireGroup(input.group);
    const needle = input.search?.toLocaleLowerCase() ?? '';
    return (await ctx.kv.list('ticket/')).map(e => ticketSchema.parse(e.value)).filter(t =>
      (input.group === undefined || t.group === input.group) &&
      (input.state === 'all' || (input.state === 'open' ? ['Q','A','N'].includes(t.state) : t.state === input.state)) &&
      (!input.type || t.type === input.type) &&
      (!needle || [String(t.number), t.title, t.body, ...t.events.map(e => e.comment)].some(v => v.toLocaleLowerCase().includes(needle)))
    ).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt) || b.number-a.number).map(({ body, events, ...summary }) => summary);
  },
  get: async (ctx, input) => { const value = await ctx.kv.get(key(input.number)); if (value === undefined) throw new AppError('not_found', `DRQS ${input.number} was not found`); return ticketSchema.parse(value); },
  create: async (ctx, input) => {
    requireGroup(input.group);
    const createdBy = await actorFor(ctx, input.actor);
    const requesters = input.requesters ?? (createdBy.kind === 'human' ? [{ kind: 'employee' as const, id: createdBy.id, name: createdBy.name || createdBy.id }] : []);
    if (!requesters.length) throw new AppError('validation', 'Agent filing requires explicit requesters', { requesters: ['Provide employee or customer references'] });
    if (new Set(requesters.map(r => `${r.kind}:${r.id}`)).size !== requesters.length) throw new AppError('validation', 'Duplicate requester');
    return ctx.kv.transaction(async tx => {
      const number = Number(await tx.get('next-ticket') ?? 0) + 1;
      if (!Number.isSafeInteger(number)) throw new AppError('internal', 'Ticket number capacity exceeded');
      const now = new Date().toISOString();
      const ticket: Ticket = { number, title: input.title, body: input.body, group: input.group, type: input.type, state: 'Q', owner: null, createdBy, requesters, createdAt: now, updatedAt: now, events: [] };
      ticketSchema.parse(ticket);
      await tx.put('next-ticket', number); await tx.put(key(number), ticket as JsonValue); return ticket;
    });
  },
  update: async (ctx, input) => {
    if (input.group !== undefined) requireGroup(input.group);
    const actor = await actorFor(ctx, input.actor);
    return ctx.kv.transaction(async tx => {
      const stored = await tx.get(key(input.number));
      if (stored === undefined) throw new AppError('not_found', `DRQS ${input.number} was not found`);
      const ticket = ticketSchema.parse(stored), changes: Record<string, JsonValue> = {};
      for (const field of ['group','state','type','owner'] as const) if (input[field] !== undefined && input[field] !== ticket[field]) changes[field] = input[field]!;
      if (!input.comment.trim() && !Object.keys(changes).length) throw new AppError('validation', 'Add a comment or change a field');
      const at = new Date().toISOString();
      const updated = ticketSchema.parse({ ...ticket, ...changes, updatedAt: at, events: [...ticket.events, { sequence: ticket.events.length + 1, at, actor, comment: input.comment.trim() ? input.comment : '', changes }] });
      await tx.put(key(ticket.number), updated as JsonValue); return updated;
    });
  },
});
