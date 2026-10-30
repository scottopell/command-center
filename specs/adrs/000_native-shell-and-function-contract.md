# ADR-000: Use a native shell and a narrow web-function contract

- **Status:** Accepted
- **Date:** 2026-10-29
- **Affects:** REQ-SH-001, REQ-SH-004, REQ-FF-001, REQ-FF-002, REQ-FF-003, REQ-FF-007

## Context

The user values keyboard-first command entry and focus behavior, wants a Mac application, and requires every function to integrate rather than embed arbitrary existing applications. Recreating a form or rendering framework would increase authoring cost.

## Options considered

- Browser-only shell: easier distribution, weaker control over application-level key handling.
- Swift native host with WebKit functions and a small TypeScript/React contract: native shell ownership and normal web UI authoring.
- Fully native functions: consistent native controls, but expensive to recreate web functions and share authoring tools.

## Decision

Use one native Mac window and web functions authored through defineFunction({ mnemonic, title, resolve, View }). resolve receives the untouched tail and an AbortSignal and returns initial view props. The framework renders View with those props, locates one data-initial-focus marker after commit, and performs handoff. A read-only view can mark a focusable container. There is no public ready callback or platform-owned form model. TypeScript infers props from resolve; runtime validation handles external inputs.

## Consequences

### Positive

Function authors supply application behavior and ordinary components. The host owns Escape and invocation identity.

### Negative

A native/web bridge and actual focus delivery still need platform-specific verification. Standard controls do not make delayed event injection automatically correct.

### Neutral

How many WebViews exist and when they are created remain undecided in ADR-002.

## References

[Framework requirements](../function-framework/requirements.md); [shell requirements](../shell/requirements.md).
