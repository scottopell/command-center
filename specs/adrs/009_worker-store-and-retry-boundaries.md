# ADR-009: Expose a scoped KV store and keep retry boundaries explicit

- **Status:** Accepted
- **Date:** 2026-10-29
- **Affects:** REQ-BW-005, REQ-BW-006, REQ-BW-009, REQ-BW-012, REQ-DR-004, REQ-DR-007

## Context

The user expects a basic key-value primitive for Function Workers. The initial backend record selected SQLite but blurred engine implementation with the worker-facing context. Concurrent ticket creation and related history/state updates still need atomicity. The no-hidden-write-retry requirement also needs a clear owner and boundary.

## Options considered

- Expose raw SQL or database handles: flexible, but every worker becomes coupled to the engine, schema and storage layout.
- Plain get/put/delete only: small, but concurrent read-modify-write and multi-key changes require another solution.
- A function-scoped KV interface with prefix enumeration and one explicit transaction boundary: small application-facing surface with the atomicity already required by the journeys.

## Decision

Expose the following worker context shape. This is an API sketch for REQ-BW-012, not a new independently normative document. SQLite can implement the store privately. This refines the worker-owned-table access suggested by ADR-001 without changing its one-service decision.

```ts
type JsonValue =
  | null | boolean | number | string
  | JsonValue[] | { [key: string]: JsonValue };

interface KVOperations {
  get(key: string): Promise<JsonValue | undefined>;
  put(key: string, value: JsonValue): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<Array<{ key: string; value: JsonValue }>>;
}

interface WorkerKV extends KVOperations {
  transaction<T>(work: (tx: KVOperations) => Promise<T>): Promise<T>;
}

interface WorkerContext {
  kv: WorkerKV;
}
```

The platform binds the namespace from the registered function identity; workers do not supply or switch namespaces. put replaces a complete value rather than merging fields. delete is idempotent. list returns matching entries in key order within that namespace. The initial store has no query language, indexes exposed to authors, subscriptions, or generic public CRUD HTTP API.

Outside a transaction, each operation is atomic on its own; a get followed by put is not an atomic read-modify-write. A transaction reads a consistent state, serializes conflicting changes, commits all changes together and resolves only after commit. On rollback it exposes none of its changes. It invokes the supplied callback at most once and does not support nesting. The callback uses the supplied tx operations and pure application computation, not network calls or other external side effects. DRQS uses this boundary for number allocation plus creation and for related ticket/history changes. It is storage atomicity, not a durable job or exactly-once RPC guarantee.

REQ-BW-009 applies to clients and platform request dispatch: after an uncertain response, do not resubmit the application request or reinvoke the worker handler automatically. It does not prohibit a worker from deliberately retrying a safe internal step. The storage implementation may retry acquiring a lock before executing work, but must not silently rerun the transaction callback or repeat an uncertain committed mutation. App-specific retry policy remains explicit application logic; no generic retry scheduler is added.

## Consequences

### Positive

Workers have one small persistent-data interface independent of the engine. Related changes retain atomicity without each function implementing storage concurrency. Request-level retry policy does not accidentally prohibit safe internal reads or pre-commit acquisition retries.

### Negative

Workers must express their data as JSON values and use an explicit transaction for related updates. Prefix enumeration is intentionally less expressive than SQL. A transaction callback cannot contain arbitrary external effects or depend on automatic callback retries.

### Neutral

The UI and CLI still use application operations, not direct access to this store. Accepted operations remain independent of UI focus and cancellation. Worker-store schemas and application validation belong to the function; the platform does not implement a schema designer or migration framework.

## References

[Worker requirements](../function-workers/requirements.md); [backend decision](001_single-local-worker-service.md); [DRQS decision](006_independent-drqs.md).
