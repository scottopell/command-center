# CommandCenter platform specifications

A requirements-first specification set for a single-window Mac command-center, reusable web functions, a local Function Worker service, and fresh DRQS and HOST functions.

## Read the feature specs

| Feature | Requirements | Implementation status |
| --- | --- | --- |
| CommandCenter shell and invocation lifecycle | [Requirements](../specs/shell/requirements.md) | [Executive](../specs/shell/executive.md) |
| Function authoring framework | [Requirements](../specs/function-framework/requirements.md) | [Executive](../specs/function-framework/executive.md) |
| Local backend and Function Workers | [Requirements](../specs/function-workers/requirements.md) | [Executive](../specs/function-workers/executive.md) |
| DRQS development requests | [Requirements](../specs/drqs/requirements.md) | [Executive](../specs/drqs/executive.md) |
| HOST local machine and service inspection | [Requirements](../specs/host/requirements.md) | [Executive](../specs/host/executive.md) |
| Function navigation | [Requirements](../specs/navigation/requirements.md) | [Executive](../specs/navigation/executive.md) |
| Worker query integration | [Requirements](../specs/query-layer/requirements.md) | [Executive](../specs/query-layer/executive.md) |

The [shared ADR chain](../specs/adrs/README.md) records the selected mechanisms and their evidence. Requirements and Allium are normative. ADRs explain decisions; executive documents carry implementation status. The [local implementation](../README.md) and [verification evidence](../verification/README.md) now accompany this set. Validation of the Allium models is separate from runtime verification.

## Behavioral models

- [Invocation and ordered input](../specs/shell/invocation.allium).
- [Function/framework boundary](../specs/function-framework/function-contract.allium).
- [UI/worker lifetime boundary](../specs/function-workers/request-boundary.allium).
- [Retained entry stack](../specs/navigation/entry-stack.allium).
- [Query and mutation lifetime](../specs/query-layer/query-lifecycle.allium).

## Review and validation

- [Adversarial reviews and accepted simplifications](spec-reviews/executive.md).
- [Retained navigation consistency and complexity review](spec-reviews/retained-navigation.md).
- [Selection and sibling browsing review](spec-reviews/selection-and-siblings.md).
- [Conformance journeys](../verification/specs/acceptance.md).
- [Validation evidence](../verification/specs/validation.json).

The source Quick DRQS and toolkit-hub were inspected as behavioral references. The project directory is authored for CommandCenter; no internal directory, Quick UI/SDK code, credentials, or live tickets are included. SLOW is a lifecycle conformance function rather than a separate feature.
