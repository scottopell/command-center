# Implementation boundaries

| Lifetime | Owner | Contents |
| --- | --- | --- |
| Application/window | AppKit Shell | Command field, autocomplete, native loading/input authority and management sheet |
| One command invocation | Invocation + disposable WebView | Identity, pending text, React root, retained navigation entries and query client |
| One navigation entry | React Activity + framework viewport | Ordinary React/DOM state, scroll anchor, return focus and sibling descriptor sequence |
| Local pack installation | Platform PackManager | Source registration, controlled snapshot/build, candidate and active revision |
| Per-user listener | launchd + Node supervisor | Authenticated RPC, management admission gate, installed catalog and one shared worker process |
| Worker runtime generation | Shared Node child | Validated operation handlers and SQLite connection; replaced only after admitted work drains |
| Function data | Platform SQLite | Stable pack/function namespaces, independent of mnemonic, path and UI lifetime |
| Transition history | Native collector | Bounded local diagnostic records; system STRAG is a read-only consumer |

The shell captures text immediately on command admission, before constructing WebKit. Each function loads its own prebuilt local frontend, with the platform-controlled React/framework runtime. The source checkout is not an execution location. Browser policy rejects remote resource/data connections, external document navigation and subframe bridge calls. Explicit human source opening remains a separate validated native capability.

Command preparation synchronously parses syntax into view props. Screens mount their stable initial interaction surface without awaiting application data. Query hooks expose pending/error/data states while preserving drafts and controls. SDK types derive from the function's local operation contract, not a global compiled list of installed functions. Read/write classification and validation remain authoritative at worker dispatch.

Readiness follows the committed destination, validated focus surface and a queued responsiveness acknowledgment. A rendering callback is preferred; occluded/throttled WebKit uses a tagged fallback. Native monotonic timing stops on the matching transition's acknowledgment, independently of input ownership, composition and buffer drainage. Over 500 ms records a straggler and transient notice, never a forced cancellation. Native loading feedback, framework readiness, actual input activation and compositor presentation are distinct measurements.

Input handoff applies native text segments through ordinary input/textarea controls and forward Tab order. New text during a batch stays pending. One cutover enables ordinary browser input and UI mutations. IME preedit delays this cutover but not the readiness metric. Escape outside command returns command focus without canceling; Escape in command retires the invocation immediately. Callback and transition identity checks reject obsolete deliveries. No unload hook or cross-invocation draft preservation exists.

Back retains covered React trees through Activity while suspending Effects. Revealed query observers show cached content and revalidate; broad invalidation follows successful writes. The framework restores the primary viewport anchor and focus until subsequent user intent. Four retained entries bound navigation depth; inactive query data stays cached for the invocation. Previous/Next replaces details using a bounded original sequence, without restoring earlier sibling drafts or scroll positions.

Packs are trusted local JavaScript/TypeScript, using one SDK/protocol and pinned runtime/compiler versions. Manifest identities and mnemonics cannot collide. The builder rejects source escapes, symlinks, unsupported native add-ons and arbitrary build hooks; targeted source checks are guardrails rather than whole-program purity or a hostile-code sandbox. Dependencies and assets must be available in the completed artifact. Owner services can remain external.

Source changes build automatically and activate only through explicit Apply. Activation freezes one candidate, stops new application admissions, waits for handler promises even after client disconnect, and restarts the shared runtime. A drain deadline postpones the update rather than killing work. The exact candidate installation must report ready before its catalog is published. Pre-admission fallback restores prior code; no application-data rollback or automatic schema migration is promised. An affected open function restarts with its bare mnemonic; unrelated views remain mounted. Revision-bound UI requests cannot silently execute against a replacement worker contract.

STRAG uses normal queries, navigation and worker dispatch. Only its system worker is explicitly constructed with the platform diagnostics reader. Private visibility does not grant system provenance. Collection does not depend on workers: a bounded native utility queue writes per-transition files with atomic replacement and retention limits. The CLI can read the same history contract without a running service. Buffered typing, credentials, clipboard contents and worker payloads are excluded.

The Node launcher uses the local pinned installation. Signing/notarization, redistributed runtimes, managed Git/ZIP acquisition, per-pack processes, live state migration, prewarming and bytecode preparation are deferred. The public host never discovers private sibling repositories implicitly.
