# Selection and sibling browsing — consistency and complexity review

Date: 2026-10-30

Scope: one author-run adversarial specification pass before implementation. This is not an independent-agent review or runtime test result.

## Consistency findings

| Attack | Resolution |
| --- | --- |
| Clipboard selection from a covered document arrives after replacement | Require both generation and entry authority natively; check active interactive viewport when sampling the completed gesture. |
| Selecting a field before Paste overwrites the intended clipboard | User explicitly selected non-editable display text only; exclude command, inputs, textareas and contenteditable. |
| Native key equivalents swallow ordinary editing before the web view can decide | Handle sibling keyboard shortcuts in the document; native menu actions have no conflicting key equivalent. |
| Hidden list refresh changes neighbors or includes unseen pages | Clone bounded displayed descriptors at initial open; query cache remains authoritative for records, not traversal order. |
| Previous is interpreted as retained Back | Sibling movement is replacement, discarding old detail UI state; Back alone reveals the retained list at its original position. |
| Repeated keydown becomes several asynchronous replacements | Refuse repeats and gate the transition before native admission; no queue. |
| A generic replace or new child accidentally inherits collection context | Only the explicit sequence open and internal sibling step carry it. |
| Pending/uncertain write is treated as cancelled or safe to retry after movement | Existing admitted-write and new-entry intent rules remain explicit; no new replay or completion barrier. |

## Complexity cliffs

### Live collection traversal — removed

1. Requirement: Next reflects the latest list membership/order.
2. Apparent cost: look up a neighbor in the current query result.
3. Hidden cost: current-item removal, insertions between keypresses, missing rows and future page boundaries need cursor rules.
4. Architectural consequence: a live collection/cursor reconciliation layer.
5. Maintenance cost: each owner sorting/filtering/pagination rule affects navigation.
6. Adopted alternative: bounded displayed descriptor snapshot with fresh per-record reads. No owner sorting implementation is duplicated.

### Per-record UI restoration — removed

1. Requirement: Previous restores earlier detail scroll/drafts/state.
2. Apparent cost: save one scroll number.
3. Hidden cost: offsets after data changes, anchor matching, state ownership and visited-record lifetime.
4. Architectural consequence: a restoration index or a second retained-view cache beside the entry stack.
5. Maintenance cost: every detail editor introduces preservation and memory decisions.
6. Adopted alternative: use ordinary replace, start at initial position and preserve only sequence descriptors/index. User explicitly accepted this simplification.

### Selection as a stream or clipboard history — excluded

1. Requirement: mirror every selection change or preserve clipboard history.
2. Apparent cost: one selectionchange listener.
3. Hidden cost: intermediate selections, programmatic restoration, editing and copied-content retention become visible behavior.
4. Architectural consequence: gesture/history state and potentially persistent sensitive text.
5. Maintenance cost: broad input-method/widget coverage and clipboard synchronization.
6. Adopted alternative: sample completed pointer/keyboard selection only, scope to non-editable active display text, write native plain text once per completion, retain no history.

## Disposition

No unresolved specification blocker. Buttons and Cmd-Option-Up/Down share one framework movement operation; keyboard editing remains in the document. Missing items fail normally with Back available. Limits are 200 descriptors/64 KiB and 2 MiB copy text. No upstream owner or store change is needed. Verification must exercise actual WebKit selection/key behavior, late bridge messages, stable order under changed fixture data, fresh detail reads, replacement depth, retained Back, bounds and failed loads.

## Runtime follow-through

Completed gestures are sampled directly, without an animation-frame or timer dependency that can stall in occluded WebKit views. Native Select All preserves the ordinary editable action and forwards explicit intent to select/copy the active read-only viewport. This adds no text-editing model. Unrelated clicks do not re-copy an unchanged earlier highlight; deliberate reselection does. Gesture comparison retains only weak node references and offsets until completion/cancellation, never a clipboard history.
