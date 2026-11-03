# ADR-020: Provide the runtime from the host with one API epoch

Date: 2026-11-03

Status: Accepted

Affects: REQ-PK-001, REQ-PK-002, REQ-PK-003, REQ-PK-007, REQ-PK-011, REQ-PK-012

## Context

Embedding the SDK and React in each function requires rebuilding every installed pack to adopt framework fixes. The sole operator maintains the SDK and functions together and accepts coordinated breaking changes. A compatibility matrix and automatic migrations would add little value.

## Options considered

- Automatically rebuild packs on SDK changes: preserves current bundling, but needs installed source snapshots to avoid activating unapplied edits and still couples routine fixes to per-pack builds.
- Maintain several SDK versions: gives independent compatibility windows but adds loader, worker and testing combinations.
- Provide local runtime modules with one API epoch: separates implementation updates from function source, while requiring explicit coordinated changes when breaking the contract.

## Decision

Choose host-provided runtime modules and one integer API epoch. Pack builds externalize provided modules; browser views resolve them through a host-supplied local import map, and worker processes through a local module resolver. Build the platform modules together so React, query providers and SDK contexts have one identity in each execution context. Keep function and runtime source maps separate and unmodified.

Use immutable runtime generations identified by a content fingerprint. New launches use the current generation; open views retain their selected generation. Fingerprints are diagnostic, not a compatibility range. Within an epoch, replacing the host runtime needs no pack rebuild or Apply and never consumes source edits. No independent network updater is introduced: the CC installation supplies the runtime.

Replace pack sdkVersion declarations with apiEpoch. Check installed artifacts as well as source manifests, exclude incompatible workers from startup, and expose unavailable functions with Update required. Do not delete their registration, code or storage. Legacy embedded artifacts have no epoch and require a one-time rebuild. The public example and local private pack are migrated explicitly.

Breaking changes increment the one epoch. The host restart retires its views; service replacement drains admitted work through the existing maintenance lifecycle. The current SDK type-checks known pack source during development; no support matrix or automatic source transformations are provided.

## Consequences

Routine SDK fixes reach existing function artifacts automatically. Function bundles become smaller. Runtime packaging and resolution become an explicit host responsibility. Old runtime generations may remain on disk to serve open views; reclamation is deferred. The single maintainer must bump the epoch for breaking changes and update affected source. An unavailable source folder does not prevent compatible installed code from running.

This amends ADR-017's embedded SDK/version model; its source and activation decisions stand.
