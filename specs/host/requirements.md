# HOST local machine and service inspection

## User story

As the command-center operator, I need a compact read-only picture of the host and useful local services so that I can understand what is available without opening several system tools.

## Requirements

### REQ-HO-001: Identify the current host

WHEN HOST is launched, THE SYSTEM SHALL show computer name, operating-system version, architecture, uptime, command-center application version, and backend working directory.

**Rationale:** The operator needs to know which machine and runtime they are inspecting.

---

### REQ-HO-002: Inspect selected runtime settings

THE SYSTEM SHALL show the backend’s executable lookup path and selected locale/timezone settings with clear source labels.
THE SYSTEM SHALL NOT expose an unrestricted environment-variable dump or imply that backend settings describe every function process.

**Rationale:** Useful runtime context should be clear without accidentally displaying credentials or misleading environment values.

---

### REQ-HO-003: Inspect configured services and user LaunchAgents

THE SYSTEM SHALL list the union of service declarations in the current backend user's `~/.local/etc/toolkit.toml` and valid job definitions in that user's `~/Library/LaunchAgents/*.plist`, using the source and identity rules below.
THE SYSTEM SHALL obtain load state, current process identifier and last exit status from the current user's launchd job inventory, independently of whether a matching plist is present.
THE SYSTEM SHALL retain a declared service in the display even when no matching job definition or loaded job is found, and SHALL show a discovered job without requiring a declaration or a particular label prefix.
THE SYSTEM SHALL distinguish unavailable observations from confirmed absence and apply the runtime-state rules below with an observation timestamp.

**Sources and identity:**

| Source | Meaning and matching rule |
| --- | --- |
| `~/.local/etc/toolkit.toml`, each `[service.<name>]` table | One declared service. Its launchd label is exactly `com.scottopell.<name>`. Optional string fields `source`, `prod` and `notes` describe source location, deployed location and human notes; they are metadata, not evidence of installation or execution. Other top-level sections do not declare services. |
| `~/Library/LaunchAgents/*.plist` | Scan only immediate matching files. A valid nonempty `Label` is the job identity; the filename is not an alternative identity. Read the job's scheduling and detail metadata from that plist. |
| Current user's launchd job inventory | Match runtime records by exact label. The reference observation is `launchctl list` in the backend's per-user launchd context, including labels that appear in declarations without a matching scanned plist. Only these matched records enrich the declared/discovered inventory; this is not a machine-wide process inventory. |
| Join by label | Emit one service row per label, retaining declaration metadata and all matching plist paths. Do not match by basename, executable, port or display name. For example, `[service.reports-app]` joins to a plist whose `Label` is `com.scottopell.reports-app`, regardless of its filename. |
| Current user and paths | All `~` paths refer to the backend's user home, not its working directory. Expand leading `~/` in declared source/deployed locations; treat values as data and never execute them or expand arbitrary shell expressions. |

**Runtime-state rules, in precedence order:**

| Observation | Display meaning |
| --- | --- |
| Runtime query fails or cannot be interpreted | Runtime unavailable; do not infer not-loaded or stopped for every service. Last successful observations may remain visibly stale under REQ-HO-005. |
| Query succeeds and the label has a current PID | Running; show the PID and any observed last exit status separately. A historical nonzero exit does not override the current running process. |
| Query succeeds and the label is present without a PID, with a nonzero last exit | Loaded, stopped, last exit nonzero; retain the exit value rather than infer a successful scheduled run. |
| Label is present without a PID, last exit is zero or absent, and its unambiguous plist contains `StartInterval` or `StartCalendarInterval` | Loaded, idle, scheduled. |
| Label is present without a PID and none of the preceding rules apply | Loaded, idle. This includes demand-started services; absence of a PID alone is not failure. |
| Query succeeds and the label is absent | Not loaded, whether or not the service is declared or has a plist. Show declaration and matching-definition presence separately. |

IF the declaration file is absent, THE SYSTEM SHALL identify that source as not configured and continue plist/runtime inspection. IF it is malformed or unreadable, THE SYSTEM SHALL report that source as unavailable rather than claim it contains no declarations.
IF a plist is unreadable, malformed or has no valid Label, THE SYSTEM SHALL report a file-specific discovery error and continue inspecting other files without inventing a runtime identity from its filename.
IF multiple plists have the same Label, THE SYSTEM SHALL show their paths and a definition-conflict diagnostic without arbitrarily choosing scheduling or detail metadata from one of them; independent runtime observations remain usable.
THE SYSTEM SHALL read these sources directly without requiring toolkit-hub to be running, importing its executable module, or changing its configuration.

**Rationale:** The operator needs to compare intended services, installed definitions and actual execution without confusing any one of them with the others. Missing configuration or a failed scan must not make the whole host appear stopped.

---

### REQ-HO-004: Read selected service details

WHEN the operator selects a service, THE SYSTEM SHALL show available declared source and deployed locations, program, log location, detected port, local reachability, and listener observations.
THE SYSTEM SHALL source the declared locations from REQ-HO-003's `source` and `prod` fields and retain the full launchd label and definition paths as inspection details.
THE SYSTEM SHALL distinguish port reachability from application health.

**Rationale:** The operator can find the relevant service and supporting locations without overstating what a socket probe proves.

---

### REQ-HO-005: Understand freshness and refresh observations

THE SYSTEM SHALL show when each displayed snapshot was collected.
WHEN an observation cannot be refreshed, THE SYSTEM SHALL retain any last successful snapshot with a visible stale or unavailable indication.
WHEN the operator requests refresh, THE SYSTEM SHALL update observations without resetting the operator’s current selection or focus.

**Rationale:** The operator needs to know whether the display is current while retaining a useful inspection position.

---

### REQ-HO-006: Inspect without changing host services

THE SYSTEM SHALL provide HOST as read-only and allow its content container to receive initial focus.
THE SYSTEM SHALL NOT restart, install, stop, or reconfigure inspected services as a result of inspection.

**Rationale:** Inspection should remain predictable and fit the narrow initial platform boundary.
