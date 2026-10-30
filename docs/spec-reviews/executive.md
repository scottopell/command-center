# Specification review — Executive summary

## Scope

The initial two adversarial review rounds and one post-simplification pass are author-run reviews. They are not represented as independent reviewers or as executed product tests. Round evidence records concrete findings, fixes and user-dependent changes. Those reviews preceded application implementation. A later independent review of retained navigation and query integration is recorded separately.

## Review status

| Round | Focus | Evidence |
| --- | --- | --- |
| 1 | Cross-feature contradictions and complexity cliffs | [Round one](round-1.md) |
| 2 | Re-read revised artifacts; attack lifecycle, data and input boundary sequences | [Round two](round-2.md) |
| 3 | One adversarial pass after the approved input and unload simplifications | [Post-simplification pass](round-3.md) |
| Navigation/query | Independent lifecycle/data consistency and complexity review before implementation | [Retained navigation](retained-navigation.md) |
| Selection/siblings | Author-run consistency and complexity pass before implementation | [Selection and sibling browsing](selection-and-siblings.md) |

## Validation status

Markdown identity/link/status validation and Allium structural/process analysis are recorded in [validation evidence](../../verification/specs/validation.json). Structural success is not proof of behavioral completeness, latency, browser input fidelity, or memory reclamation. Proposed ADRs remain explicit gates rather than accepted implementation decisions.

## User decisions after review

The user approved limited loading-time editing and submission only after readiness. [ADR-004](../../specs/adrs/004_loading-input-fidelity.md) is Accepted. REQ-SH-009 is retained as deprecated history and replaced by REQ-SH-013; requirements, the lifecycle model and acceptance journeys reflect the narrower behavior. Input transfer mechanics have since been implemented and verified under WebKit; see the repository verification evidence.

The user explicitly approved removing useUnload and temporary exit-data preservation. [ADR-005](../../specs/adrs/005_bounded-unload.md) is Accepted; REQ-FF-004 and REQ-FF-005 are retained only as deprecated history. The active framework has no custom unload callback, exit snapshot store, cross-invocation restoration API, late-save gate or preservation grace period. Standard React cleanup and native host disposal remain.

The Escape clarification is recorded in [ADR-008](../../specs/adrs/008_focus-dependent-cancel.md): outside the command bar, Escape only returns focus; Escape in the command bar cancels. Initialization and drain cannot steal explicit command focus. Historical review scenarios that equated every Escape with cancellation are superseded by the current requirements and acceptance journeys.

[ADR-009](../../specs/adrs/009_worker-store-and-retry-boundaries.md) separates the worker-facing scoped KV context from its private storage engine and clarifies REQ-BW-009 as a client/platform request retry rule. Deliberate safe internal steps are not prohibited. Current validation covers the updated models; these clarifications are not represented as another independent adversarial round or as runtime experiments.
