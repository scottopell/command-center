# ADR-004: Choose the smallest loading-time input contract that preserves the DRQS journey

- **Status:** Accepted
- **Date:** 2026-10-29
- **Affects:** REQ-SH-007, REQ-SH-008, REQ-SH-009, REQ-SH-010, REQ-SH-013, REQ-DR-005, REQ-FF-007

## Context

The user requires title text, Tab, and body text entered before the form is ready. Earlier discussion also included arbitrary editing/navigation and submission before readiness. Ordinary controls do not automatically accept synthetic event replay, and composition, selection, shortcuts, rich text, pointer changes and dynamic tab order greatly expand the problem.

## Options considered

- Full keyboard/editor replay: strongest parity, highest fidelity and native/browser integration cost.
- Constrained loading-time type-ahead: plain committed text/paste, append/backspace in the current pending segment, and forward Tab between ordinary text fields; normal editing after handoff.
- No type-ahead: simplest but fails the core requested DRQS journey.

## Decision

The user approved limited loading-time editing and submission only after readiness. Before handoff completes, support committed text/paste, append/Backspace within the current pending segment, and forward Tab through ordinary text fields. Backspace at an empty pending segment is a no-op and does not cross a Tab boundary or delete tail-prefilled values. Refuse unsupported keys with a visible indication. Do not buffer raw composition events; committed text can enter through the ordinary capture mechanism. Return and submit shortcuts are refused until handoff completes, including Return intended as a textarea newline; pasted text may contain line breaks. After handoff, ordinary browser editing and Return behavior apply. Retain the exact DRQS title/Tab/body journey. Deprecate REQ-SH-009 and replace it with REQ-SH-013; do not reuse its identity for the opposite submission policy.

## Consequences

### Positive

A narrow contract avoids a second general-purpose editor and delayed side-effect replay.

### Negative

An operator must wait and press submit again if it was attempted before readiness. Selection, reverse navigation, undo, and typed Return are unavailable while loading.

### Neutral

The actual handoff mechanism is experimental. No function-specific form model or focus registry is assumed.

## References

[Shell requirements](../shell/requirements.md); [DRQS requirements](../drqs/requirements.md).

## Experiment and acceptance

Demonstrate DRQS A 42 followed by the exact title/Tab/body example, including Unicode committed text, multiline paste, Backspace within a pending segment, cancellation halfway through draining, and input arriving during drain. Verify that Return, submission shortcuts, Shift-Tab, selection editing and other unsupported operations are visibly refused before readiness and are never replayed afterward. Verify that ordinary editing and textarea Return behavior resume after handoff. Native capture and transfer remain an implementation experiment; acceptance of the subset is not proof that an adapter meets it.
