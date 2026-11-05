# ADR-022: Agent pack control and installation-driven host effects

Date: 2026-11-05

Status: Accepted

Affects: REQ-PK-006, REQ-PK-007, REQ-PK-008, REQ-PK-014

## Context

The loopback service already owns pack management, but native UI handlers cancel and relaunch views around their own requests. External callers bypass that behavior. The bridge also consults the mutable catalog when dispatching an existing document's requests. Adding a CLI without fixing these boundaries can mix old views with new worker contracts.

## Decision

Keep one management API and add thin JSON CLI commands for list, show, add, build, apply and remove. Apply carries the exact candidate revision. Validation refuses a stale candidate before closing admission; activation retains its captured immutable revision even if another source build finishes while it drains. Calls do not automatically retry after a lost response. Omit saved-data purge from the agent CLI.

Treat the successfully published installation as authoritative state. A native lifecycle reducer derives retire/relaunch effects from an invocation's pinned identity and the published catalog. UI handlers submit commands without lifecycle decisions. The existing two-second catalog refresh supplies external changes; no event log, subscription protocol, cross-process UI acknowledgment or new server is introduced. API success means backend activation, and the native host converges afterward.

Pin operation declarations and routing revisions at invocation creation. Old calls keep the old revision during the observation interval and are rejected by the service after code replacement. A changed own-function revision relaunches the bare mnemonic; removal, identity reassignment or incompatibility cancels. Unchanged own code, unrelated pack changes and failed activation preserve the current view and draft. Explicit function launches supersede reconciliation while reading the latest catalog.

## Consequences

Humans and agents share activation semantics. Failed Apply preserves the current draft. A short observation delay is acceptable; callers can inspect committed state without pretending every UI instance has acknowledged it. Trusted local clients retain the existing credential model. Function authoring gains no new HTTP layer or framework API.
