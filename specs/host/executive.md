# HOST local machine and service inspection — Executive summary

## Requirements summary

As the command-center operator, I need a compact read-only picture of the host and useful local services so that I can understand what is available without opening several system tools.

## Technical summary

HOST reads a local worker snapshot. REQ-HO-003 defines declaration input as `[service.<name>]` tables in `~/.local/etc/toolkit.toml`, labels as `com.scottopell.<name>`, and discovered definitions as immediate `~/Library/LaunchAgents/*.plist` files with a valid `Label`. Join by exact label and observe the current user's launchd inventory independently of plist presence. Declared intent, definition presence and runtime state remain separate. Missing/malformed sources, duplicate labels, scheduled idle and unavailable runtime observations have explicit behavior. No running toolkit-hub dependency or executable import is required. Explicit refresh and timestamps avoid subscriptions. Environment output is limited to PATH, LANG, LC_ALL and TZ, with unset values identified.

## Status summary

| Requirement | Status | Notes |
| --- | --- | --- |
| **REQ-HO-001:** Identify the current host | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-HO-002:** Inspect selected runtime settings | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-HO-003:** Inspect configured services and user LaunchAgents | ✅ Complete | Fixture labels, missing/malformed sources, conflicts and runtime precedence; real host smoke check. |
| **REQ-HO-004:** Read selected service details | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-HO-005:** Understand freshness and refresh observations | ✅ Complete | Explicit refresh retains selection/filter/focus and preserves stale observations on failed refresh. |
| **REQ-HO-006:** Inspect without changing host services | ✅ Complete | Implemented; code and checks are mapped in the verification record. |

**Progress:** 6 of 6 complete.

Implementation evidence: [code, tests and measurement scope](../../verification/README.md).

## Open questions & future directions

- Backups, repository protection, Chonk artifacts, live log tailing, process control, remote hosts, and additional toolkit functions remain future candidates rather than HOST requirements.
