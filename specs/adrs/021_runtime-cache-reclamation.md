# ADR-021: Reclaim SDK generations using OS-managed leases

Date: 2026-11-03

Status: Accepted

Affects: REQ-PK-011, REQ-PK-013

## Context

Immutable cached SDK generations keep open documents working across host updates, but retaining every generation grows disk use. Tracking only the current fingerprint loses generations still used by older documents. In-memory counts cannot protect another app process or recover automatically after a crash.

## Decision

A selected runtime holds a shared filesystem lease, retained through Swift value copies and the WebKit asset handler. The shell's selected runtime keeps its generation even with no open function. OS descriptor closure releases leases on ordinary disposal or process death. A short cache-wide file lock serializes generation acquisition and retirement across processes.

A background sweep attempts an exclusive nonblocking lease for each generation. Busy generations remain. Unleased generations and abandoned staging entries are atomically moved aside under the coordination lock, then recursively deleted outside it. Unknown entries and symlinks are left alone. Selection schedules a sweep after acquisition; the last local lease release schedules another. Errors are logged; subsequent cache activity retries. No age threshold, size quota, retained rollback versions or timer is introduced.

## Consequences

Live shells/documents protect exactly the cache resources they retain. Crashed processes leave no stale ownership records. Deletion does not run in screen transition callbacks or touch source runtimes, pack builds or application data. The first upgrade from the pre-lease app requires the ordinary app restart. Mixed execution with an older app that predates leases is unsupported.

This completes ADR-020's deferred runtime-generation reclamation.
