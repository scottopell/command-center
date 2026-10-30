# ADR-016: Pin build inputs and verify the packaged local runtime

- **Status:** Accepted
- **Date:** 2026-10-30
- **Affects:** REQ-FF-012, REQ-FF-011

## Context

A clean public clone installs application dependencies from its lockfile, but the native build also depends on Node, npm, XcodeGen, full Xcode, and an interactive macOS session. Testing against an existing dependency cache and shell environment does not prove that the packaged worker runs under launchd's smaller environment.

## Options considered

- Document the current developer machine: concise, but leaves tool versions and missing prerequisites implicit.
- Add a general toolchain manager: comprehensive, but introduces another required installation and configuration system.
- Pin the existing tools, add preflight and isolated runtime checks, and exercise fresh public checkouts in CI.

## Decision

Pin Node and npm, retain a complete npm lockfile, and use exact direct dependency versions. Supply matching Node version-manager files. Install the pinned official universal XcodeGen release into an ignored repository-local directory after checking its published SHA-256. Full Xcode remains a user-installed Apple toolchain; preflight checks its selection and reports its version.

Provide `doctor`, `setup:native`, and a single `verify` command. Verification runs source checks, builds the native app, starts the packaged worker on an ephemeral port with a temporary data directory and a minimal environment, exercises the packaged CLI, verifies persistence across restart, and runs native conformance. It does not replace the installed service or touch live app stores. Allium analysis stays optional and separate from application build verification.

Public CI uses pinned action revisions, the declared Node toolchain, and Apple Silicon macOS runners. Runner images and Apple's SDK are reported rather than represented as byte-for-byte reproducible inputs. This promises reproducible dependency selection and an exercised setup path, not identical compiler output or compatibility with untested operating systems.

## Consequences

### Positive

Setup failures identify missing tools early. The same verification command runs locally and in CI, with no private function source or application services required.

### Negative

Initial setup needs network access and a full Xcode installation. Deliberate toolchain upgrades require updating pins and rerunning verification. The locally built Node launcher still depends on the selected Node installation remaining in place.

### Neutral

Service installation remains an explicit action after verification. The deployment target and tested OS/toolchain profiles are distinct compatibility claims.

## References

[Framework requirements](../function-framework/requirements.md); [Node release](https://nodejs.org/en/blog/release/v26.12.0); [XcodeGen release](https://github.com/yonaskolb/XcodeGen/releases/tag/2.46.0); [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/).
