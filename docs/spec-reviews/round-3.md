# Post-simplification adversarial pass

## Review basis

One author-run adversarial pass after the user approved limited loading-time editing, readiness-gated submission, and removal of useUnload. Review inputs were the simplified five-feature requirements, current Allium models, ADRs and conformance journeys. Historical rounds remain evidence of earlier drafts, not active contracts. No independent reviewer or runtime verification is claimed.

## Findings and fixes

| Finding | Hidden cost or counterexample | Simplification / resolution |
| --- | --- | --- |
| R3-01: unload machinery survived in adjacent artifacts | Removing a hook name alone leaves callback capture, deadlines, snapshot storage, late-save gates and restoration tests. | Remove the contract and all active preservation machinery together. Normal React cleanup and native disposal remain. ADR-005 accepts the removal; REQ-FF-004 and REQ-FF-005 are deprecated, not repurposed. |
| R3-02: deprecated promises obscure the small contract | An author reading the requirements can accidentally implement the retained old SHALL clauses. | Move retired requirements into explicit historical appendices. Keep permanent IDs and N/A status rows; exclude retired IDs from normative model and acceptance references. |
| R3-03: the formal input history looks like an implementation prescription | Implementing an event object, replay notification and queue entry for every character recreates a general keyboard replay system. | Treat those records as abstract history. Permit compact pending text segments and accumulated Backspace edits. Preserve final text, forward field boundaries and the single handoff cutover; do not require one browser notification per key. Actual transfer still needs a prototype. |
| R3-04: forward Tab can reach a select or leave the view | A generic replay engine might skip controls, add a private focus registry or type into shell controls. | Explicitly stop with an unsupported-destination error. The initial supported path is ordinary text controls, including DRQS Title then Body. No custom tab-order engine is required. |
| R3-05: early submission was described only as keyboard input | A button click or first-render effect could mutate through the bridge while the view is mounting or draining. | Gate UI-originated mutating worker calls on active identity and interactive phase. Resolver reads are allowed. Independent CLI calls and already-admitted worker operations remain independent of UI lifetime. No queued actions or new cancellation protocol is added. |
| R3-06: caller-controlled read/mutation classification | A request payload claiming read-only could undermine transaction behavior or the UI mutation gate. | Treat operation classification as registry metadata, alongside schema/operation lookup, never a client assertion. |
| R3-07: an invented second latency threshold became an open gate | Requiring another user-approved input-capture millisecond number adds ambiguity beyond the agreed visual SLO and continuous capture ownership. | Keep the 500 ms visual requirement, continuous capture and recorded benchmark profile. Remove the invented additional threshold. Do not relax the SLO to an average or percentile. |
| R3-08: runtime disposal could grow into a host pool or process manager | Removing preservation does not justify arbitrary warm-host lifecycles, process-per-function isolation or immediate RSS guarantees. | Start with the simplest runtime experiment; introduce at most one unused prewarmed host only if measurement requires it. Keep reference-release requirements and native responsiveness; leave WebKit mechanics experimental. |

## Boundary attacks rechecked

- Escape during resolution, first commit, buffered transfer and ordinary disposal: no preservation phase, no late UI authority and no new worker call from the retired bridge.
- Late resolver and focus completion from the same or a prior generation: no remount, focus reset or draft restoration.
- Input during handoff: one serialized owner; refused keys never enter the accepted history. InputCapture denotes shell admission, not delayed function-realm message receipt.
- Backend mutation admitted before Escape: it can complete and persist. A new UI-originated mutation before readiness or after retirement is refused. CLI availability is unaffected.
- Read-only HOST with pending text, or Tab to an unsupported target: explicit error, no fallback destination or implicit focus graph.
- Ordinary application cleanup or module-retained data: no forced-JavaScript-termination or immediate-memory-return promise. Native isolation and retention need experimental evidence.

## Result

The active design has resolver plus view, initial-focus declaration, limited type-ahead, and typed worker calls. Retirement revokes UI authority and disposes transient state; it has no custom callback, save window or temporary store. The backend remains one local dispatcher with function-owned operations and persistent data. No further UX tradeoff is required by this pass.

The remaining implementation experiments are input transfer into real controls, disposable runtime latency/retention, and optional socket activation. They are not additional product subsystems, and passing spec checks does not establish their runtime behavior. See the review executive summary and validation evidence for current status.
