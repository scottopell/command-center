# Function navigation and retained screens — Executive summary

## Requirements summary

As the operator, I need one predictable Back action that returns to the previous screen with my UI context intact while application data may refresh.

## Technical summary

The framework owns retained entry lifetimes, navigation, data delivery and query policy. Native focus and input authority remain explicit. React Activity and TanStack Query supply lifecycle/cache mechanisms; owning apps retain business rules. See [ADR-011](../adrs/011_retained-navigation-and-queries.md).

## Status summary

| Requirement | Status | Notes |
| --- | --- | --- |
| **REQ-NV-001:** Declare typed destinations | ✅ Complete | Typed screen schemas and direct-root navigation verified. |
| **REQ-NV-002:** Bound navigation history | ✅ Complete | Push, replace and visible four-entry refusal verified in WebKit. |
| **REQ-NV-003:** Provide one Back behavior | ✅ Complete | Native control/shortcut and loading/error Back verified. |
| **REQ-NV-004:** Retain ordinary React state | ✅ Complete | Ordinary fields/DOM retained; Activity Effect suspension verified. |
| **REQ-NV-005:** Restore the operator's place | ✅ Complete | WebKit primary offset/focus and removed-anchor neighbor fallback verified. |
| **REQ-NV-006:** Keep entry authority local | ✅ Complete | Native stale action refusal and invocation-scoped read admission verified. |
| **REQ-NV-007:** Preserve native focus and handoff | ✅ Complete | Child Title/Tab/Body handoff and deferred command focus verified. |
| **REQ-NV-008:** Expose bounded retention diagnostics | ✅ Complete | Bounded scalar entry timing/query/size diagnostics; no exact heap claim. |
| **REQ-NV-009:** Exercise navigation under failure and repetition | ✅ Complete | WebKit soak: 224 pushes, 200 pops and eight depth-four cancellations; ownership checks only. |
| **REQ-NV-010:** Browse a stable collection sequence | ✅ Complete | Validated descriptor snapshots and stable order with fresh owner reads verified. |
| **REQ-NV-011:** Replace detail when moving between siblings | ✅ Complete | Replacement depth, fresh detail scroll, failure and retained Back verified in WebKit. |
| **REQ-NV-012:** Provide consistent sibling controls and shortcuts | ✅ Complete | Native controls, actual key events, editing/repeat/pending guards verified. |

**Progress:** 12 of 12 complete.

## Open questions & future directions

- More complex browsing, record editors, polling and ownership migrations require separate concrete journeys.
