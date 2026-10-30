# ADR-005: Discard transient state without a custom unload hook

- **Status:** Accepted
- **Date:** 2026-10-29
- **Affects:** REQ-SH-004, REQ-SH-005, REQ-SH-011, REQ-FF-004, REQ-FF-005, REQ-FF-006

## Context

An optional unload hook was proposed to save temporary data. No built-in function has a concrete consumer or restoration journey for that data. Destructive switching intentionally discards drafts, while worker operations already persist submitted application data. The user explicitly chose to remove the hook and keep the framework small.

## Options considered

- Arbitrary asynchronous unload callbacks: flexible, but retain closures and require deadlines, late-write handling and cleanup ordering.
- A synchronous JSON snapshot followed by platform persistence: narrower, but still needs storage, retention and a consumer.
- Ordinary React cleanup and host disposal only: meets the existing resource-lifetime needs without exit-data preservation.

## Decision

Omit useUnload, exit snapshots, temporary draft storage, preservation grace periods, restore APIs and custom unload-callback registration. Deprecate REQ-FF-004 and REQ-FF-005 without reusing their IDs. Standard React cleanup releases ordinary resources; the native host revokes input/bridge authority and disposes the view without waiting for application saves. Normal-operation worker calls persist application data. A future exit-data capability needs a concrete user journey and a new requirement.

## Consequences

### Positive

Retirement has no application preservation phase, callback deadline or late-save protocol. The framework contract remains resolver plus view.

### Negative

Unsent drafts are intentionally lost on Escape or replacement. An author cannot use teardown as a persistence guarantee.

### Neutral

Ordinary view cleanup is still necessary. It does not cancel accepted backend work. Native responsiveness and release of platform references still need the runtime experiments in ADR-002; synchronous application cleanup must not become a native UI dependency.

## References

[Framework requirements](../function-framework/requirements.md); [shell requirements](../shell/requirements.md); [runtime experiments](002_runtime-isolation-and-warmup.md).

[ADR-008](008_focus-dependent-cancel.md) clarifies that Escape discards the invocation only when the command bar already has focus; a focus-only Escape preserves it.
