# Worker query and mutation integration

## User story

As a function author, I need shared query lifecycle and mutation outcomes so views stay coherent across Back without app-specific cache or transport code.

## Requirements

### REQ-QL-001: Use typed worker data operations

THE SYSTEM SHALL provide query and mutation APIs derived from registered worker operation schemas. Only registry-declared reads SHALL be admitted as queries and only registry-declared writes as mutations. Query identity SHALL include worker identifier, operation identifier and validated inputs. Views SHALL consume application results through this integration; UI drafts and choices MAY use ordinary React state.

**Rationale:** Authors reuse typed application operations without duplicating data fetching or business models.

---

### REQ-QL-002: Retain invocation query data

THE SYSTEM SHALL share a query cache within one invocation and retain successful cached results while that invocation lives, including when screens have no active observers. Cancellation and function switching SHALL dispose that query client and its framework references. Shared query definitions SHALL retain operation descriptors and plain validated data rather than screen objects or callbacks.

**Rationale:** Back can reveal cached content after a long stay in a child.

---

### REQ-QL-003: Invalidate uniformly after committed writes

WHEN a registry-declared mutation resolves successfully under REQ-BW-006, THE SYSTEM SHALL invalidate all queries in the originating invocation automatically, refresh applicable active queries and leave inactive queries stale for reveal. A universal committed field or author-provided acknowledgement predicate SHALL NOT be required. This invalidation SHALL remain effective if the originating screen has been popped while the invocation survives. THE SYSTEM SHALL NOT require author invalidation callbacks, app-specific record patching or optimistic cache updates.

**Rationale:** Lists and details refresh through one generic policy without reproducing owner rules.

---

### REQ-QL-004: Revalidate without resetting context

THE SYSTEM SHALL display retained query content while stale queries revalidate on entry reveal or explicit refresh. A failed refresh SHALL retain available results with a visible warning and last successful check time; an uncached failure SHALL expose a read error. Source observation times SHALL remain distinct from query-check times. Query refresh SHALL NOT reinitialize component state or turn a confirmed write into a failed mutation. Continuous polling and unsolicited application-wide refresh events SHALL NOT be required.

**Rationale:** Freshness remains visible without replacing useful content with a loading screen.

---

### REQ-QL-005: Ignore superseded read deliveries

THE SYSTEM SHALL consume query cancellation signals at its client boundary, reject cancelled read promises, remove their delivery waiters and ignore late replies. Reads superseded by newer input or mutation invalidation SHALL NOT overwrite the corresponding current query result. Shared-key observer lifecycle SHALL remain query-library owned; covering one screen SHALL NOT independently cancel another screen's shared read. A result for a different key MAY remain cached but SHALL NOT replace current-key UI. Underlying owner reads MAY finish; THE SYSTEM SHALL NOT imply that ignoring a reply cancelled owner work.

**Rationale:** Out-of-order responses cannot regress displayed data.

---

### REQ-QL-006: Represent mutation uncertainty honestly

THE SYSTEM SHALL admit a new UI mutation only from the active interactive entry and reject repeated submit on the same pending handle. A handle SHALL belong to its entry and remain stable across rerenders, Effect suspension/reveal and refresh; these events SHALL NOT create a new intent or reset pending/unknown state. THE SYSTEM SHALL NOT automatically retry a write. An unknown outcome SHALL remain distinct from rejection and SHALL block ordinary resubmission of that attempt; a refresh alone SHALL NOT clear it or prove non-commit. A new invocation, new entry or explicit application action creating a new handle SHALL constitute a new intent without a deduplication guarantee. Verification reads SHALL remain available; cross-entry semantic deduplication SHALL NOT be claimed.

**Rationale:** Unknown outcomes must not silently become retryable failures or false success.

---

### REQ-QL-007: Leave concurrency semantics with the owner

THE SYSTEM SHALL preserve worker-defined commit, rejection and conflict semantics and submit narrow commands or explicitly changed fields rather than silently replace records from retained query snapshots. Explicit DRQS field changes SHALL use last committed command wins; DRQS comments SHALL append to current stored history. THE SYSTEM SHALL NOT claim generic idempotency, version checks or draft merging. Existing-record replacement editors requiring conflict protection SHALL require an atomic owner version check before being exposed.

**Rationale:** Fresh query data cannot by itself protect stale editable drafts or deduplicate external writes.

---

### REQ-QL-008: Accept fresh-read snapshot races

Relaunch SHALL start a fresh UI and query client without waiting for already-admitted mutations. A read MAY precede an older admitted write's commit; later ordinary refresh SHALL discover the changed state. THE SYSTEM SHALL NOT imply rollback from cancellation or provide a cross-invocation completion barrier. Agent and other-app changes SHALL become visible through owner reads without an immediate-update guarantee.

**Rationale:** The platform avoids a global operation tracker while stating its consistency limits.

---

### REQ-QL-009: Bound requests and verify cache lifetime

THE SYSTEM SHALL use bounded single-page owner reads, finite transport response/time limits and deduplicated query work. Infinite scrolling SHALL NOT be part of this query contract. UI query and mutation transport retries SHALL be disabled; owner-internal safe retries remain governed by the worker contract. Conformance SHALL cover cache retention beyond five minutes of inactivity, cancelled/late reads, write completion after entry pop, unknown resubmit refusal, cancel/relaunch races and refresh failures.

**Rationale:** Query defaults and async boundaries must support retained navigation predictably.
