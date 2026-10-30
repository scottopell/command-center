# Round two — Adversarial interleavings and revised-contract audit

**Review basis:** the round-one-revised artifacts, re-read against the user’s command, cancellation, worker and persistence journeys. This is a second author-run adversarial pass. It is not an independent-agent opinion or a runtime experiment.

## Findings and resolutions

| Finding | Counterexample or ambiguity | Resolution in the revised spec |
| --- | --- | --- |
| R2-01 | A resolver completion for the current generation arrives twice. A generation-only check mounts the view twice or resets its draft. | Completion must match both identity and expected phase and be single-use. Unexpected completion/focus records are consumed without changing the current invocation. |
| R2-02 | Input arrives during the last drain step. A queued and a direct path both apply it, or the switch skips it. | One serialized handoff cutover: delivered operations are exactly a prefix of accepted operations. New input joins the tail until cutover. Add count, valid ordinal, unique ordinal, and exact delivered-prefix invariants. |
| R2-03 | Escape retires a view, but an old async callback calls DRQS.create through a still-live bridge. Backend independence was misread as permission for retired views to start work. | Revoke that invocation’s outbound bridge before new admission. Already-admitted operations remain independent. The backend does not require an open view. REQ-FF-008 and the framework boundary guarantee cover both sides. |
| R2-04 | A transaction commits, response construction fails, and the client is told it definitely failed. A retry creates another ticket. | A confirmed non-commit is distinct from an uncertain outcome. Add structured outcome-unknown handling and an uncertainty transition. No replay queue, recovery UI, idempotency subsystem, or automatic retry is introduced. |
| R2-05 | A queue request includes JSON claiming known_operation=true or valid_input=true. A model reader treats those facts as caller-controlled. | Mark them as trusted ingress observations derived from registry/schema checks, not accepted envelope fields. Initialize request-control state at ingress. |
| R2-06 | A read-only HOST view declares valid focus, but the operator typed text while it loaded. The replay engine hunts for some input. | A container is valid focus, not an editable sink. Report undeliverable queued text; never fall back to the command bar or an unrelated control. |
| R2-07 | “Immediate” input acceptance is interpreted as resolver readiness within 500 ms, or a benchmark passes only warm views. | Define continuous capture ownership from command admission. Separate visual frame, capture, resolution, focus, handoff, cold app startup and backend startup. First function use is included in the running-app visual experiment; no p95 substitution. |
| R2-08 | The parser uppercases the whole tail or tokenizes search words as more commands. The illustrative groupId prop does not match the reference parser’s group field. | Keep tails intact at the shell boundary. DRQS owns action parsing, consumes separator whitespace, preserves internal search text, and uses one internally consistent typed result. No dependence on the old parser's property names. |
| R2-09 | A mounted view throws before it can produce a focus result. The lifecycle remains mounting forever. | Add an explicit render-failure transition that stops handoff and exposes an error. Escape remains available. |
| R2-10 | The formal shell has no initial empty state, so invariants may assume an arbitrary generation/focus state. | Add an explicit default command-center state with generation zero, empty screen and command focus. Retired entities remain specification history only. |
| R2-11 | “Release retired memory” becomes an assertion that operating-system RSS must fall immediately or the runtime must kill one process per function. | Keep the requirement to relinquish platform-owned references. Document that allocation/GC/process caches are not lifetime ownership. Require retention-path experiments and bounded inactive hosts rather than a general process pool. |
| R2-12 | An owner string appears employee-verified because it resembles an email. A backend credential is confused with author identity. | Validate owner-reference format but explicitly retain client-supplied attribution. The local credential authorizes access; it does not prove employee identity or turn the app into a multi-user system. |

## Highest-leverage findings

1. **Bridge revocation and backend independence must coexist.** Their distinction removes a tempting but expensive backend cancellation protocol while preventing stale UI calls.
2. **Ordered counts are not enough.** Input properties need sequence identity, an exact delivered prefix and one handoff point. The real WebKit adapter still has to establish those properties.
3. **Uncertainty is an error category, not a recovery subsystem.** Ordinary reads and honest reporting meet the approved scope without hidden retries or distributed idempotency machinery.
4. **The lifecycle model must include failure before focus.** Otherwise the nicest path is modeled while rendering exceptions create an undocumented state.

## Hidden commitments checked

- A worker registration is intentionally service-long and may contain immutable operation definitions. UI invocation state is not service-long.
- All UI-originated backend calls pass the native bridge; disposable page content receives neither the local API credential nor a persistence handle.
- Direct local CLI clients can continue operating after the UI closes; UI generation identity is not a backend authorization requirement.
- Tail resolution only selects a route and prepares props. Mutation happens through explicit application operations, never an effect of navigation or first render.
- A local transaction gives atomic ticket/history changes and unique numbers. It does not provide an exactly-once HTTP guarantee or cancel a commit when a window disappears.
- Code required only by remote access, live subscriptions, dynamic plugins, arbitrary editor replay or background job recovery remains excluded or under a proposed UX tradeoff.

## Complexity collapses retained

One listener; one shared service; built-in worker registrations; typed schema-validated messages; one local transactional database; explicit refresh; immutable original reports with append history; local client-supplied attribution; read-only HOST; SLOW as a test fixture. No added scheduler, message broker, event bus, plugin marketplace, synchronization layer, actor-per-function process model, or custom web rendering framework.

## User-dependent reductions

At the completion of this round, three concrete proposals awaited user input: limited loading-time editing, submission only after readiness, and a snapshot-style unload hook. The baseline was not silently weakened. ADR-004 and ADR-005 held the forks. See the review executive summary for subsequent user decisions and the corresponding coordinated requirement/model/acceptance updates.

## Validation limits

The Allium checker and process analyser establish structural consistency of the modeled subset. They do not prove the semantics of prose guarantees, native input delivery, React/browser integration, cleanup preemption, SQL transaction behavior, memory reclamation, or the 500 ms SLO. No application implementation is present, so spec-to-code alignment and runtime acceptance tests are intentionally not claimed.
