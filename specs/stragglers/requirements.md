# Transition diagnostics and STRAG

## User story

As an operator, I need to identify slow screen transitions and inspect their context without interrupting the function or recording my drafts.

## Requirements

### REQ-ST-001: Measure a framework-owned responsiveness checkpoint

THE SYSTEM SHALL measure native monotonic elapsed time from acceptance of launch, push, replace, sibling movement or Back to receipt of the active transition's responsiveness checkpoint. The checkpoint SHALL follow destination commit, real initial interaction-surface validation, an animation-frame callback and separately queued page task. It SHALL NOT await application queries, input-buffer drainage, IME completion or actual native focus ownership. Superseded acknowledgements SHALL NOT complete another transition. A hidden destination MAY await resumed rendering before acknowledging readiness; a timer SHALL NOT substitute for the animation-frame callback. Exact compositor presentation SHALL NOT be claimed.

**Rationale:** Slow transitions must be distinguished from data loading and operator behavior.

### REQ-ST-002: Detect stragglers without canceling

WHEN an eligible transition exceeds 500 milliseconds without a successful checkpoint, THE SYSTEM SHALL record one straggler and show a transient non-blocking Straggler detected notice while continuing the transition and buffered-input capture. A transition SHALL start eligible only while CommandCenter is active and its window is at least partially unoccluded. Losing either condition before detection SHALL permanently exclude that transition from the SLO, without pausing or restarting its clock. A straggler already detected SHALL retain its classification when visibility changes. Completion, failure or cancellation SHALL update that same transition record. Excluded transitions SHALL retain their raw elapsed time and explicit eligibility in diagnostic history.

**Rationale:** Performance diagnostics must not make a slow application unusable.

### REQ-ST-003: Persist bounded diagnostic evidence

THE SYSTEM SHALL record bounded local transition summaries and richer straggler context independently of STRAG's lifetime or worker availability, without blocking the transition on persistence. Evidence SHALL include transition kind, mnemonic, pack/function/build identities, submitted command, phase timings, worker operation names and durations when available, final outcome and basic host context. Buffered typing, clipboard contents, credentials and worker payloads SHALL NOT be recorded. History SHALL retain at most 30 days and 10000 transition records, with bounded evidence per record.

**Rationale:** A week's stragglers need a denominator and useful investigation context rather than exact replay.

### REQ-ST-004: Inspect history through a normal function

THE SYSTEM SHALL provide STRAG as an ordinary read-only function with time/function filtering, transition detail, and summary counts, using the standard framework and worker contracts. SLO summary counts and per-function maxima SHALL include eligible transitions only; excluded transitions SHALL be counted separately and inspectable without being labeled within budget. Historical records without eligibility SHALL retain their original classification. THE SYSTEM SHALL provide CLI history access as a recovery option. Diagnostic collection SHALL NOT depend on opening STRAG.

**Rationale:** The framework should serve its own useful management views.
