# CommandCenter

A single-window macOS workspace for inspecting and working with local coding agents. Native AppKit owns commands, Escape, loading feedback, and type-ahead. Disposable WebKit documents host ordinary React functions. A separate per-user service owns persistent Function Workers. Add local function packs without rebuilding Swift.

## First build on a Mac

Install full Xcode from Apple, open it once to complete setup, and select its Command Line Tools in **Xcode → Settings → Locations**. Command Line Tools alone cannot build or test this app.

Use [Node 26.12.0](https://nodejs.org/en/download/archive/v26.12.0), which includes npm 11.20.0. Both versions are pinned in this repository. If you already use nvm, run `nvm install && nvm use` after cloning; other version managers can read `.node-version`.

```sh
mkdir -p ~/dev
cd ~/dev
git clone https://github.com/scottopell/command-center.git
cd command-center
npm ci
npm run setup:native
npm run verify
```

- `npm ci` installs the exact dependency tree and integrity hashes in `package-lock.json`. Direct dependencies are exact versions too; use `ci`, rather than an unreviewed dependency update.
- `setup:native` downloads the official XcodeGen **2.46.0** universal binary, verifies its pinned SHA-256, and installs it under ignored `.tools/`. It needs no Homebrew or sudo and runs on Apple Silicon, including M1.
- `verify` checks prerequisites, runs source checks, builds the app, tests the packaged worker/CLI with a minimal PATH and a temporary store, then runs actual AppKit/WebKit tests. It does not install or replace a service or change live data. Native tests require a logged-in macOS desktop session.

Initial setup needs internet access to npm and GitHub. No GitHub token, signing team, private checkout, toolkit configuration, or Allium installation is needed for this flow. macOS 14 is the native deployment target; CI exercises Apple Silicon on macOS 15 and 26 with the runners' selected Xcode versions. Run the same verification on the target Mac rather than treating the deployment target as proof of runtime compatibility on every OS release.

After verification succeeds, start your local installation:

```sh
npm run service:install
open build/CommandCenter.app
bin/command-center drqs groups
```

The service remains available when the window closes. This is an unsigned local development build, without notarization. The packaged Node launcher references the Node executable selected during the build: build on the destination Mac, and rebuild/reinstall if that Node installation is moved or replaced. Copying an app built on a different Mac is not the supported installation method.

Run `npm run doctor` for actionable tool/version diagnostics. Re-run `setup:native` to obtain the pinned generator if a different system XcodeGen is installed. Full Xcode and Apple's SDK are reported by preflight rather than downloaded by this project.

## Try it

The **function input** is the editable field at the top; use it to enter a mnemonic and optional tail arguments. Back and contextual Previous/Next controls share this row. Its chevron opens **autocomplete**, the searchable list of functions. The **function toolbar** below it provides a shortcut for every installed function. Click a mnemonic to launch immediately without arguments, even to restart the current function. The running function is highlighted independently of anything you type in the input. Narrow windows put remaining shortcuts in More. Manage Packs sits at the toolbar's right edge. Function content begins directly below the toolbar.

- `DRQS A 42`: fresh request form, group 42 selected, Title then Body in Tab order.
- `DRQS`: all open requests. `DRQS G 42`: one group's queue.
- `DRQS S bazinator`: literal case-insensitive search across all states.
- `DRQS 1`: ticket detail, permanent original report, comments and routing history.
- `HOST`: machine basics, allowlisted **backend** environment, toolkit declarations, user LaunchAgents and independent launchd runtime observations.
- `STRAG`: inspect slow screen transitions, filter the last week, and open detailed timing records.
- `SLOW 5000`: deliberately blocked form for typing Title → Tab → Body before readiness.
- `SLOW 500 FAIL`: deliberate initialization failure. Use `SLOW 0 NAV` to exercise retained child screens, Back and the four-entry limit. Other conformance modes: `READONLY`, `RENDERFAIL`, `NOFOCUS`, `TWOFOCUS`, `HIDDEN`, `DISABLED`.

Functions can expose framework Previous/Next and **⌘⌥↑ / ⌘⌥↓** over an explicitly supplied collection. Movement follows its captured order and replaces the detail with fresh data. Back returns to the retained list. Shortcuts leave editable fields and command input alone.

Select displayed, non-editable function text to copy it automatically as plain text. Selection inside fields or the function input does not overwrite the clipboard. Explicit Copy remains available.

**Escape outside command returns command focus and preserves the function. Escape in command cancels it immediately.** A newly executed command always starts a fresh invocation. Use View → Focus Function or click the function area to resume a paused handoff. The top row is one orange command input with an inline chevron for discovering functions. Successful launch commands, including their tails, stay visible while the function runs; there are no rotating examples or suggested-command placeholders. Click the chevron to show all functions without changing the command text. Press Down or Right in the empty input to discover all functions. Autocomplete also drops down while typing a title/mnemonic fragment, supports arrows, Tab, Enter and pointer selection, and disappears when a mnemonic’s tail begins. Entered text and inline error feedback are padded and vertically centered. Escape/Focus Command selects an unchanged launch command for replacement, while an edited command draft keeps its text. Tab on the unchanged launch command resumes the function when autocomplete is closed. Cancel clears the field. An invalid mnemonic clears the submitted text and displays red feedback inside the input; type the next command immediately to dismiss it.

While loading, text, paste, Backspace within the pending segment, and forward Tab are supported. Return, submission shortcuts, reverse Tab and other navigation are visibly refused. Submission needs a fresh action after readiness. A buffered Tab reaching a select/button or leaving the function gives an explicit error. Ordinary browser editing resumes after handoff. IME preedit stays with native input until committed. No custom unload hook or cross-invocation draft restoration exists. Within a function, framework Back retains the previous screen, filters and drafts. Use Back beside the function input or Command-[; root Back is disabled. Pointer Back resumes function input; Back from command focus preserves your command draft.

Use **CommandCenter → Local Identity…** to configure the local human name/email before filing real work. The initial placeholder is the operating-system username at `local.invalid`. Attribution and requester references are client-supplied; this is not employee authentication. DRQS uses an independent store and an authored project directory. It does not connect to Quick.

Groups describe which project owns the work; ticket types describe the kind of work. The built-in directory is:

| Number | Slug | Project |
| --- | --- | --- |
| 1 | `inbox` | Inbox — unclassified work |
| 42 | `command-center` | CommandCenter |
| 43 | `phoenix-ide` | Phoenix IDE |
| 44 | `paperclip` | Paperclip |

For example, `DRQS G PHOENIX-IDE` opens Phoenix IDE's queue and `DRQS A PAPERCLIP` selects Paperclip in a fresh add form. Inbox is an explicit destination; bare `DRQS A` still requires a group choice. Customize `data/groups.json` for another installation, retaining each group's number and slug once tickets reference it, then rebuild and reinstall the service. This directory replacement does not migrate existing tickets. Use a separate data directory when evaluating it against an older installation with different group meanings.

## Agent access

`bin/command-center` prints JSON; failures print JSON on stderr and exit nonzero. It works with the native app closed:

```sh
bin/command-center drqs groups
bin/command-center drqs create --title 'Bazinator fails in CI' --body 'All jobs fail; see repository ABC.' --group 42 --requester employee:reporter@example.com --actor coding-agent
bin/command-center drqs list --group 42
bin/command-center drqs get 1
bin/command-center drqs update 1 --comment 'Please investigate' --state N --group 44 --owner owner@example.com
bin/command-center drqs update 1 --comment 'Fixed' --state R --clear-owner
bin/command-center host
bin/command-center call DRQS list --json '{"state":"all","search":"bazinator"}'
```

Creation by an agent requires explicit employee/customer requesters. Repeat `--requester`; use `customer:reference` for customers. `--human` uses the configured local identity. `--input-file` supports larger generic RPC payloads. `--data-dir` targets a separate already-running test service.

The HTTP boundary is `POST http://127.0.0.1:19287/rpc` with `{function,operation,input}` and an optional installed revision. UI requests include their revision so stale contracts are rejected before admission. Intended local clients read a private credential from Application Support. Native code proxies requests; the credential never enters function props or JavaScript. Requests with an Origin header are rejected. Missing/lost mutation responses are **outcome_unknown** and never cause automatic redispatch. Inspect records before choosing to retry.

## Local service and data

The installer manages only `com.scottopell.command-center` in the current user's LaunchAgents. It installs the worker payload under `~/Library/Application Support/CommandCenter/service`, independently of the application window. It uses an always-running launchd service; no socket activation, durable queue or generic job scheduler is included.

It also installs a managed `~/.local/bin/command-center` launcher using that service payload. Add `~/.local/bin` to PATH to use `command-center` from function repositories; the checkout's `bin/command-center` remains available directly. The installer refuses to overwrite an unrelated command with that name.

Data: `~/Library/Application Support/CommandCenter/data.sqlite`; private credentials and connection metadata live beside it. Logs: `logs/worker.log` and `logs/worker-error.log`. `npm run service:stop` unloads this service while retaining data; `npm run service:install` starts or updates it. Availability is within the awake logged-in user session. The app reports service unavailability instead of silently spawning competing backends.

HOST is read-only. It scans `~/.local/etc/toolkit.toml`, immediate `~/Library/LaunchAgents/*.plist`, and current-user `launchctl list`; definitions join by exact Label. A port probe indicates reachability, not application health. It does not start toolkit-hub, restart services, run backups, or expose unrestricted environment variables.


Source buttons require a fresh human click after readiness. Native code opens HTTPS sources and explicitly registered local HTTP origins in the default browser. External navigation and subframe bridge calls are blocked; source pages never replace the bundled function document.

## Development and verification

- `npm run verify`: the complete local acceptance check: doctor, source checks, build, isolated packaged service smoke, and native tests.
- `npm run doctor`: Node/npm, OS, full Xcode selection, XcodeGen and lockfile diagnostics.
- `npm run check`: TypeScript, function lifetime source guards, and backend/CLI/fixture tests.
- `npm run build`: worker/CLI bundles, independent function assets and the installed SDK/compiler, Xcode project and native app.
- `npm run test:native`: XCTest against actual WebKit documents and isolated worker stores. Requires the desktop session; run after build.
- `npm run smoke:service`: packaged worker/CLI startup and persistence with isolated temporary data; run after build.
- `npm run check:specs`: optional requirements/ADR and Allium validation (tested with Allium CLI 3.5.2 on PATH). This extra specification-maintenance tool is not part of `verify` and is not needed to run the app.

Read [function authoring](FUNCTIONS.md), [architecture](ARCHITECTURE.md), and [verification evidence](verification/README.md). The canonical feature requirements are in `specs/`; no implementation statuses are embedded in requirements.

The [specification index](docs/specifications.md) links requirements, decisions and conformance journeys. Build products, local credentials, databases and caches are excluded from version control.

## Optional local functions

The public host contains DRQS, HOST, SLOW and STRAG. Choose **CommandCenter → Manage Functions… → Add Pack…**, select a folder containing `command-center.json`, then choose **Enable Functions** when it is ready. Each card lists its functions and current status. Later updates offer **Apply Update**, or **Apply & Relaunch** when a function from that pack is open. **More** contains source checks, details and removal. Try the included [NOTES pack](examples/notes-pack/command-center.json). Git is optional; clone or unzip source yourself and add the resulting folder.

The host snapshots source, supplies its pinned SDK/compiler and stores completed builds under its own data directory. Moving the source folder does not break the installed version. Saved edits build automatically; the Functions button announces ready or failed candidates. Apply remains manual. Applying an open function's pack discards its draft/navigation and relaunches the bare mnemonic, without tail arguments. A brief shared-worker maintenance pause can reject unrelated requests; admitted handlers finish or the update is postponed. Removing a pack retains its data; explicit deletion is only in native management.

See [function authoring](FUNCTIONS.md) for the narrow SDK and pack format. Check a pack with `bin/command-center pack check /path/to/pack`; include its fixture tests with `bin/command-center pack test /path/to/pack`. Platform-only packs need neither a private npm install nor a native build. Keep private source outside this public repository.

Transitions that exceed 500 ms produce a transient **Straggler detected** notice and bounded local history. This measures a responsive destination, independently of ordinary application-data latency and actual input cutover; it does not measure exact presented pixels. `STRAG` is the normal viewer. `bin/command-center strag list` or `strag get ID` reads history even while the service is unavailable. History retains at most 30 days and 10000 records; buffered typing and worker payloads are excluded.
