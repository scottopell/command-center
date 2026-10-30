# Adding a function

The function contract has metadata, an asynchronous resolver and a React View. Optional registered child screens use the same resolve-to-View shape. There is no author readiness callback, form model, custom unload hook or reconstruction store.

```tsx
export const example = defineFunction({
  mnemonic: 'EXAMPLE',
  title: 'An example',
  async resolve({ tail, signal, client }) {
    await client.call('DRQS', 'groups', {}); // Preload the invocation query cache.
    signal.throwIfAborted();
    return { tail };
  },
  View({ tail }) {
    const groups = useWorkerQuery('DRQS', 'groups', {});
    return <main tabIndex={0} data-initial-focus>
      {tail}: {groups.data?.length} groups
      {groups.error && <p role="alert">Refresh failed: {groups.error.message}</p>}
    </main>;
  },
});
```

Props follow the resolver result. Type checking rejects an incompatible View. The resolver's client exposes registered reads and source opening, not mutations. Render application data directly from `useWorkerQuery`; required resolver reads preload that same cache. Keep drafts, filters and selection in ordinary React state. Show query errors and `dataUpdatedAt` separately from owner observation timestamps. Refresh with `query.refetch()` without reinitializing drafts. The query client belongs to the invocation: successful results are retained without inactivity collection, reads use no automatic retries, and reveal refreshes stale active queries while cached content remains visible.

Exactly one attached, visible, enabled, focusable element has `data-initial-focus` inside each entry's first resolved commit. A text input/textarea supports queued text; a read-only focusable container is valid when there is no queued text. The framework validates preparation before native handoff establishes interactivity. Later refreshes do not reapply initial focus. Put successive text fields in ordinary Tab order; no custom focus graph is interpreted during loading. Use uncontrolled defaults/FormData or normal React state. Do not compete with the shell using autofocus Effects.

## Child screens and Back

```tsx
const screens = defineScreens({
  detail: defineScreen({
    params: z.strictObject({ number: z.number().int().positive() }),
    async resolve({ params, client }) {
      await client.call('DRQS', 'get', params);
      return params;
    },
    View({ number }) {
      const task = useWorkerQuery('DRQS', 'get', { number });
      return <main tabIndex={0} data-initial-focus>{task.data?.title}</main>;
    },
  }),
});

function List() {
  const navigation = useNavigation(screens);
  return <button data-initial-focus onClick={() => navigation.push('detail', { number: 42 })}>
    Open task
  </button>;
}
// Attach the exact registry: defineFunction({ ..., screens, View: List }).
```

The function chooses `push` or `replace`. Names and parameter types come from the registry and are checked again at runtime. Push retains the parent with React Activity, suspending Effects while preserving ordinary React and DOM state. Replace discards the current entry. Framework Back pops a child even during loading/failure. Root Back is disabled; direct-launch detail has no invented list history. The stack holds at most four entries. Use replace for peer-to-peer record chains rather than accumulating nested history.

Do not provide app Back buttons or restoration callbacks. The framework owns a primary scroll viewport. Mark list rows with unique stable `data-nav-item` values to preserve an item anchor; without markers the primary offset remains the fallback. On reveal and query commits, framework correction preserves the anchor until subsequent user interaction. If the anchor disappears, the next surviving item, previous item or initial focus receives the return target, with a brief inline notice. Command-focused Back preserves the command draft and defers function focus. Pointer Back explicitly resumes function input. Nested/virtualized scrollers and arbitrary animated/media geometry have no restoration guarantee.

Each command gets a fresh WebKit document, stack and query client. Popped entries unmount; cancelling or switching discards the entire invocation. Observe AbortSignal for resolver resources and use normal React Effect cleanup for subscriptions. Activity suspends Effects, not arbitrary work started outside them. An admitted worker operation may finish after its originating entry disappears.

## Mutations and data access

```tsx
const changeStatus = useWorkerMutation('DRQS', 'update');
// Only from an explicit action on the active interactive screen:
await changeStatus.mutateAsync({ number: 42, state: 'R' });
```

Successful registered mutations invalidate all invocation queries automatically. Authors do not patch cached rows or implement invalidation. Handle errors in the action. Disable ordinary submit while `isPending` or `isUnknown`; refresh does not clear uncertainty. A new entry/invocation is a new intent without a deduplication guarantee. Prefer narrow owner commands or explicitly changed fields over whole-record replacement. Explicit DRQS field changes use last committed command wins; DRQS comments append to current history. Future replacement editors need atomic owner revision checks.

Use only the registered query/mutation path for application data. Browser connection/resource policy blocks ordinary outbound fetch, XHR, sockets and external embeds. This is a supported built-in boundary, not a hostile-plugin sandbox. `client.openExternal(url)` is a separate human-action capability: pass the client through resolver props when needed and call directly from a fresh human click. Native validation allows HTTPS and exact loopback HTTP origins declared by the build catalog. Handle rejection visibly; do not navigate the bundled document or defer source opening across an awaited operation.

The source guard rejects module-level mutable state, data caches, global access and top-level side effects. Imports, types, functions, primitive constants, frozen literal metadata and `defineFunction`/`defineScreen`/`defineScreens` registrations are allowed. It is a development guard, not proof about arbitrary dependencies. Diagnostics expose entry timing, count and serialized cache sizes; they are not per-screen heap attribution. Build-time composition generates UI, worker and native command catalogs from explicit source inputs. Dynamic plugin installation is outside scope.

# Adding a Function Worker

Define built-in schemas in `packages/contracts/src/builtins.ts`, handlers with `defineWorker`, and register in the backend dispatcher. Native mutation metadata is derived from the schemas. Authors do not implement HTTP, credentials or storage engines.

```ts
const definition = {
  get: operation(z.object({ key: z.string() }), z.unknown()),
  set: operation(z.object({ key: z.string(), value: jsonSchema }), z.null(), true),
};
const worker = defineWorker(definition, {
  async get({ kv }, { key }) { return (await kv.get(key)) ?? null; },
  async set({ kv }, { key, value }) { await kv.put(key, value); return null; },
});
```

Schemas supply types and runtime validation. Registry metadata classifies reads/writes; caller flags cannot override it. Human and agent paths preserve the same application rules and outcomes.

`WorkerContext` exposes only its persistent namespace-bound `kv`:

| Method | Semantics |
| --- | --- |
| `get(key)` | Parsed JSON value, or undefined if missing; null is a stored value. |
| `put(key,value)` | Replace the whole JSON value. Finite, acyclic plain JSON only. |
| `delete(key)` | Idempotent deletion. |
| `list(prefix?)` | Ordered entries matching a literal prefix. |
| `transaction(async tx => result)` | Serialized atomic reads/writes; commit all or roll back all. Callback is never retried. |

Use supplied `tx` inside transactions. Nested transactions and escaped/expired handles are rejected. Fetch external information before entering short storage transactions. Handles expose no other namespaces, files, SQL or tables.

Workers are service-lived and never retain DOM, View props or invocation callbacks. Cancellation revokes UI authority, not admitted work. Requests dispatch once without automatic write or transaction retry. Internal safe read retry remains an owner choice. A committed write followed by lost/invalid/oversized response is `outcome_unknown`, not rollback. RPC response envelopes are limited to 2 MiB; bound owner reads before constructing large results.

A worker can adapt a fixed local owner without mirroring its data. Bound upstream time/bytes/items, project needed fields and normalize errors. Preserve remote commit uncertainty independently of local KV commits. Relaunch may read before an earlier admitted write commits; later refresh discovers it. No global completion barrier is provided.

## Browsing sibling records

`navigation.pushSequence('detail', { items, selectedKey })` pushes the first detail with collection context. Each item is `{ key: string, params: /* destination schema input */ }`. Supply only displayed, ordered keys and parameters, such as `tasks.map(task => ({ key: String(task.id), params: { id: task.id } }))`. The framework validates and clones at most 200 unique descriptors/64 KiB. Do not pass records, callbacks or view state.

Previous/Next use that original sequence and replace the detail at the same stack depth. Every replacement resolves current required data and starts at initial focus/scroll; no earlier detail drafts or scroll positions are restored. Back returns to the retained original parent and return position. Queries do not rewrite sequence membership. Opening from the list again captures a new sequence. Direct detail commands and ordinary push/replace have no implicit sibling context. No wrapping, paging or missing-item skip is supplied.

The native controls show position among loaded items. Cmd-Option-Up/Down work in interactive non-editable function content; command fields and editable controls keep their ordinary keys. Loading, errors, repeated keys and pending admission cannot queue movement. A function opts in explicitly; an editor needs its own explicit journey before exposing destructive sibling movement.

Displayed, non-editable text is automatically copied as plain text after a completed user selection. Inputs, textareas, selects, contenteditable and the command bar are excluded. Programmatic selection alone never copies; deselection never clears the clipboard. The native clipboard write checks current entry/generation and a 2 MiB UTF-8 limit. It needs no author hook or worker API and stores no clipboard history.
