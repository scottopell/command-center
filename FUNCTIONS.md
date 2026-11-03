# Author a function pack

A pack is a source folder with `command-center.json`. Git is optional. CommandCenter snapshots the folder, type-checks it with its pinned SDK/compiler, and builds per-function browser assets and a worker module. No Swift build belongs in a pack. Start with [the NOTES example](examples/notes-pack/command-center.json).

Built-in functions and installed packs use minified browser JavaScript and CSS with separate source maps. Function artifacts contain application code and references to local host modules; the SDK, React and query providers are supplied by CC, with one identity per document. Worker SDK imports resolve through the host's local runtime too. No runtime modules come from the network. Worker bundles remain unminified.

```json
{
  "id": "example.notes",
  "apiEpoch": 1,
  "functions": [{
    "id": "notes", "mnemonic": "NOTES", "title": "Personal notes",
    "ui": "ui.tsx", "uiExport": "notes",
    "worker": "worker.ts", "workerExport": "notesWorker"
  }]
}
```

Pack and function IDs are permanent storage identities. A mnemonic is a globally unique launch label. Duplicate providers are rejected; there are no override priorities. Removing a pack retains its data. Only the internal management UI offers explicit deletion after removal.

## Screens mount before data

Command preparation is synchronous syntax parsing. It receives the tail, never a worker client. Return route parameters; load application data through non-suspending query hooks inside ordinary React components.

```tsx
import {defineFunction, useWorkerQuery} from '@command-center/sdk';
import {contract} from './contract.ts';

function NotesView() {
  const notes = useWorkerQuery(contract, 'read', {});
  return <main>
    <label>Draft<textarea data-initial-focus /></label>
    {notes.isPending && <p>Reading notes…</p>}
    {notes.error && <p role="alert">{notes.error.message}</p>}
    {notes.data?.map((note, index) => <p key={index}>{note}</p>)}
  </main>;
}
export const notes = defineFunction({
  mnemonic: 'NOTES', title: 'Personal notes',
  prepare({tail}) {
    if (tail.trim()) throw new Error('NOTES takes no arguments');
    return {};
  },
  View: NotesView,
});
```

Keep the real initial interaction surface mounted while queries load. Exactly one active-entry element must declare `data-initial-focus`: a usable input or a reading container with `tabIndex={0}`. Never replace a draft field when data arrives, key the whole form by query data, or reset draft state on refresh. Ordinary `useState`, uncontrolled fields, FormData and React cleanup remain supported. Query-dependent actions may remain disabled until validation data arrives. Suspense or a spinner must not replace the initial interaction surface.

Readiness is framework-owned: commit, destination validation, an animation-frame callback and a separately queued acknowledgment. There is no timer substitute for the frame. Hidden views may await resumed rendering before readiness; preparation and application queries can continue. Native timing is separate from actual focus/input activation, IME composition and buffer drainage. The 500 ms budget applies only while CC stays active and its window remains at least partially unoccluded. Switching away before detection permanently excludes that measurement; returning never restarts its clock. An already-detected straggler remains recorded. All raw durations remain inspectable, with excluded records omitted from SLO counts and maxima. No exact compositor-presentation or arbitrary-button correctness guarantee is made.

## Local typed worker contracts

```ts
import {z} from 'zod';
import {defineContract, operation, defineWorker} from '@command-center/sdk/contracts';

export const contract = defineContract('NOTES', {
  read: operation(z.strictObject({}), z.array(z.string())),
  save: operation(z.strictObject({text: z.string()}), z.null(), true),
});
export const notesWorker = defineWorker(contract, {
  async read({kv}) { return (await kv.list('note/')).map(row => String(row.value)); },
  async save({kv}, {text}) { await kv.put('note/current', text); return null; },
});
```

Queries accept only declared reads; mutation handles accept only declared writes. Types come from this contract object, not the host's other installed functions. The worker mnemonic must match its manifest entry. Results must be finite serializable JSON; use explicit null rather than undefined. KV is scoped to stable pack/function identity. Use its explicit transaction callback for related local reads/writes; never perform remote I/O inside it.

Workers are trusted local Node code, not a third-party sandbox. Finish all application work before the handler promise resolves. Do not perform application-data writes during module or worker initialization, detach background application work, or require automatic data migrations. An unknown mutation outcome is not a rejection; no automatic retry or semantic deduplication is supplied.

Use `useWorkerMutation(contract, 'save')`; the shared layer rejects duplicate pending/unknown submissions and invalidates invocation queries after success. New query observers display cached data immediately while refreshing. Back retains filters/drafts and restores the operator's place while owner data revalidates. Query defaults retain inactive cache for the invocation and disable automatic transport retries.

## Navigation and source links

Declare child screens with `defineScreen({params: schema, View})`, group them with `defineScreens`, and pass that registry in the function definition. `useNavigation(screens)` provides typed push, replace and pushSequence. The framework owns Back, a maximum depth of four, retained covered screens, primary scroll/focus restoration, and sibling Previous/Next replacement. Use `data-nav-item` for stable row identity. There is no app-specific back handler or per-sibling draft restoration.

Use `useOpenExternal()` from the framework to open validated sources directly from a fresh human click. Frontends cannot fetch remote scripts/data or replace their document with an external page. Exact loopback HTTP source origins must be declared in `localSourceOrigins`; HTTPS sources are supported. Backend credentials and persistence handles never enter the WebView.

## Install, check and update

In Functions management, choose Add Pack, wait for Ready to enable, then Enable Functions. Each card shows its functions and status. Source changes prepare updates automatically; activation is manual through Apply Update (or Apply & Relaunch for an open function). More contains Check for Changes, Pack Details and Remove Pack; removed packs expose Delete Saved Data there. Apply cancels an affected open function, finishes admitted work, briefly restarts the shared worker runtime, and relaunches its bare mnemonic without arguments. Other open functions remain mounted. A drain deadline postpones the update. Candidate startup failure retains the old installation; code fallback does not undo application writes.

```sh
command-center pack check /path/to/pack
command-center pack test /path/to/pack
```

The second command also type-checks the pack's tests and runs its `tests/*.test.ts` through the installed SDK toolchain. `command-center pack check-installed` checks all non-removed registered source folders against the current SDK without applying their changes; it works with the service stopped and returns nonzero if any source is unavailable or incompatible.

No native build or private npm install is needed for platform-provided dependencies. CommandCenter owns React 19.3.1, React DOM 19.3.1, TanStack Query 5.105.0, Zod 4.6.7 and the compiler. Omit those dependencies from a pack's package.json; CC supplies their runtime and types. Additional dependencies require exact registry versions and a SHA-512 integrity lockfile. Lifecycle/build scripts, native add-ons, computed runtime imports, symlinks and imports escaping the source snapshot are unsupported. Explicitly copy worker assets using the manifest `assets` list; browser asset imports are bundled. External owner services remain legitimate dependencies.

## Runtime updates and compatibility

`apiEpoch` is the only compatibility declaration. CC supports one epoch across the SDK, native bridge and workers. SDK implementation changes within that epoch reach the next function launch and worker start automatically, without a pack rebuild or Apply. Open documents retain their selected immutable runtime and drafts. Ordinary source edits still require manual Apply. A build fingerprint records which SDK checked an artifact; a different fingerprint does not block it.

For a breaking API change, bump the epoch and update your functions together. Run pack check/test against the new SDK. A missing or mismatched epoch gives Update required; that pack's workers are not imported, while its registration, installed code and saved data remain. Other compatible packs continue to work. A breaking host upgrade restarts the app and drains worker requests through normal service replacement; it does not preserve old UI instances or migrate stored data automatically.

Legacy packs using sdkVersion need a one-time manifest change to apiEpoch: 1, followed by Rebuild and Apply. Compatible installed artifacts continue working if their source folder is moved or unavailable. The CC installation supplies SDK updates; there is no separate network SDK updater.

System STRAG receives one explicitly host-wired read-only diagnostics reader. Private pack visibility is separate from system provenance; folders cannot grant themselves platform dependencies.
