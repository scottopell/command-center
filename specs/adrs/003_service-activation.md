# ADR-003: Treat socket activation as an optional platform mechanism

- **Status:** Accepted
- **Date:** 2026-10-29
- **Affects:** REQ-BW-001, REQ-BW-007

## Context

The user wants an endpoint available independently of the window and does not require a continuously running process. Demand activation can lower idle resource use but adds startup integration.

## Options considered

- A launchd-managed always-running local backend: straightforward server startup and predictable warm latency.
- A socket-activated local backend: launchd owns the listener and starts the service on demand.
- A durable queue and generic worker fleet: supports independent jobs but introduces scheduling and recovery not required by the ticket journeys.

## Decision

Use one always-running per-user launchd service for the built-in workers. The installed service and CLI operate with the window closed, and persistent state survives restarts. Socket activation and idle shutdown are deferred; they do not add application value needed by the present journeys.

## Consequences

### Positive

Callers keep the same application API under either service lifecycle.

### Negative

Demand-start introduces cold request latency and file-descriptor handoff. Accepted connections or committed requests are not recovered by launchd as application jobs.

### Neutral

Availability is within the logged-in user session on an awake machine. Window closure is not logout.

## References

[Worker requirements](../function-workers/requirements.md); [Apple socket activation](https://developer.apple.com/documentation/xpc/launch_activate_socket).

## Experiment and acceptance

With the app closed and service absent, send a local read and a create request, confirm startup and persistent commit, then read it through a fresh client. Exercise several simultaneous first connections and service restart. Record cold/warm latency and process count. If integration cost is disproportionate, accept an always-running service with no application API changes.

## Implementation evidence (2026-10-29)

See the [application verification record](../../verification/README.md), [raw native samples](../../verification/native-benchmark.json), and [screen smoke checks](../../verification/screen-smoke.json). Thirty native launch/dispose cycles released all weakly tracked invocation/view objects; three cycles allocated 32 MiB document-owned blobs. Screen samples are conservative upper bounds including automation/capture overhead. These local checks do not establish performance under arbitrary OS stalls, exact GC/RSS timing, or exhaustive interleaving coverage.
