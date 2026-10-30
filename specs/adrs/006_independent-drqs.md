# ADR-006: Recreate DRQS journeys against independent local data

- **Status:** Accepted
- **Date:** 2026-10-29
- **Affects:** REQ-DR-001, REQ-DR-002, REQ-DR-003, REQ-DR-004, REQ-DR-005, REQ-DR-006, REQ-DR-007, REQ-DR-008, REQ-DR-009, REQ-DR-010

## Context

The Quick-based DRQS defines useful user journeys but carries hosting, browser-auth, storage-concurrency and probabilistic numbering constraints. The user requests a fresh implementation and independent data, prioritizing complete journeys over Quick-specific recovery scenarios.

## Options considered

- Embed or port the Quick application: quicker first screenshot, but wrong lifecycle and storage boundaries.
- Recreate the complete triage workflow against local workers and transactional storage.
- Recreate every Quick workaround and recovery UI: maximal parity, with cost unrelated to the local journeys.

## Decision

Recreate group queues, search, add, detail/history, comments, routing/state, ownership, requester attribution and an agent CLI. Seed a static directory from the reference group data and preserve its numbers. Allocate unique increasing local ticket numbers in the creation transaction rather than sparse random numbers. Bare A opens an unselected group field; a human explicitly chooses it. For A with a group, set it before mount. Title then Body are the first two controls; group and type follow. Use a configured local human identity and explicit agent actor labels; do not add company SSO or claim those labels are verified. Use explicit refresh, not push subscriptions. Mutating commands return the committed result. Do not import Quick tickets, embed its UI, call its storage SDK, or implement its number-collision/recovery workflows.

## Consequences

### Positive

The exact human/agent journeys remain useful while transactional local storage removes probabilistic numbering concerns.

### Negative

Data is local and independent; there is no team-wide sync or employee-authenticated audit trail. Transport failure after commit can still leave an unknown outcome.

### Neutral

The existing source is a behavioral reference only. Search includes all states for S tails. Group 42 must exist in the seed for the conformance example.

## References

[DRQS requirements](../drqs/requirements.md).

[ADR-014](014_public-project-groups.md) supersedes the reference-directory seed decision with authored project groups; the remaining workflow decisions stand.
