# Acceptance journeys and property obligations

These are verification obligations, not executed test results. Requirement IDs are the authority; examples make their observable outcomes concrete. Mechanism experiments are specified in the Proposed ADRs. An implementation must not claim input fidelity merely because its Allium file parses.

## Human command and input journey

| Scenario | Required observation | Requirements |
| --- | --- | --- |
| Launch DRQS A 42 | With group 42 seeded, Add is selected, group is 42, Title is initial focus, and Body is next in Tab order. | REQ-SH-002, REQ-SH-008, REQ-DR-003, REQ-DR-005 |
| Type ahead during resolution | Enter `the bazinator is broken in CI`, Tab, then `See the latest CI logs from repo ABC, you'll note that all jobs are failing on bazinator, pls advise` before resolution finishes. The two strings appear in Title and Body respectively, exactly once. | REQ-SH-007, REQ-DR-005 |
| Input races handoff | Enter additional text as the buffer drains. That input follows the existing prefix; it is neither reordered nor applied through both buffered and direct paths. | REQ-SH-007, REQ-SH-008 |
| Command GO is consumed | Executing the command never submits an empty creation form. | REQ-SH-008 |
| Limited loading-time editing | Before handoff, committed text/paste, Backspace within the pending segment and forward Tab work. Backspace at the start of a segment does not cross a field boundary or delete tail-prefilled values. Unsupported editing/navigation is visibly refused. After handoff, ordinary browser editing resumes. | REQ-SH-007, REQ-FF-007 |
| Early submission is refused | Press Return, a submit shortcut, or activate a submit button during resolution, mounting or drain. No submission or newline is queued. A visible indication explains refusal; the operator must act again once ready. Multiline paste remains supported and normal textarea Return resumes after handoff. | REQ-SH-013 |
| Escape outside the command bar | During resolving, mounting, draining, interactive or error, press Escape while focus is outside the command bar. Command focus returns; the invocation, view, draft and pending input remain. Resolution is not aborted and one keypress does not also cancel. | REQ-SH-004 |
| Escape in the command bar cancels | Focus the command bar by Escape or directly by pointer, then press Escape. The current invocation is cancelled and the empty state appears without awaiting cleanup or backend activity. If no invocation exists, command focus remains. | REQ-SH-004, REQ-SH-014 |
| Return command focus halfway through drain | First Escape pauses delivery without discarding pending text. New typing edits the command bar. A second Escape cancels, and no remaining text reaches another invocation. Returning function focus instead resumes its pending handoff before ordinary function input. | REQ-SH-004, REQ-SH-007, REQ-SH-008, REQ-SH-011, REQ-SH-014 |
| Resolution completes while command bar is focused | Claim command focus during loading, then finish resolution and commit. The function can display its view but cannot steal focus or drain pending input. Launching a new command replaces it; returning function focus resumes its own handoff. | REQ-SH-004, REQ-SH-007, REQ-SH-008, REQ-FF-003 |
| Rapid same-function launch | Launch DRQS A 42, cancel, launch it again, then complete the first resolver. Only the second invocation is visible and its draft is empty. | REQ-SH-005, REQ-SH-011 |
| Resolution or focus failure | Invalid tail, failed data read, rendering exception, no marker, two markers, and hidden/disabled marker each give an explicit error; pending input is not guessed into another destination. | REQ-SH-010, REQ-FF-003 |
| Duplicate completion | Deliver resolver and focus completion records twice, then deliver a late render error. The invocation is not remounted, its draft is not reset, and phase-inappropriate messages have no UI effect. | REQ-SH-011, REQ-FF-002, REQ-FF-003 |
| Late data refresh | Reading new data does not reapply initial focus, move a caret, clear a draft, or recreate the form. | REQ-FF-007, REQ-DR-002 |
| Read-only initial focus | HOST can focus its content container and supports Escape without a dummy text field. | REQ-FF-003, REQ-HO-006 |
| Text queued for HOST | Type text while HOST loads. The framework explicitly reports an undeliverable text destination and never inserts the text into the command bar. | REQ-SH-010, REQ-HO-006 |
| Forward Tab reaches an unsupported destination | Buffer a Tab that would reach a select, button, custom editor or a control outside the resolved view. The framework reports an unsupported destination; it does not skip the control or invent a private tab order. Title → Tab → Body remains supported. | REQ-SH-010, REQ-FF-007 |

## Disposal and ownership journey

| Scenario | Required observation | Requirements |
| --- | --- | --- |
| No exit-data API | The function-author contract exposes no custom unload hook, exit snapshot, draft restore or temporary preservation store. Escape never waits for an application save. | REQ-SH-004, REQ-FF-006 |
| No draft revival | Type a draft, cancel, and launch the same mnemonic again. The new form is fresh; no exit snapshot was written or restored. Committed application records remain available through the backend. | REQ-SH-005, REQ-BW-005 |
| Ordinary cleanup is independent | Unmount a view with subscriptions or pending read results. Normal React cleanup can release resources, but slow application code cannot delay the native host from clearing content and returning command focus. | REQ-SH-004, REQ-SH-011, REQ-FF-006 |
| Repeated large-data cancellation | Repeat allocate/resolve/mount/cancel cycles and inspect retained view, bridge, callback and payload ownership. No prior invocation remains platform-owned after disposal. Report allocator/cache effects separately from actual retained references. | REQ-SH-011, REQ-FF-006 |

## Agent and backend journey

| Scenario | Required observation | Requirements |
| --- | --- | --- |
| App closed | A fresh CLI process lists groups, creates a ticket, reads it, comments, routes it, assigns and clears an owner, resolves it, and reads the committed history without any command-center window. | REQ-BW-001, REQ-BW-005, REQ-BW-011, REQ-DR-010 |
| Human/agent workflow parity | Exercise equivalent valid and invalid application actions through human and agent entry points with equivalent inputs and caller context. Compare domain validation and resulting business state, and verify that committed changes are visible from the other entry point after an ordinary read/refresh. Do not assert identical internal method names, transport paths, generated IDs or timestamps. Explicit actor-specific defaults and attribution remain intentional differences. | REQ-BW-011, REQ-DR-009 |
| Invalid request | Missing or unknown function/operation, invalid envelope, unknown group, invalid state/type, and absent requester are explicit errors with no mutation. | REQ-BW-002, REQ-BW-003, REQ-DR-001, REQ-DR-004, REQ-DR-009 |
| Validate before handler | A schema failure leaves the worker handler invocation count at zero. | REQ-BW-003 |
| Caller cannot choose transaction semantics | Send payload fields claiming the operation is validated or read-only. They never replace registry/schema facts or cause a mutating handler to bypass its transaction obligations. | REQ-BW-003, REQ-BW-006 |
| Concurrent creates | Simultaneous valid creations receive distinct stable ticket numbers and retain their independent reports. | REQ-BW-006, REQ-DR-004, REQ-DR-010 |
| Concurrent comments | Two independent clients post different comments; both appear once in the committed ordered history. | REQ-DR-007, REQ-DR-010 |
| Atomic handoff | A comment plus group/state change commits together; forcing a storage error commits neither. A comment-only update preserves all unrelated fields. | REQ-BW-006, REQ-DR-007 |
| UI exits after admission | Admit a mutation, cancel the view, finish the transaction, then read from the CLI. The committed data is present; Escape has neither retried it nor promised rollback. | REQ-SH-012, REQ-BW-008 |
| UI calls after retirement | Retire an invocation before an old callback attempts a new bridge call. No new operation is admitted from that callback; existing CLI access and previously admitted work remain valid. | REQ-FF-008, REQ-BW-008 |
| UI mutation before readiness | Attempt a mutating bridge call from a resolver, first-render effect or early submit handler. It is rejected before worker admission. Read calls can prepare the view, and an independent CLI can still mutate while that view loads. | REQ-SH-013, REQ-FF-002, REQ-FF-008, REQ-BW-008 |
| Response lost after commit | A caller receives no confirmation. The client reports unknown outcome and does not retry a write automatically. A later read can observe the record. | REQ-BW-009 |
| Commit acknowledgement or response construction fails | If a mutation's commit cannot be established or its post-commit response fails, the caller is not told it definitely did not happen. A known rollback remains an ordinary failed operation. | REQ-BW-004, REQ-BW-009 |
| Service restart | Restart the backend and read committed data. No pending HTTP envelopes are replayed as durable jobs. | REQ-BW-005, REQ-BW-009 |
| Worker KV contract | From one worker, put/get/replace/delete JSON values and enumerate a prefix. Missing keys differ from null. Restart the service and read committed values; another function's namespace is not addressable through that context. | REQ-BW-005, REQ-BW-012 |
| Related KV changes | In a transaction, read/update a ticket counter and create a ticket; inject a failure and verify neither key changes. Concurrent transactions do not lose history updates or duplicate numbers. The supplied callback is not automatically repeated. | REQ-BW-006, REQ-BW-012, REQ-DR-004, REQ-DR-007 |
| Retry boundary | Lose a mutation response and verify the client/platform does not redispatch the handler. Separately exercise an explicit safe internal read retry or pre-transaction lock acquisition retry: it does not create a second application request or rerun the transaction callback. | REQ-BW-009, REQ-BW-012 |
| Local access boundary | Intended CLI and native clients can authenticate; invalid credentials and arbitrary uncredentialed browser requests cannot call mutations. No credential appears in function props or diagnostics. | REQ-BW-010 |

## HOST journey

Observe host basics and allowlisted environment values. Refresh while a row is selected and retain the selection and focus. A failed refresh leaves a visibly stale last successful snapshot. No inspection action restarts a service, invokes backups, or tails unbounded logs. Covers REQ-HO-001 through REQ-HO-006.

For REQ-HO-003, use independent declaration, plist and runtime fixtures:

| Fixture | Required observation |
| --- | --- |
| `[service.reports-app]` plus a differently named plist with `Label=com.scottopell.reports-app` | One joined row with declared source/prod/notes and the actual plist path. Filename does not determine identity. |
| Declaration plus a runtime record, with no matching scanned plist | The declaration remains visible and runtime PID/load state is reported. Missing definition does not imply not-loaded. |
| Declaration with neither matching plist nor runtime label, and a successful runtime query | Declared row remains visible; definition not found and not-loaded are separate facts. |
| A valid plist with a label outside `com.scottopell.*`, without a declaration | Discovered row is visible. |
| Runtime label present with PID and historical nonzero exit | Running PID remains primary; last exit is shown separately. |
| Loaded/no PID with nonzero exit, scheduled zero-exit idle, and unscheduled or demand-started idle | Distinct states under the precedence table. No PID alone is not failure. |
| Runtime inventory fails | Unavailable or visibly stale runtime state, never blanket not-loaded. |
| No toolkit.toml versus malformed/unreadable toolkit.toml | Not-configured versus unavailable declaration source; valid independent plist/runtime observations still work. |
| One malformed plist or missing Label among valid definitions | File-specific error without guessing the filename as identity or discarding all valid entries. |
| Two plists with the same Label | One label row, both paths, definition-conflict diagnostic, no arbitrary schedule/details selection; runtime facts remain usable. |
| toolkit-hub is stopped | Inspection still reads the declared sources and launchd observations without starting or importing toolkit-hub. |

For REQ-HO-004, include a LAN-only listener and a reachable local port, and verify that neither listener presence nor reachability is labeled application health.

## Timing and evidence

Measure command admission to the frame-based responsiveness checkpoint separately from native loading feedback, first commit, focus and input handoff. Apply the 500 ms SLO only while the app stays active and its window unoccluded; report excluded samples separately without pausing their clocks. Verify continuous input ownership and measure Escape separately; do not substitute backend response time or average frame time. Cold application startup and cold backend activation are separate cases. ADR-019 defines eligibility; ADR-007's native visual-flush benchmark is a separate historical measurement, not proof of readiness. There is no additional invented millisecond deadline for input capture.

## Properties for generated event sequences

- At most one invocation has UI authority; every callback/result is checked against that authority.
- Retirement is irreversible for an instance identity; later launch uses a distinct identity. A focus-only Escape is not retirement and preserves that identity.
- For the active invocation, the delivered input sequence is a prefix of the accepted sequence, with no duplicates or reordering.
- No operation is delivered before initial focus or while command-bar input ownership is active; a retired invocation has no pending deliverable operations. Return and submit shortcuts are never admitted to the loading-time buffer.
- Handoff has one cutover between buffered and ordinary input, including input arriving during drain.
- Valid tails prepare navigation only; no tail or initial render submits a ticket.
- A rejected envelope invokes no application handler and changes no application data.
- A successful mutation response implies a committed operation; a missing response implies neither rollback nor retry.
- Backend admission/completion is independent of the originating UI generation.
- A committed comment remains in history across concurrent updates and service restarts.

Generate bounded interleavings of launch, resolution result, commit/focus result, input, drain, command/function focus changes, Escape, disposal, worker admission, KV transaction commit and response loss. Evaluate Escape using focus at keypress admission. Assert these properties after each step. There is no unload-completion event or temporary-save race. The symbolic model abstracts browser composition and event delivery; a real WebKit prototype must verify those separately.

The input operation records are abstract specification history, not a requirement for a per-keystroke event store or one browser event per buffered key. A pending text-segment implementation can compact append/Backspace edits if it preserves final field text, field order and the handoff properties.

## Retained navigation and query journeys

| Scenario | Required observation | Requirements |
| --- | --- | --- |
| Retained parent | Edit filters/drafts, scroll and focus a stable row, push a child and Back. Ordinary local state and primary viewport return without author restoration code. | REQ-NV-001, REQ-NV-003, REQ-NV-004, REQ-NV-005 |
| Typed destinations | Undeclared names and wrong parameter types fail type checks; malformed runtime parameters are refused before native admission. | REQ-NV-001 |
| Root and replacement | Direct detail root has disabled Back. Replace retires the current entry rather than increasing depth. | REQ-NV-001, REQ-NV-002, REQ-NV-003 |
| Ceiling | Push a fifth entry. Current screen remains interactive and a visible diagnostic explains the four-screen limit. | REQ-NV-002 |
| Loading or failed child | Back remains available; queued child input and late completion cannot affect the restored parent. | REQ-NV-003, REQ-NV-006, REQ-NV-007 |
| Command-focus Back | Preserve command text and focus; restore visual position immediately, defer function focus until resume. Pointer Back resumes function input explicitly. | REQ-NV-005, REQ-NV-007 |
| Missing anchor | Remove the selected item during refresh. Choose the next surviving item in saved ordering, then previous/default, and show an inline explanation. Correction stops after subsequent user interaction. | REQ-NV-005 |
| Shared reads and old actions | A popped descriptor may support invocation-owned reads. Covered/retired navigation, focus, source opening and new mutations remain refused. | REQ-NV-006, REQ-QL-005 |
| Long detail stay | Leave a parent query inactive beyond five minutes. Back still renders cached content before revalidation. | REQ-QL-002, REQ-QL-004, REQ-QL-009 |
| Mutation completion after pop | Complete an already-admitted write after its originating screen is popped. Surviving invocation queries become stale and applicable active reads refresh. A failed read cannot fail the confirmed write. | REQ-QL-003, REQ-QL-004 |
| Unknown resubmit | Lose a write reply; refresh, rerender and cover/reveal. The same attempt remains unknown and ordinary resubmission remains refused. | REQ-QL-006 |
| Cancel/relaunch race | Relaunch reads before an earlier admitted write commits. The fresh snapshot may be old; later explicit refresh discovers the commit. No rollback or completion barrier is claimed. | REQ-QL-008 |
| Superseded read | Cancel an old read, deliver it late and finish the newer read. The late result cannot replace newer data; no obsolete delivery waiter remains. | REQ-QL-005 |
| Browser policy | Outbound fetch/XHR/socket/resource/frame attempts cannot bypass the worker path. Explicit validated human source opening still works. | REQ-FF-010 |
| Finite replies | Oversized reads fail explicitly; a write whose committed response exceeds the limit reports unknown outcome and is not replayed. | REQ-QL-009 |
| Repeated retention | Repeat push-to-ceiling/pop/cancel with fixture data. Inspect entry/query counts, Activity Effect cleanup and detached native ownership; report these separately from heap/RSS measurements. | REQ-NV-008, REQ-NV-009 |

## Selection copy and sibling browsing

| Scenario | Required observation | Requirements |
| --- | --- | --- |
| Stable neighbors, fresh records | Open B from A/B/C, then change owner membership/order and C data. Next still opens C and displays its current data. Opening again from the refreshed list captures a new order. | REQ-NV-010 |
| Replacement and retained Back | Move between siblings repeatedly. Stack depth remains constant, earlier detail UI/scroll is discarded, and Back reveals the original retained list/filter/return position. | REQ-NV-011 |
| Bounds and direct launch | No wrapping or paging; first/last controls disable appropriately. A direct detail launch has no collection controls. | REQ-NV-010, REQ-NV-011 |
| Ordinary navigation | A normal push/replace from a sequence detail does not inherit sequence context. Back from a pushed child can reveal its retained parent sequence normally. | REQ-NV-012 |
| Loading and failure | Repeated keys/presses cannot queue movement. Missing record fails with Back available; no automatic skip occurs. | REQ-NV-011, REQ-NV-012 |
| Editing and command focus | Cmd-Option-Up/Down leave editable fields and command input alone. Pointer/menu controls and keyboard movement use one framework operation. | REQ-NV-012 |
| Descriptor guardrails | Invalid destination params, duplicate/missing keys, non-JSON and excessive descriptors are refused before navigation. | REQ-NV-010 |
| Auto-copy selection | Real WebKit pointer and keyboard selections copy exact plain text. Empty, editable, covered, stale and purely programmatic selections do not replace clipboard content. | REQ-SH-016 |
| Clipboard failure | Oversized UTF-8 text and native write failure show visible feedback; no worker receives selection text and no history is retained. | REQ-SH-016 |

## Command display and inline discovery

| Scenario | Required observation | Requirements |
| --- | --- | --- |
| Idle field | No example placeholder appears; inline Show functions button opens all functions and toggles closed. | REQ-SH-001, REQ-SH-003 |
| Valid launch | Command and tail remain visible during loading and handoff; native buffered Title/Tab/Body reaches the function, not the retained field. Internal navigation does not rewrite the launch text. | REQ-SH-002, REQ-SH-007, REQ-SH-008 |
| Replace command | Escape selects the unchanged launch command for typing a replacement. An edited draft keeps its text; focus alone does not open autocomplete. | REQ-SH-004 |
| Explicit discovery with tail | Click inline discovery while SLOW 0 NAV is displayed. All functions appear without changing the text. Selecting HOST launches HOST without inheriting the old tail. | REQ-SH-002, REQ-SH-003 |
| Invalid correction | Unknown command clears and retains visible inline error feedback. Discovery does not erase it; editing clears the feedback and restores ordinary matching. Cancel leaves an empty field without examples. | REQ-SH-001, REQ-SH-002, REQ-SH-003 |

## Runtime packs and transition diagnostics

| Scenario | Required observation | Requirements |
| --- | --- | --- |
| Independent build | Add NOTES folder, validate with the packaged compiler, apply, then move the source. Installed UI and worker continue working. | REQ-PK-001, REQ-PK-002, REQ-PK-003 |
| Identity isolation | Reject a conflicting mnemonic, remove one pack, install another with the same mnemonic, and observe separate KV records. Reinstall the original to recover its records. | REQ-PK-004, REQ-PK-009 |
| Manual activation | Edit source, observe a ready candidate while the old function remains active, then Apply. An affected function restarts without tail, draft or navigation; an unrelated invocation retains its identity. | REQ-PK-005, REQ-PK-008 |
| Maintenance boundary | Disconnect a caller while its write runs. New calls are refused during maintenance. Timeout reopens old admission; eventual handler completion remains tracked. | REQ-PK-006 |
| Failed activation | Inject candidate startup failure. Exact previous runtime identity and catalog remain usable; stale revisions are refused before admission. | REQ-PK-007 |
| System provenance | Folder packs cannot claim the system identity. Only the built-in STRAG factory receives the diagnostics reader. | REQ-PK-010 |
| Responsive without focus theft | Keep command focus while a destination mounts. Its transition measurement completes without focus transfer or buffer drainage. | REQ-ST-001 |
| Forced straggler | Keep CC active and its window unoccluded; block SLOW for 600 ms. Record one straggler, keep loading and deliver buffered input; STRAG lists and opens the record. | REQ-ST-002, REQ-ST-004 |
| Foreground eligibility | Start hidden, or briefly switch away before detection then return. Preserve raw duration, exclude the transition from SLO counts/maxima and show its exclusion in STRAG/CLI. A previously detected straggler remains counted. | REQ-ST-002, REQ-ST-004 |
| Frame checkpoint | Withhold the animation-frame callback beyond 100 ms. No timer may acknowledge readiness. Release the callback and verify the separately queued acknowledgment. Hidden views may wait until rendering resumes. | REQ-ST-001 |
| Collector bounds | Repeated updates use one trace identity; terminal outcomes attach to it. Local reader bounds malformed/oversize files and supports offline CLI history. | REQ-ST-003, REQ-ST-004 |

## Function toolbar

| Scenario | Required observation | Requirements |
| --- | --- | --- |
| Visible shortcuts | The row below the function input lists installed mnemonics in catalog order with title tooltips; pack management occupies its right edge. | REQ-SH-017 |
| Bare fresh launch | With SLOW running and a different draft command in the input, click SLOW. A new invocation starts with no tail, displays SLOW in the input, discards the old form draft, and receives fresh buffered input. | REQ-SH-002, REQ-SH-005, REQ-SH-017 |
| Active highlight | Editing the input does not move the current-function highlight. Switching functions moves it; cancellation clears it. | REQ-SH-017 |
| Overflow | Narrow the row. Every shortcut remains present either as a button or a More item, in the same order. Activating an overflow item launches once. Widening the row restores the shortcuts. | REQ-SH-017 |
| Installed catalog changes | Apply an independent pack; its shortcuts appear. Refreshing added/removed catalog entries preserves the open invocation, input draft and keyboard focus. | REQ-PK-007, REQ-SH-017 |

## Host runtime compatibility

| Scenario | Required observation | Requirements |
| --- | --- | --- |
| Compatible runtime replacement | Keep function artifact bytes and revision unchanged, replace the host runtime with another generation in the same epoch, and start a worker/view. The new SDK takes effect without reading or applying changed source. An existing document keeps its old runtime and draft. | REQ-PK-011 |
| Incompatible installed artifact | Start with a legacy missing-epoch artifact or a different epoch. Its worker is never imported; its functions show Update required. Other packs work, identities remain reserved and saved data remains. A compatible rebuild and explicit Apply restore access. | REQ-PK-012 |
| Source compatibility | Check registered source against the current SDK without applying it. A missing source or type error yields non-success; unsupported SDK exports fail clearly instead of hanging at launch. | REQ-PK-003, REQ-PK-012 |

## Runtime cache reclamation

| Scenario | Required observation | Requirements |
| --- | --- | --- |
| Live generation leases | Select a new runtime while an old document is open, then sweep. The current generation and all old generations with live owners remain; the old WebView can request a previously uncached module URL. Releasing the final owner reclaims the old generation. | REQ-PK-011, REQ-PK-013 |
| Process exit | Another app process holds a generation lease. Sweeping leaves it intact; killing that process releases the lease and later cache activity reclaims it. | REQ-PK-013 |
| Cleanup boundaries | Reclaim abandoned staging/trash and unleased generation folders. Preserve unknown entries, symlinks, application data and source runtime files. A malformed lease is retained and logged; later activity retries after repair. A sweep never waits for an in-progress selection. | REQ-PK-013 |

## Agent pack control and installation effects

| Scenario | Required observation | Requirements |
| --- | --- | --- |
| Headless agent delivery | A CLI process adds, inspects, builds and applies a pack through the shared authenticated API with no native window. Test artifact and prepared candidate revisions match for unchanged source/toolchain. JSON results and non-success error exits are machine-readable. | REQ-PK-014 |
| Stale candidate | Missing, malformed or superseded candidate revisions fail before admission closes or installation identity changes. A lost/malformed management response is not retried. | REQ-PK-007, REQ-PK-014 |
| Client-neutral effects | Publish an update using the CLI while its view is open. The host lifecycle handler relaunches the bare mnemonic, clears draft/navigation and preserves unrelated functions. Failed UI Apply keeps the existing invocation/draft. External removal cancels the open function. | REQ-PK-008, REQ-PK-014 |
| Pinned bridge | Publish new metadata before host reconciliation. An existing invocation retains its old operation mutability and revision; old calls are never relabeled as the new code version. | REQ-PK-007 |
