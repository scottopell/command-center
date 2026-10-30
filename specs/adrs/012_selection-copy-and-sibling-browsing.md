# ADR-012: Selection copying and stable sibling replacement

Date: 2026-10-30

Status: Accepted

Affects: REQ-SH-016, REQ-NV-010, REQ-NV-011, REQ-NV-012

## Context

The operator wants selected display text copied automatically and keyboard traversal through task details. A detail ID alone loses the originating list's membership and ordering. Live ordering, visited-view retention and per-record restoration would add concerns beyond the existing entry stack.

## Decision

Copy plain text after a completed user selection in the active function. Exclude editable controls and the command bar, as confirmed by the operator. Native code owns the clipboard; no browser permission, worker operation, clipboard history or function-author clipboard API is added. Ignore empty and purely programmatic selections; cap text at 2 MiB. Native Select All forwards its explicit intent through the window responder; editable actions remain native, and read-only selection is scoped to the active viewport.

A function may push a registered screen with a bounded sequence of unique keys and schema-validated plain parameter objects plus a selected key. The framework clones these descriptors. The function supplies the exact displayed owner order. Sequence identity and order are stable, but each fresh detail resolution reads current data. Previous/Next replace the current entry; Back returns to the original retained parent and return position. A new ordinary push/replace starts without sequence context unless explicitly supplied. No per-record scroll or state restoration is added.

Framework native controls show Previous, Next and position among loaded items. Command-Option-Up/Down are handled in the function document so editable controls retain ordinary key behavior; native menu actions have no competing key equivalent. Movement is interactive-only, refuses key repeat and is never queued. Sequence controls are absent without collection context and disabled at bounds/loading/error/command focus. Missing items produce normal initialization failure with Back available, without automatic skip. At most 200 descriptors/64 KiB are admitted; no paging is introduced.

## Alternatives and consequences

- Live sibling membership needs rules for moving neighbors, current-item removal and paging. Stable displayed IDs avoid this subsystem while records remain fresh.
- Pushing every sibling consumes stack depth and changes Back into record history. Replacement preserves the intended list/detail relationship.
- Saving even per-record scroll adds restoration metadata and content-change semantics. The operator chose fresh detail screens; previously visited detail UI is discarded.
- Copying every selection can overwrite text selected for replacement before Paste. Excluding editables preserves that workflow.
- Listening to every selection change can overwrite the clipboard during intermediate or programmatic changes. Copy on completed selection gestures instead.

Admitted writes remain independent of replaced views. Unknown handles do not transfer to a new entry; a fresh entry remains a new intent under REQ-QL-006. No completion barrier, idempotency protocol or unsaved-edit manager is introduced. Functions opt in when their journeys are specified.
