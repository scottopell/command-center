# Function authoring framework

## User story

As a function author, I need a narrow lifecycle contract and ordinary web controls so that I can implement useful functions without rebuilding input routing or rendering infrastructure.

## Requirements

### REQ-FF-001: Define a function with a narrow contract

THE SYSTEM SHALL let an author register a mnemonic, title, asynchronous tail resolver, and view whose props are inferred from the resolver result.
THE SYSTEM SHALL reject incompatible resolver-to-view prop types during type checking.
THE SYSTEM SHALL support registered child screen definitions and typed navigation while preserving a single-root form for functions without child screens.

**Rationale:** An author should define application behavior without duplicating data types or a shell protocol.

---

### REQ-FF-002: Resolve the initial view before presenting it

WHEN a function is invoked, THE SYSTEM SHALL provide its tail and cancellation signal to the resolver, await its result, and pass that result to a fresh view.
THE SYSTEM SHALL require the resolver to prepare navigation and initial data without performing application mutations.
Required initial reads SHALL use the shared invocation query integration; unresolved required data SHALL keep that entry in loading rather than admit its resolved focus target prematurely.

**Rationale:** The initial screen must agree with the command, while navigation alone must not submit work.

---

### REQ-FF-003: Declare initial focus without a readiness callback

THE SYSTEM SHALL let a view declare one initial focus destination, including a focusable content container for a read-only view.
WHEN the resolved view first commits, THE SYSTEM SHALL validate that destination and establish initial focus and initiate input handoff automatically only while the invocation owns function input.
WHILE the operator has returned focus to the command bar, THE SYSTEM SHALL keep that focus and defer function input handoff until the operator returns to the function.
THE SYSTEM SHALL report absent, ambiguous, detached, disabled, or hidden initial focus destinations as contract errors.
The validation scope SHALL be the active entry; covered entries' retained focus markers SHALL NOT create competing destinations.

**Rationale:** Authors get consistent handoff without manually coordinating ready callbacks.

---

### REQ-FF-006: Keep invocation data from escaping its lifetime

THE SYSTEM SHALL reject function-source patterns that retain mutable invocation state at module or global scope.
THE SYSTEM SHALL make resolver output, view state, and view callbacks invocation-owned and release framework references when the view is disposed.
WHEN an invocation retires, THE SYSTEM SHALL unmount its view and dispose platform-owned resources without requesting a function-provided exit snapshot, running a custom unload hook, or preserving drafts for a later invocation.
Retention of covered entries SHALL remain inside that invocation; popping an entry SHALL release its framework-owned UI references.
THE SYSTEM SHALL expose retained-instance diagnostics during conformance testing.

**Rationale:** Authors need guardrails against accidental large-data retention across launches.

---

### REQ-FF-007: Use ordinary application controls

THE SYSTEM SHALL permit function authors to render ordinary web forms and application components without a platform-specific form model.
WHILE a function is interactive, THE SYSTEM SHALL preserve ordinary editing, selection, and focus navigation except for the command-center’s Escape behavior.
THE SYSTEM SHALL establish initial focus once rather than steal focus on later data refreshes.
THE SYSTEM SHALL support the loading-time type-ahead path through ordinary text inputs and textareas with stable forward Tab order, without requiring loading-time rich-editor or arbitrary selection replay.

**Rationale:** The framework must stay small and avoid reimplementing the web UI framework or editor.

---

### REQ-FF-008: Share validated worker clients

THE SYSTEM SHALL provide function views with typed access to registered Function Worker operations.
The supported application-data API SHALL be the shared query/mutation integration, including cached resolver reads; raw transport SHALL remain internal to that integration.
THE SYSTEM SHALL keep backend credentials and persistence handles outside disposable view state.
WHEN an invocation retires, THE SYSTEM SHALL refuse new worker calls through that invocation's bridge while leaving already admitted worker operations independent of retirement.
WHILE initial input handoff is incomplete, THE SYSTEM SHALL reject mutating worker calls from that UI invocation before worker admission while permitting the read operations needed by its resolver.

**Rationale:** UI and agent paths should agree without exposing storage internals to the view.

**Dependencies:** REQ-BW-011 defines cross-entry-point consistency without requiring identical client call paths.

---

### REQ-FF-009: Exercise the lifecycle with SLOW

THE SYSTEM SHALL provide a SLOW conformance function with controllable asynchronous resolution delay, initialization failure, and ordinary title/body form fields.
THE SYSTEM SHALL exercise cancellation, rapid relaunch, delayed results, input ordering, and initial focus against the function contract.

**Rationale:** A deliberately delayed function makes race conditions reproducible before real applications depend on the framework.

### REQ-FF-010: Enforce supported application-data access

THE SYSTEM SHALL block direct application-data connections and external resource loading from bundled function documents through host-supplied browser policy and native navigation guards.
THE SYSTEM SHALL keep the authenticated native bridge available to the registered query/mutation integration and preserve explicit human source opening as a separate capability.
THE SYSTEM SHALL report policy violations as development diagnostics without claiming a comprehensive sandbox for arbitrary third-party code.

**Rationale:** A uniform data path must be enforced beyond author convention without adding another credential or network proxy API.

### REQ-FF-011: Compose functions at build time

THE SYSTEM SHALL build the public application independently from its public source checkout.
WHEN an explicit local extension checkout is supplied at build time, THE SYSTEM SHALL compose its function views, worker contracts, workers, command metadata, and permitted local source origins into the same application.
THE SYSTEM SHALL preserve schema-derived client types and runtime validation for composed operations, reject duplicate command identifiers, and apply function-source guards to composed views.
THE SYSTEM SHALL NOT discover sibling repositories implicitly or require private source for a public build.

**Rationale:** Private functions need the same framework guarantees without putting their implementation or application contracts into a public repository.

### REQ-FF-012: Verify a clean local build

THE SYSTEM SHALL document a clean-checkout setup using locked application dependencies and declared toolchain versions, with actionable diagnostics for missing or incompatible build tools.
THE SYSTEM SHALL provide one verification command covering source checks, the native build, packaged worker and CLI operation, persistence across worker restart, and native conformance without installing a real service or using live application data.
Optional specification-analysis tooling SHALL NOT be required to build or run the application.

**Rationale:** A new Mac should not depend on undocumented tools, caches, login-shell settings, or private source checkouts.

## Deprecated requirements

These records retain permanent IDs and their original text. They are historical obligations and are not part of the active contract.

### REQ-FF-004: Request per-invocation unload cleanup

**DEPRECATED:** Removed by [ADR-005](../adrs/005_bounded-unload.md). No initial function needs saved exit data. Ordinary view cleanup and disposal are covered by REQ-FF-006 and REQ-SH-011. The original obligation below is retained as history, not an active contract.

THE SYSTEM SHALL provide an optional unload hook registered by a mounted view and invoke the latest registered callback once when that invocation retires.
THE SYSTEM SHALL run ordinary view cleanup independently and SHALL NOT treat development-only effect cleanup as invocation retirement.

**Rationale:** An author can preserve temporary data without module-level draft variables or duplicate saves.

---

### REQ-FF-005: Bound temporary preservation

**DEPRECATED:** Removed by [ADR-005](../adrs/005_bounded-unload.md). There is no temporary exit-data store or preservation grace period. The original obligation below is retained as history, not an active contract.

WHEN unload cleanup runs, THE SYSTEM SHALL allow only a finite cleanup window and SHALL NOT wait for it before returning input ownership to the shell.
THE SYSTEM SHALL reject temporary saves arriving after that invocation’s cleanup window closes and SHALL NOT restore saved data automatically.
IF cleanup fails, THE SYSTEM SHALL complete retirement and expose a diagnostic.

**Rationale:** Optional draft preservation must never trap the operator or become an implicit durable-work guarantee.
