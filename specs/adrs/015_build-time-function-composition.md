# ADR-015: Compose an optional local function checkout at build time

- **Status:** Accepted
- **Date:** 2026-10-30
- **Affects:** REQ-FF-011, REQ-FF-008, REQ-BW-002, REQ-BW-003, REQ-SH-015

## Context

The public framework needs to build independently while a local installation includes private functions. Folder separation alone leaves contracts, registrations, native policy, and tests in the public source tree. A runtime plugin system would add installation, compatibility, and loading mechanisms without a current user journey.

## Options considered

- Keep private folders inside the public repository with ignore rules: simple paths, but fragile privacy and incomplete builds.
- Publish a versioned runtime plugin API: independently deployed extensions, with compatibility and lifecycle costs.
- Compose explicit source checkouts at build time: preserve one typed application and keep private source outside the public repository.

## Decision

Use a public checkout and an optional sibling private checkout. The private build wrapper explicitly sets `COMMAND_CENTER_EXTENSION` to its source root. The public default never searches for it. A small configuration step generates ignored TypeScript registries and a native resource catalog from the selected sources. Operation schemas remain the source of client types, validation, and mutation classification. Shared packages expose stable source import paths through package exports; local file dependencies connect the checkouts without copying the framework.

The catalog supplies autocomplete and explicitly allowed loopback source origins. Composed checks include the extension's view guards, TypeScript, fixture tests, specifications, and native tests. Generated private content and build products remain ignored. Builds share local output locations, so the last build determines the app and service payload; build from the intended checkout before installing.

This is trusted source composition, not runtime discovery, a third-party sandbox, hot reload, or a published version-compatibility promise. Private ownership and backup instructions belong in the private repository and local toolkit configuration.

## Consequences

### Positive

The public app is complete on its own, and local private functions use the same lifecycle and validated transport. No remote private repository is needed.

### Negative

The checkouts must be updated and verified together. Generated files require configuration before direct TypeScript or test invocation. A composed local binary contains private function code and is not a public release artifact.

### Neutral

Private function specs and tests follow their source. Source composition does not move canonical owner data or change service/window lifetimes.

## References

[Function framework requirements](../function-framework/requirements.md); [worker requirements](../function-workers/requirements.md); [source registration](../../scripts/configure.mjs).
