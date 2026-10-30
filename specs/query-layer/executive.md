# Worker query and mutation integration — Executive summary

## Requirements summary

As a function author, I need shared query lifecycle and mutation outcomes so views stay coherent across Back without app-specific cache or transport code.

## Technical summary

The framework owns retained entry lifetimes, navigation, data delivery and query policy. Native focus and input authority remain explicit. React Activity and TanStack Query supply lifecycle/cache mechanisms; owning apps retain business rules. See [ADR-011](../adrs/011_retained-navigation-and-queries.md).

## Status summary

| Requirement | Status | Notes |
| --- | --- | --- |
| **REQ-QL-001:** Use typed worker data operations | ✅ Complete | Schema-derived read/write types and key validation verified. |
| **REQ-QL-002:** Retain invocation query data | ✅ Complete | Real query client retains inactive data beyond five minutes and clears on disposal. |
| **REQ-QL-003:** Invalidate uniformly after committed writes | ✅ Complete | Cache-owned invalidation survives origin pop; no author cache patching. |
| **REQ-QL-004:** Revalidate without resetting context | ✅ Complete | Cached Back/revalidation and failed-refresh retention verified. |
| **REQ-QL-005:** Ignore superseded read deliveries | ✅ Complete | AbortSignal delivery cleanup and late-result rejection verified. |
| **REQ-QL-006:** Represent mutation uncertainty honestly | ✅ Complete | Stable pending/unknown handles reject duplicates across refresh and suspension. |
| **REQ-QL-007:** Leave concurrency semantics with the owner | ✅ Complete | Narrow command semantics retained; no generic CAS or idempotency claim. |
| **REQ-QL-008:** Accept fresh-read snapshot races | ✅ Complete | Explicit cancel/relaunch snapshot race covered by fixture test. |
| **REQ-QL-009:** Bound requests and verify cache lifetime | ✅ Complete | Real query-client and bounded authenticated HTTP tests; no UI transport retries. |

**Progress:** 9 of 9 complete.

## Open questions & future directions

- More complex browsing, record editors, polling and ownership migrations require separate concrete journeys.
