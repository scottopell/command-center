# Local backend and Function Workers

## User story

As a local coding agent or command-center function, I need a stable application API and persistent data without an open command-center window so that ticket work can proceed independently of human inspection.

## Requirements

### REQ-BW-001: Reach function APIs without an open window

THE SYSTEM SHALL expose a stable local request endpoint to authorized local clients while the command-center window and function views are closed.
THE SYSTEM SHALL permit the service to be running or demand-started without changing the caller’s application operations.

**Rationale:** Coding agents need dependable access without launching a human UI.

---

### REQ-BW-002: Route messages to named application operations

WHEN a request names a registered function and operation, THE SYSTEM SHALL route it to that operation’s Function Worker handler.
IF either identifier is unknown, THE SYSTEM SHALL return a structured error and SHALL NOT invoke a handler.
THE SYSTEM SHALL provide transport and routing without requiring workers to define their own listener or HTTP layer.

**Rationale:** Authors can concentrate on application behavior while clients use one consistent endpoint.

---

### REQ-BW-003: Validate requests before application mutation

WHEN a request arrives, THE SYSTEM SHALL validate its envelope and its operation-specific payload before invoking the handler.
IF validation fails, THE SYSTEM SHALL return field-relevant errors without application mutation.
THE SYSTEM SHALL infer handler and client input types from the operation’s validation definition.

**Rationale:** Malformed agent or UI requests must not corrupt data, even when the caller bypasses static types.

---

### REQ-BW-004: Return consistent results and errors

WHEN a worker operation completes, THE SYSTEM SHALL return its JSON result or a structured validation, not-found, unavailable, internal, or outcome-unknown error.
THE SYSTEM SHALL distinguish an empty successful result from a failed read and SHALL NOT expose internal stack traces as application data.

**Rationale:** Callers must distinguish no matching work from a broken service.

---

### REQ-BW-005: Retain independent function data

THE SYSTEM SHALL retain function-owned data across UI closure and backend restarts, independently of Quick.
THE SYSTEM SHALL scope persistence access to the worker that owns the application data.

**Rationale:** Tickets must outlive both the view and the process that served them.

---

### REQ-BW-006: Commit related changes together

WHEN a worker operation changes related application facts, THE SYSTEM SHALL commit those changes together or commit none of them.
THE SYSTEM SHALL acknowledge a successful mutation only after its persistent commit.

**Rationale:** Concurrent agents must not leave half-applied ticket transitions or success responses for unsaved work.

---

### REQ-BW-007: Keep worker lifetime independent of views

THE SYSTEM SHALL register built-in Function Worker modules independently of UI invocation and keep their operation availability independent of Escape and view disposal.
THE SYSTEM SHALL NOT retain a view, DOM element, UI callback, or invocation-owned data through a worker registration.

**Rationale:** A persistent backend must not keep discarded interfaces alive.

---

### REQ-BW-008: Finish accepted operations independently of UI retirement

WHEN a validated request has been admitted to its handler, THE SYSTEM SHALL treat it as independent of the originating UI invocation.
WHEN the view retires, THE SYSTEM SHALL neither report the accepted mutation as rolled back nor automatically send it again.

**Rationale:** Leaving a view must not create duplicate submissions or falsely imply cancellation of submitted work.

---

### REQ-BW-009: Avoid hidden write retries

IF a mutation’s response is lost, THE SYSTEM SHALL report the outcome as unknown rather than claim failure, automatically resubmit that application request, or reinvoke its worker handler as transport recovery.
IF a failure occurs after a commit or the service cannot establish whether a mutation committed, THE SYSTEM SHALL NOT report that mutation as definitely uncommitted.
THE SYSTEM SHALL expose ordinary read operations for the caller to inspect persisted state.

**Rationale:** Agents need an honest outcome without duplicate application work caused by an invisible request-level retry. A worker can still deliberately retry an internal step when that step is known to be safe.

---

### REQ-BW-010: Keep local access local

THE SYSTEM SHALL restrict its listener to the local machine and reject requests lacking the local client credential.
THE SYSTEM SHALL supply that credential to the native client and local CLI without exposing it to arbitrary web pages or logging it.

**Rationale:** The personal workstation API should be usable by intended local clients without becoming an unauthenticated browser-accessible mutation surface.

---

### REQ-BW-011: Keep human and agent workflows consistent

THE SYSTEM SHALL provide agent CLI access to application workflows without requiring browser interaction.
WHEN human and agent entry points perform equivalent application actions with equivalent inputs and caller context, THE SYSTEM SHALL apply consistent domain validation and business rules.
THE SYSTEM SHALL make committed application changes available across human and agent entry points through their ordinary read or refresh behavior.
THE SYSTEM SHALL provide machine-readable results and non-success exit status for failed CLI operations.

**Rationale:** Humans and agents need to act on the same application data without their workflows drifting into conflicting rules or outcomes.

---

### REQ-BW-012: Persist worker data through a small scoped store

THE SYSTEM SHALL provide each Function Worker with persistent key-value storage scoped to that function, supporting reads, replacement writes, deletion, and prefix enumeration of JSON values.
THE SYSTEM SHALL distinguish a missing key from a stored null value and preserve stored values across worker-service restarts.
THE SYSTEM SHALL provide an atomic storage boundary for related key reads and writes, committing the complete change or none of it, without automatically rerunning worker-supplied transaction logic.
THE SYSTEM SHALL keep storage-engine handles, table definitions, filesystem locations, and other functions' key spaces outside the worker-facing store interface.

**Rationale:** Authors need simple durable application state and safe related updates without coupling their function to a database engine or transport implementation.
