# Function navigation and retained screens

## User story

As the operator, I need one predictable Back action that returns to the previous screen with my UI context intact while application data may refresh.

## Requirements

### REQ-NV-001: Declare typed destinations

THE SYSTEM SHALL let a function declare a root view and named child screens with validated navigation parameters. THE SYSTEM SHALL reject unknown screen names and incompatible parameters through typed author APIs and runtime checks. Direct invocation of a detail destination SHALL establish that destination as the root without fabricating earlier history.

**Rationale:** Authors declare destinations without implementing a navigation engine.

---

### REQ-NV-002: Bound navigation history

THE SYSTEM SHALL provide invocation-local push and replace requests, with the function choosing the navigation intent. Push SHALL retain the parent and add a unique entry; replace SHALL retire the current entry and install its replacement. THE SYSTEM SHALL permit at most four entries including the root. A push exceeding the limit SHALL preserve the current stack and expose a development contract diagnostic or a visible production explanation with a diagnostic record.

**Rationale:** Back has a bounded, observable history without silently evicting useful state.

---

### REQ-NV-003: Provide one Back behavior

THE SYSTEM SHALL provide a consistent Back control and Command-[ shortcut, pop exactly one non-root entry, retire that child and reveal the parent. At the root, Back SHALL be disabled and SHALL NOT cancel the function. Back SHALL remain available while a child loads or fails. Function authors SHALL NOT implement or override the Back sequence.

**Rationale:** The same action has the same meaning in every function.

---

### REQ-NV-004: Retain ordinary React state

WHILE an entry is covered, THE SYSTEM SHALL retain its React and DOM state and suspend its Effect lifecycles through the shared retention mechanism. On reveal, THE SYSTEM SHALL restore that retained screen rather than reconstruct author state. THE SYSTEM SHALL permit ordinary React state and controls without a mandatory restoration store or save hook. Popping SHALL retire the popped entry; cancelling or executing another command SHALL discard the whole invocation and stack.

**Rationale:** Filters and drafts survive in-function navigation without a second state model.

---

### REQ-NV-005: Restore the operator's place

THE SYSTEM SHALL own one primary scroll viewport per entry. Functions MAY mark stable list items with the shared data-nav-item convention; the framework SHALL capture the originating focus control and item ordering from that viewport. Before covering an entry, THE SYSTEM SHALL record its primary scroll position, available stable item anchor and viewport offset, and focused return target. On reveal, THE SYSTEM SHALL restore the visual position and choose the focus target or the next surviving item in recorded ordering, then the previous surviving item, then the entry's initial focus destination. While command focus owns input, function focus restoration SHALL be deferred under REQ-NV-007 while the visible position is restored. Anchor fallback SHALL produce a brief inline explanation. THE SYSTEM SHALL correct position on reveal and query-result commits until the first subsequent user scroll, key or pointer interaction in that entry, after which correction SHALL stop. The Back-initiating event and programmatic restoration SHALL NOT count as subsequent user intent. Nested or virtualized scroll surfaces, media resizing and arbitrary layout animation SHALL NOT require continuous position correction; without a stable item the primary offset and initial focus provide the fallback.

**Rationale:** Refreshing or removing a row must not unexpectedly move the operator away from their work.

---

### REQ-NV-006: Keep entry authority local

THE SYSTEM SHALL give each entry unique UI authority and refuse late focus, navigation, source-opening and new mutation effects from covered, loading, initialization-failed or retired entries. Only the active interactive entry SHALL admit application navigation, source opening and new mutations; framework Back, Escape and permitted resolver/query reads SHALL remain available through loading/failure. Shared query work and already-admitted mutations MAY complete independently of the originating entry; their results SHALL NOT restore that entry or claim its input. Application queries SHALL NOT gate mounting or readiness of the initial interaction surface. A background query refresh failure with retained content SHALL NOT change entry readiness.

**Rationale:** An old screen cannot take over the active screen after an asynchronous result.

---

### REQ-NV-007: Preserve native focus and handoff

The framework SHALL serialize native entry admission before mounting the child or covering the parent, establish entry identity, and gate parent events during the handover. It SHALL distinguish prepared from interactive: prepared requires synchronous screen preparation, a committed View and exactly one usable initial interaction destination in that entry; interactive additionally requires native input handoff completion. Internal pushes SHALL use the native limited text/Tab capture and submission-refusal rules after native admission while loading. Back SHALL discard the departing entry's pending input. WHEN command focus owns input, Back SHALL preserve command text/focus and defer restored function focus until the operator resumes the function. A pointer Back action SHALL explicitly resume function input. Background revalidation SHALL NOT reset readiness or reapply initial focus.

**Rationale:** Back must compose with the established native keyboard and Escape behavior.

---

### REQ-NV-008: Expose bounded retention diagnostics

THE SYSTEM SHALL expose bounded diagnostic metadata for entry identity, screen name, depth, visibility, lifetime and transition timing, with retained entry/query and response-size indicators. Diagnostics SHALL NOT retain application payloads, DOM nodes or screen callbacks. THE SYSTEM SHALL distinguish these indicators from exact per-screen heap ownership or immediate process-memory reclamation.

**Rationale:** Retention can be measured without creating another retention source.

---

### REQ-NV-009: Exercise navigation under failure and repetition

THE SYSTEM SHALL provide isolated conformance coverage for child loading/failure, ceiling refusal, retained local state, anchor fallback, command-focus Back, late replies, effect cleanup and repeated push/pop/cancel cycles. Verification SHALL use actual WebKit for focus/scroll behavior and SHALL distinguish object ownership checks from heap/process measurements.

**Rationale:** Lifecycle errors should be reproducible without private application records.

---

### REQ-NV-010: Browse a stable collection sequence

WHEN a function opens a registered detail screen from an ordered collection, THE SYSTEM SHALL support a validated snapshot of unique item keys and destination parameters with one selected key. THE SYSTEM SHALL preserve that order and membership for the resulting sequence while obtaining current record data through normal application queries. THE SYSTEM SHALL bound the sequence to 200 displayed items and 64 KiB of plain serialized descriptor data. Record mutations, query invalidation and owner insertions SHALL NOT rewrite that sequence. Opening from the list again SHALL create a new sequence. Direct detail launches SHALL NOT invent a collection context.

**Rationale:** An operator can inspect the results they chose without moving neighbors or another application-data store.

---

### REQ-NV-011: Replace detail when moving between siblings

WHEN the operator moves to an adjacent sequence item, THE SYSTEM SHALL replace the current detail entry at the same stack depth, retire its UI state and resolve a fresh detail screen at its initial scroll position and focus destination. THE SYSTEM SHALL retain only the sequence descriptors and current index, without per-item scroll, drafts or component-state restoration. Framework Back SHALL return to the retained parent list and its original return position. THE SYSTEM SHALL disable movement beyond either end without wrapping, fetching further pages or automatically skipping an unavailable item. A failed sibling load SHALL preserve framework Back availability.

**Rationale:** Adjacent record browsing reuses replacement rather than creating a second history or reconstruction system.

---

### REQ-NV-012: Provide consistent sibling controls and shortcuts

THE SYSTEM SHALL provide framework Previous/Next controls and a position within the loaded sequence. Command-Option-Up and Command-Option-Down SHALL request the previous and next item while function input is interactive and focus is outside editable controls. These shortcuts SHALL preserve ordinary command-field and editable-control behavior. Controls SHALL be unavailable during loading, failure or command focus. Repeated key events and additional movement while a transition is pending SHALL NOT queue more transitions. Covered or retired entries SHALL NOT change the active sequence. Ordinary push or replace outside sequence movement SHALL NOT inherit a sequence implicitly.

**Rationale:** Keyboard browsing is predictable without stealing editing keys or introducing an input queue.
