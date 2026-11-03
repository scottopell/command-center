# Runtime function packs

## User story

As an operator and function author, I need to add and update independently built functions without rebuilding the native application or exposing private source.

## Requirements

### REQ-PK-001: Add an existing source folder

THE SYSTEM SHALL register an explicitly selected local folder containing a pack manifest with stable pack and function identities, function mnemonics, titles, entry points and an integer API epoch. Git SHALL NOT be required. Pack discovery SHALL NOT search sibling folders implicitly.

**Rationale:** Private and public source folders use one installation path.

### REQ-PK-002: Build independent installed artifacts

THE SYSTEM SHALL snapshot pack source and build frontend entries separately for each function, worker contracts and handlers, and explicitly included assets into host-controlled artifacts. Installed code SHALL work while the original source folder is unavailable. External owner services MAY remain application dependencies. THE SYSTEM SHALL reject escaping source imports, escaping symlinks, native add-ons, arbitrary build hooks and incompatible dependencies with actionable diagnostics.

**Rationale:** Moving or editing source cannot break the installed version.

### REQ-PK-003: Own the supported SDK and toolchain

THE SYSTEM SHALL supply one supported API epoch spanning the SDK, native bridge and worker boundary, with host-owned React, framework and compiler dependencies. Functions SHALL reference local host-provided SDK/runtime modules instead of embedding SDK or React implementations in their artifacts. Independent pack clients SHALL derive types from their own operation schemas rather than a global compiled function union. The build SHALL type-check source against the current SDK and apply targeted source and dependency checks without claiming whole-program purity or a sandbox. SDK build fingerprints SHALL provide diagnostic context rather than compatibility gating within an epoch.

**Rationale:** Independent functions retain type safety without compatibility machinery.

### REQ-PK-004: Reject identity and mnemonic conflicts

THE SYSTEM SHALL reject duplicate installed pack identities and function mnemonics, including conflicts with system functions, without modifying the active installation. An update to the registered source for an existing pack MAY retain its identities. Storage ownership SHALL use stable pack and function identity, not mnemonic or source path.

**Rationale:** One function cannot silently replace another or inherit retained data.

### REQ-PK-005: Build changes and apply manually

WHEN registered source changes, THE SYSTEM SHALL announce the change and build a candidate without changing the active installation. THE SYSTEM SHALL expose ready, building and failed status and require explicit Apply. A failed build SHALL leave active code intact.

**Rationale:** Source edits cannot destroy an open draft or execute partial changes.

### REQ-PK-006: Apply as a bounded maintenance operation

WHEN Apply is requested, THE SYSTEM SHALL validate the complete candidate and conflicts, close shared application-request admission, and wait for all admitted handler promises, including disconnected callers. IF handlers do not finish within the maintenance deadline, THE SYSTEM SHALL postpone activation and reopen admission to the previous version without terminating admitted work. Workers SHALL NOT launch untracked application work after their handlers return.

**Rationale:** Brief unavailability is acceptable; interrupting writes to finish an update is not.

### REQ-PK-007: Activate matching code and contracts

THE SYSTEM SHALL restart the shared worker runtime with candidate registrations and confirm its exact installation identity before publishing the candidate catalog. Startup failure SHALL preserve the previous installation and attempt to restore its runtime. Automatic fallback SHALL occur only before admitting candidate application requests. Worker initialization SHALL NOT write application data; automatic data migrations and transactional data rollback SHALL NOT be provided.

**Rationale:** The shell, frontend and worker must agree without simultaneous versions or migration machinery.

### REQ-PK-008: Relaunch an affected open function

WHEN an affected open function's pack is applied, THE SYSTEM SHALL cancel that invocation and relaunch its mnemonic without tail or arguments after activation. Drafts and navigation SHALL be discarded. Unrelated open functions SHALL remain mounted. Ordinary launches SHALL NOT restart workers.

**Rationale:** Explicit Apply has a simple fresh-start meaning.

### REQ-PK-009: Remove code while retaining data

WHEN a pack is removed, THE SYSTEM SHALL unregister its functions while retaining function data. Explicit data deletion SHALL be available only in the internal management UI and SHALL remain separate from removal and ordinary function/CLI operations.

**Rationale:** Uninstalling code must not silently destroy records.

### REQ-PK-010: Keep system dependencies explicit

THE SYSTEM SHALL supply the system STRAG worker with one read-only diagnostics reader. Folder packs SHALL NOT self-declare system provenance or obtain that dependency through their manifest. Private source visibility SHALL NOT imply system privileges.

**Rationale:** Diagnostics access needs one explicit dependency, not a general permissions framework.

### REQ-PK-011: Adopt compatible host runtime updates automatically

WHEN the host supplies a new runtime within the supported epoch, subsequent launches and worker starts SHALL use it without rebuilding or applying function source. Each open view SHALL retain its selected immutable runtime for its lifetime. Runtime adoption SHALL NOT activate unapplied source edits. Runtime resources and module resolution SHALL remain local, preserve source maps, and provide one React/framework instance per document.

**Rationale:** Routine SDK fixes should not create per-pack maintenance work.

### REQ-PK-012: Reject incompatible installed code without losing data

THE SYSTEM SHALL check epochs during build, activation, installed artifact loading and worker startup. Missing or mismatched epochs SHALL make the affected functions unavailable with an actionable Update required explanation while retaining their code, registration and data. Compatible functions SHALL remain usable. Applying a breaking host upgrade SHALL retire old UI instances and drain admitted worker requests before replacement. The platform SHALL support one epoch without version negotiation, compatibility adapters or automatic source/data migrations.

**Rationale:** A sole maintainer can change functions and the platform together while detecting wrong combinations explicitly.

### REQ-PK-013: Reclaim unused runtime generations

THE SYSTEM SHALL automatically reclaim host-cached SDK generations that are neither selected by a live shell nor retained by a function document, including generations abandoned by a terminated process. Selection and reclamation SHALL coordinate so a generation cannot be removed while it is being acquired or read by another CommandCenter process. Cleanup SHALL run outside the screen-transition path, remain confined to generated runtime-cache entries, and leave function data, installed pack artifacts and source runtimes intact. Cleanup failures SHALL be logged and retried on later cache activity without failing a function launch.

**Rationale:** SDK updates must not accumulate obsolete code or break an open view.
