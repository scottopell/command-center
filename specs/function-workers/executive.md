# Local backend and Function Workers — Executive summary

## Requirements summary

As a local coding agent or command-center function, I need a stable application API and persistent data without an open command-center window so that ticket work can proceed independently of human inspection.

## Technical summary

[ADR-001](../adrs/README.md) records one local service and built-in application handlers. [ADR-009](../adrs/009_worker-store-and-retry-boundaries.md) exposes function-scoped key-value storage through the worker context, with SQLite private to the platform. Related writes use an explicit transaction; the platform does not retry its callback. Requests name a function and operation and carry schema-validated JSON. REQ-BW-009 prevents request-level redispatch, not safe deliberate retries of internal worker steps. ADR-003 selects an always-running per-user launchd service; socket activation is deferred.

## Status summary

| Requirement | Status | Notes |
| --- | --- | --- |
| **REQ-BW-001:** Reach function APIs without an open window | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-BW-002:** Route messages to named application operations | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-BW-003:** Validate requests before application mutation | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-BW-004:** Return consistent results and errors | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-BW-005:** Retain independent function data | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-BW-006:** Commit related changes together | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-BW-007:** Keep worker lifetime independent of views | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-BW-008:** Finish accepted operations independently of UI retirement | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-BW-009:** Avoid hidden write retries | ✅ Complete | Lost response and post-commit fault tests report outcome_unknown without redispatch. |
| **REQ-BW-010:** Keep local access local | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-BW-011:** Keep human and agent workflows consistent | ✅ Complete | Human/agent defaults, validation, CLI journeys and shared persisted records verified. |
| **REQ-BW-012:** Persist worker data through a small scoped store | ✅ Complete | Real SQLite tests cover namespace isolation, replacement/null, expired handles, rollback and no callback retry. |

**Progress:** 12 of 12 complete.

Implementation evidence: [code, tests and measurement scope](../../verification/README.md).

## Open questions & future directions

- Remote access, multi-user accounts, cloud synchronization, scheduling, durable job queues, automatic mutation retries, dynamic worker uploads, and per-function processes are outside scope.
- The service is a per-user local service; machine sleep, logout, and operating-system scheduling are not always-on availability guarantees.
