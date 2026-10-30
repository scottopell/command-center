# ADR-008: Escape returns command focus before it cancels

- **Status:** Accepted
- **Date:** 2026-10-29
- **Affects:** REQ-SH-004, REQ-SH-007, REQ-SH-008, REQ-SH-011, REQ-SH-014, REQ-FF-003

## Context

Earlier wording treated any Escape as destructive. The user clarified that Escape outside the function input bar returns focus to that bar; Escape while already focused there cancels the current function. This is a focus condition, not a double-Escape timer or press counter.

## Options considered

- Cancel on every Escape: simple but destroys the function before the operator can prepare another command.
- Require two presses regardless of focus: adds hidden state and disagrees with cancelling from a directly focused command bar.
- Choose the action from focus at keypress admission: matches the requested behavior with no timer or additional cancel mode.

## Decision

Use focus at the start of one Escape keypress to choose exactly one action. Outside the command bar, move command focus and keep the invocation, screen, draft and pending input. In the command bar, cancel the current invocation and show the empty state. Cancel is the term for this Escape-triggered retirement; replacement by another command still retires the prior invocation normally.

When command focus is claimed during initialization or drain, pause function input delivery and route new typing to the command bar. Initialization may complete, but cannot steal command focus. If the operator returns to the function through ordinary focus navigation, finish its pending handoff before ordinary function input. Executing a new command instead replaces the old invocation and discards its pending input. Do not add a timer, resume API, function persistence, or saved draft mechanism.

## Consequences

### Positive

The operator can type a new command while retaining the current function. Clicking into the command bar then pressing Escape cancels on that first press. One keypress cannot first focus and then cancel.

### Negative

The handoff must honor command-focus ownership when a resolver completes or input is draining. A focus-only Escape cannot be tested as cancellation.

### Neutral

Cancel revokes the UI lifetime, not already admitted backend work. The disposal policy in ADR-005 remains; this record clarifies its Escape trigger. No custom unload hooks or preservation phase return.

## References

[Shell requirements](../shell/requirements.md); [framework requirements](../function-framework/requirements.md); [disposal decision](005_bounded-unload.md).
