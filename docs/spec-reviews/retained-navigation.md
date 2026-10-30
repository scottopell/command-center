# Retained navigation and query integration — adversarial review

Date: 2026-10-30

Scope: specifications before application implementation. Two independent review lanes examined the new navigation/query requirements, framework extensions, ADR-011 and the existing shell/worker contracts. Allium validation is recorded separately in the specification verification output.

## Self-consistency findings and resolutions

| Finding | Resolution |
| --- | --- |
| Defining ready only after handoff can create a preparation/handoff cycle | REQ-NV-007 distinguishes prepared (resolved + committed + focus validated) from interactive (handoff completed). Native entry admission precedes child resolution. |
| Retained parents create competing focus markers and stale action closures | REQ-FF-003 and REQ-NV-006 scope focus/action authority to one active entry; loading, failed, hidden and retired entries cannot submit new actions. |
| Focus restoration could steal command focus | REQ-NV-005/007 restore visual position while deferring only function focus/handoff. Back's initiating event is excluded from subsequent user intent. |
| Unknown attempts might reset when Effects restart or a query refreshes | REQ-QL-006 makes handles entry-owned and stable through rerender, Activity suspension, reveal and refresh. New entries/invocations are new intents without semantic deduplication. |
| A universal committed field would break current DRQS operations | REQ-QL-003 uses successful resolution of a registered mutation under REQ-BW-006; no new acknowledgement predicate or field. |
| Screen-owned cancellation could incorrectly stop another observer's shared query | REQ-QL-005 leaves shared observer lifecycle with the library. Client cancellation ignores obsolete delivery; old-key cache results cannot replace current-key UI. |
| A query refresh error could revoke entry readiness or turn a committed write into failure | REQ-NV-006 and REQ-QL-004 distinguish initialization failure from background refresh failure. |
| Four entries do not bound all cached filter/search variants | ADR-011 explicitly accepts invocation-proportional cache growth and requires query diagnostics; no hidden total-memory guarantee. |

## Complexity cliffs

### 1. Generic continuous layout restoration — removed

1. Requirement: preserve an item anchor through arbitrary refreshed layouts.
2. Apparent cost: save scrollTop and focus, then put them back.
3. Hidden cost: nested/virtualized scrolling, animated/media geometry, disappearing rows, focus scrolling and user intent compete.
4. Architectural consequence: a generalized DOM/layout observer and viewport arbitration system.
5. Maintenance cost: each complex widget introduces browser-specific restoration cases.
6. Adopted alternative: one framework-owned primary viewport; optional data-nav-item keys; correction on reveal and query-result commits only; deterministic next/previous/default fallback; stop after subsequent user interaction. Nested/virtualized/media/animation restoration is excluded.

### 2. Retain every query variant — accepted, measured limitation

1. Requirement: cached content survives covered screens for the invocation's lifetime.
2. Apparent cost: set the query library's gcTime to Infinity.
3. Hidden cost: every distinct search/filter/record key can remain cached. Per-response limits and stack depth do not cap the number of historical keys.
4. Architectural consequence: either accept this lifetime or introduce reference accounting, pinning, eviction/refusal and cache-miss reconstruction semantics.
5. Maintenance cost: long invocations can retain substantial data; diagnostics identify growth but do not enforce a total cap.
6. Adopted alternative: retain until invocation disposal, observe query count/response indicators and profile actual memory. Do not add an LRU or reconstruction subsystem before evidence justifies a product tradeoff.

### 3. Universal retry-safe writes and stale-draft protection — excluded

1. Requirement: repeat any uncertain mutation safely and prevent every stale edit.
2. Apparent cost: add an idempotency key or baseVersion field to the bridge.
3. Hidden cost: the canonical owner must atomically store deduplication receipts or compare versions with the write; CC receipts cannot make an external commit atomic.
4. Architectural consequence: owner API/storage changes, receipt lifecycle, concurrency policy and recovery guarantees per operation.
5. Maintenance cost: inconsistent guarantees across owner apps and accidental claims about new intents, queued acceptance or process death.
6. Adopted alternative: unknown attempts stay blocked without automatic retry; current narrow commands have explicit last-commit semantics. New intent has no dedup guarantee; future replacement editors need owner version checks. No navigation requirement introduces generic idempotency/CAS.

### 4. Cross-invocation completion barriers — excluded

1. Requirement: a fresh launch must wait for and reflect every older admitted write.
2. Apparent cost: retain a pending-write flag.
3. Hidden cost: lost replies, app closure and writes by CLI/other apps escape that flag's lifetime.
4. Architectural consequence: a shared operation tracker and potentially persistent receipts/events.
5. Maintenance cost: frontend freshness becomes coupled to service operation recovery.
6. Adopted alternative: a fresh invocation reads a snapshot; it may precede an old commit. Ordinary refresh discovers later changes. Cancellation never implies rollback.

## Highest-leverage decisions

Use Activity instead of a reconstruction store, TanStack Query instead of a cache engine, broad invalidation instead of per-app cache patching, and existing worker contracts instead of another commit protocol. Prepared/interactive admission and scoped entry authority are ordinary correctness work, not reasons for a new workflow subsystem.

Browser policy enforces the supported built-in data path, not hostile-code isolation. Exact per-screen heap ownership, interception of every timer/listener and arbitrary network-capability sandboxing are not promised.

## Review disposition

The concrete consistency findings were corrected before application implementation. Reviewers found no remaining specification blocker after those corrections, subject to behavioral-model validation. The retained-query growth tradeoff remains explicit. Required conformance includes long-hidden query retention, unknown resubmit refusal, cancelled/late reads, admitted-write cancel/relaunch races, Back during initialization and actual WebKit focus/scroll behavior.

## Implementation verification follow-through

Runtime checks kept two boundary details explicit. Shared read descriptors belong to the invocation cache even after their originating entry pops; only UI actions require current-entry authority. Refresh controls retain their focus by using guarded aria-disabled behavior instead of becoming natively disabled during a read. HOST partial-source failures preserve one bounded worker-owned complete observation with current diagnostics, without creating a second authoritative view snapshot. The common RPC service caps serialized replies at 2 MiB, with oversized committed-write replies classified as unknown outcomes.

These are implementation corrections against the accepted requirements, not additional product features or another specification review round. Retained query variants still have no total memory ceiling; metadata/ownership tests are not heap-snapshot proof.

Actual WebKit repetition exposed a batched push/Back preparation race and a reveal refresh scheduled before query observers reattached. Preparation now keys off each transition, and reveal revalidation runs after child subscriptions attach. Fresh child entries await required reads even when their key is cached; retained Back alone uses immediate cached reveal. Regression tests cover both distinctions.
