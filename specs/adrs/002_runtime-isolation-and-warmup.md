# ADR-002: Select invocation isolation by latency and retention experiments

- **Status:** Accepted
- **Date:** 2026-10-29
- **Affects:** REQ-SH-006, REQ-SH-011, REQ-FF-006

## Context

Fresh React state does not release data retained in a loaded module. The user wants guards against accidental module-global blobs but is concerned about new WebView cost. Swift/WebKit process allocation is not equivalent to one process per function.

## Options considered

- One shared document with fresh React roots and linting: simplest startup, but module caches survive view unmount.
- Disposable function document/WebView per invocation: lifetime isolation, but startup and bridge teardown costs.
- Disposable documents with at most one prewarmed unused host: potential lower visible latency, with additional warm-host lifecycle cost.

## Decision

Use one disposable WKWebView/document per invocation and a persistent native shell. The local native and screen-level checks meet the recorded profile without a warm pool. Keep invocation identity checks, source guards and native handler teardown. No OS-process-per-function or fixed RSS-return promise is made.

## Consequences

### Positive

Behavior remains stable while the implementation can be chosen from evidence.

### Negative

A shared document cannot promise reclamation of arbitrary module globals; a disposable realm can still leak through host references.

### Neutral

Linting rejects mutable top-level state, module-level data caches, writes to globalThis/window, and top-level side effects outside registration and small immutable metadata. It cannot prove all third-party retention paths.

## References

[Framework requirements](../function-framework/requirements.md); [WebKit architecture](https://docs.webkit.org/Getting%20Started/Introduction.html); [detached-window retention](https://web.dev/articles/detached-window-memory-leaks).

## Experiment and acceptance

Measure visible destination/loading time, first input acceptance, and peak/retained memory across repeated DRQS/SLOW/HOST launches. Cancel during resolution, commit, handoff, and ordinary view disposal. There is no custom unload or preservation phase. Remove native handlers and bridge references and inspect retained object paths. Record machine, OS, app build and workload. Select the simplest mechanism meeting ADR-007 and the no-retired-ownership requirements; do not interpret a successful garbage collection as a hard future timing guarantee. Begin without a warm-host pool; introduce at most one unused warm host only if measured startup cost requires it.

## Implementation evidence (2026-10-29)

See the [application verification record](../../verification/README.md), [raw native samples](../../verification/native-benchmark.json), and [screen smoke checks](../../verification/screen-smoke.json). Thirty native launch/dispose cycles released all weakly tracked invocation/view objects; three cycles allocated 32 MiB document-owned blobs. Screen samples are conservative upper bounds including automation/capture overhead. These local checks do not establish performance under arbitrary OS stalls, exact GC/RSS timing, or exhaustive interleaving coverage.
