# Runtime function packs

## User story

As an operator and function author, I need to add and update independently built functions without rebuilding the native application or exposing private source.

## Requirements

### REQ-PK-001: Add an existing source folder

THE SYSTEM SHALL register an explicitly selected local folder containing a pack manifest with stable pack and function identities, function mnemonics, titles, entry points and supported SDK version. Git SHALL NOT be required. Pack discovery SHALL NOT search sibling folders implicitly.

**Rationale:** Private and public source folders use one installation path.

### REQ-PK-002: Build independent installed artifacts

THE SYSTEM SHALL snapshot pack source and build frontend entries separately for each function, worker contracts and handlers, and explicitly included assets into host-controlled artifacts. Installed code SHALL work while the original source folder is unavailable. External owner services MAY remain application dependencies. THE SYSTEM SHALL reject escaping source imports, escaping symlinks, native add-ons, arbitrary build hooks and incompatible dependencies with actionable diagnostics.

**Rationale:** Moving or editing source cannot break the installed version.

### REQ-PK-003: Own the supported SDK and toolchain

THE SYSTEM SHALL supply one supported SDK/protocol version and pinned React, framework and compiler dependencies. Independent pack clients SHALL derive types from their own operation schemas rather than a global compiled function union. The build SHALL type-check source and apply targeted source and dependency checks without claiming whole-program purity or a sandbox.

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
