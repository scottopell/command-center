# CommandCenter shell and invocation lifecycle — Executive summary

## Requirements summary

As the human operator, I need a predictable keyboard-driven command-center so that I can launch functions and inspect agent work without waiting for data or managing focus manually.

## Technical summary

The shell owns command admission, invocation identity, buffered input, and visual states. [ADR-008](../adrs/008_focus-dependent-cancel.md) makes Escape focus-dependent: outside the command bar it returns focus without cancelling; in the command bar it cancels. Returning to the command bar pauses handoff and initialization cannot steal that focus. [ADR-004](../adrs/004_loading-input-fidelity.md) accepts limited type-ahead and readiness-gated submission. Disposable WebViews and native focus/input authority are implemented. Local measurements and their limits are recorded under ADR-002 and ADR-007.

## Status summary

| Requirement | Status | Notes |
| --- | --- | --- |
| **REQ-SH-001:** Use one consistent command-center window | ✅ Complete | One orange command field, inline Show functions button, no suggested-command placeholders or timer. |
| **REQ-SH-002:** Launch functions with their tails intact | ✅ Complete | Normalized launch text and tail retained independently of buffered function input; invalid feedback preserved. |
| **REQ-SH-003:** Discover registered functions | ✅ Complete | Inline all-functions discovery preserves current text; automatic matching and tail rules verified. |
| **REQ-SH-004:** Return immediately to the command bar | ✅ Complete | Unchanged launch text selected on command return; Tab resumes function; edited drafts preserved. |
| **REQ-SH-005:** Start every invocation fresh | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-SH-006:** Respond promptly to command admission | ✅ Complete | Native loading frame plus screen-level upper bounds below 500 ms on the recorded local profile; see measurement limits. |
| **REQ-SH-007:** Preserve input while a function initializes | ✅ Complete | Forced in-flight drain/pause/resume test, exact title/body sequence, committed IME input. |
| **REQ-SH-008:** Hand input to the initialized destination | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-SH-009:** Keep early actions attached to their invocation | N/A | Deprecated; historical obligation retained. |
| **REQ-SH-010:** Expose initialization and handoff failures | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-SH-011:** Release retired invocation ownership | ✅ Complete | 30 disposal cycles; weak native references released, handlers detached; no immediate RSS claim. |
| **REQ-SH-012:** Leave submitted work independent of the view | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-SH-013:** Submit only after readiness | ✅ Complete | Native capture refuses early actions; bridge independently rejects premature writes. |
| **REQ-SH-014:** Cancel a function from the command bar | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-SH-015:** Open sources outside the function document | ✅ Complete | URL/phase/generation guards, trusted-click check and bundled navigation tested; live archive handoff observed. |
| **REQ-SH-016:** Copy intentionally selected display text | ✅ Complete | Actual WebKit selection, native Select All/pasteboard and authority/size/failure guards verified. |

**Progress:** 15 of 15 active requirements complete; 1 deprecated requirement retained.

Implementation evidence: [code, tests and measurement scope](../../verification/README.md).

## Open questions & future directions

- Command history, security areas, shortcut-button grids, multiple windows, and global shortcuts outside the command-center are outside the agreed build.
- A hard visual timing claim needs the benchmark environment defined by ADR-007; cold application startup has a separate measurement.
