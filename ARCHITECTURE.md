# Implementation boundaries

| Lifetime | Owner | Contents |
| --- | --- | --- |
| Application/window | AppKit `Shell` | Command field, suggestions, function area, native states and input capture. |
| One command invocation | `Invocation` + disposable `WKWebView` | Generation identity, pending text segments, resolver result, React root and View state. |
| One navigation entry | React Activity + framework viewport | Ordinary retained React/DOM state, entry authority, scroll anchor and return focus. |
| One invocation query client | TanStack Query | Registered read cache, mutation invalidation and stable entry-owned attempt handles. |
| Per-user service | launchd + Node | One loopback HTTP listener, built-in worker registry and persistent scoped store. |
| Application data | SQLite private to service | Function namespaces, DRQS records/history/counter/identity. |

The native shell admits a command and focuses its native text-input client before constructing WebKit. A named loading destination is flushed immediately. Resolution reads through a native-authenticated proxy, renders the resolved route, and validates its first focus destination. Native segments are applied in order through ordinary inputs and Tab order. Text arriving during a batch remains pending for another batch. One cutover enables ordinary browser input and mutating bridge calls; the command's Return is never replayed. Preedit composition delays cutover until committed.

Escape uses focus at keypress admission. Outside command, it pauses function input and moves command focus; initialization may finish without stealing focus. Escape in command revokes the generation, discards pending input, detaches the handler/view and shows empty immediately. Every asynchronous native callback checks generation/object authority. Disposing a WebView does not cancel already-admitted worker requests. No worker holds view references.

The worker transport validates the envelope, looks up registry-owned operation metadata, validates input, invokes one application handler with its namespace-bound KV, and validates output. Related facts use a serialized SQLite transaction. Missing responses and failures after known commits cannot imply rollback or cause automatic retries.

Optional workers can call fixed local owner APIs with finite request/response bounds. Existing owners retain their canonical state and domain rules. Registry mutation metadata flows to native transport error classification. Source opening is a narrow human-action capability; navigation remains inside bundled documents and only their main frame can use the native bridge.

This is trusted built-in function code, not an untrusted plugin sandbox. The source guard and disposable document address accidental retention; they do not promise process-per-function allocation, fixed RSS reclamation timing or third-party dependency correctness. Native diagnostics retain bounded timing metadata only and report attached view ownership. No warm host pool is needed by current measurements.

The local Node launcher intentionally uses the installed toolchain. Signing, notarization, runtime redistribution, remote APIs, synchronization, multiple windows, service controls, job scheduling and socket activation are outside this build.

Child transitions require synchronous native admission before the framework covers a parent or starts resolution. Only one entry owns actions/input; shared read descriptors remain invocation-scoped. Activity retains hidden screens while suspending Effects. Back reveals cached content, restores the primary viewport and revalidates stale queries. Successful writes invalidate the whole invocation cache; no app-specific record patching or reconstruction state store is supplied. The four-entry ceiling bounds retained screens, not historical query variants. gcTime is infinite for the invocation; cancellation clears the client. Finite response sizes and diagnostic query counts make growth observable without promising a total heap cap.

Unknown mutation handles remain blocked through refresh and Activity suspension. A new invocation is new intent, with no deduplication guarantee or completion barrier for older admitted work. Narrow owner commands determine concurrency semantics. Browser resource policy blocks direct application-data connections; explicit validated human source opening remains available.

Sibling traversal adds only a bounded descriptor snapshot and current index to an entry. The same native admission/replace path retires the detail and loads the adjacent destination. Sequence metadata does not contain records or callbacks and does not change when query data refreshes. Native controls receive index/count only; keyboard handling stays in the document to preserve editable-control behavior. Completed user selection similarly crosses a current-entry native UI capability into the clipboard, without a worker operation or clipboard history.
