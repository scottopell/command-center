# ADR-017: Runtime local packs and independent transition readiness

- **Status:** Accepted
- **Date:** 2026-11-02
- **Affects:** REQ-PK-001..010, REQ-ST-001..004, REQ-FF-001, REQ-FF-002, REQ-FF-003, REQ-FF-008, REQ-FF-009, REQ-FF-011, REQ-SH-006, REQ-NV-006, REQ-QL-001
- **Supersedes:** ADR-015's build-time-only composition; ADR-007's visual-only latency endpoint
- **Amended by:** [ADR-019](019_foreground-transition-budget.md) replaces the readiness fallback and unconditional transition budget; other decisions stand.
- **Amended by:** [ADR-020](020_host-runtime-and-api-epoch.md) replaces embedded SDK copies/version declarations with host runtime modules and one API epoch.

## Context

Private functions must install without building Swift. A global compiled registry couples source checkouts and client types. Pre-mount data resolution also confuses slow data with slow framework transitions. The operator accepts explicit maintenance pauses and fresh relaunch after applying an update.

## Decision

Use local source folders, host-owned snapshots, per-function web builds and bundled workers. Pin one SDK and protocol; derive client types from local operation descriptors. Stable pack/function identities own storage; mnemonics are unique command labels. Build changed source automatically, activate manually, and relaunch an affected function with its bare mnemonic.

Keep one authenticated listener and one shared replaceable worker process. A maintenance admission gate counts handler completion independently of HTTP connection lifetime. A timeout postpones the update. Confirm the exact candidate generation before publishing metadata; allow pre-admission code fallback only. Do not implement schema migrations or rollback of application data.

Replace asynchronous pre-mount resolution with synchronous command/screen preparation and ordinary non-suspending queries inside mounted views. Preserve the real initial interaction surface while data loads. Readiness is a separate transition checkpoint, not input ownership: destination commit and validation, rendering opportunity, queued task and native acknowledgement. Occluded WebKit can throttle rendering callbacks; a tagged queued-task fallback prevents that from blocking responsiveness detection. It does not steal focus or drain input. Exceeding 500 ms records a straggler, never terminates a launch.

The native collector records bounded local diagnostics off the UI path. STRAG receives one explicitly host-wired read-only history dependency and otherwise uses ordinary function/worker APIs. System provenance is not a manifest privilege. Data deletion belongs to native management UI only.

## Consequences

The pack format deliberately supports bundlable JavaScript and explicitly packaged assets rather than arbitrary npm applications. Type checks and targeted source rules are guardrails, not proofs of purity or a third-party sandbox. Existing built-in data requires a one-time explicit namespace mapping; different pack identities never receive mnemonic-owned data. Exact visual timing tests, managed Git/ZIP acquisition, prewarming, bytecode caching, per-pack worker processes and live React state migration remain deferred.
