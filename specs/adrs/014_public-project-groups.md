# ADR-014: Route personal work by project using an authored public directory

- **Status:** Accepted
- **Date:** 2026-10-30
- **Affects:** REQ-DR-001, REQ-DR-003, REQ-DR-005

## Context

The reference routing directory is company-derived and cannot ship with a public repository. Personal coding agents need actionable destinations without a company hierarchy. Project ownership, life areas, and work categories were considered as possible meanings for a group.

## Options considered

- Keep the reference directory with only its source redacted: preserves familiar routing but still discloses derived company data.
- Use broad work categories such as Bugs and Research: easy to classify, but duplicates ticket type and leaves project ownership unclear.
- Use authored project groups plus Inbox: small, public, and directly useful to an agent filing work against a repository.

## Decision

Replace the complete reference export with Inbox (1), CommandCenter (42), Phoenix IDE (43), and Paperclip (44). Slugs are `inbox`, `command-center`, `phoenix-ide`, and `paperclip`. Group 42 preserves the existing input-handoff conformance example, rather than an association with the former directory. Group numbers are opaque identities, not hierarchy or priority.

Inbox is available for unclassified work; it does not become an implicit default for bare Add. Keep the existing group wire shape, with empty `products` arrays, rather than changing the API as part of data sanitization. No project discovery, directory editor, organization synchronization, or ticket migration is included. Routing groups do not alter optional function integrations.

Remove the old export and its derived fixture identifiers from reachable Git history, not only the current tree. Preserve any local private backup outside tracked files. Existing installations with tickets from another directory require an intentional migration or a separate data directory; rebuilding the public source does not migrate their routing identities.

## Consequences

### Positive

The public repository contains only authored routing examples. Agents have concrete project destinations, and existing tails, forms, and APIs need no new mechanism.

### Negative

The directory is static. Another installation must edit it and rebuild its service; changing a number's meaning can mislabel older tickets.

### Neutral

Ticket type, assigned owner, requester attribution, and private optional integrations retain their separate roles. This supersedes only ADR-006's directory seed choice.

## References

[DRQS requirements](../drqs/requirements.md); [ADR-006](006_independent-drqs.md); [project directory](../../data/groups.json).
