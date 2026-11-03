# CommandCenter verification

Fresh results for this repository are recorded after running the local checks. Code and requirement mappings are in [requirements.json](requirements.json); the behavioral acceptance journeys are in [the specification checks](specs/acceptance.md).

- `npm run check`: TypeScript, function source guards, backend, CLI, persistence and HOST fixtures.
- `npm run check:specs`: requirement identity, status/link validation and Allium analysis.
- `npm run build`: UI and worker bundles plus the native app.
- `npm run test:native`: actual WebKit, isolated backend stores, lifecycle/input/cancellation checks, and repeated disposal samples.

The 500 ms transition contract ends at the framework responsiveness checkpoint, independently of input ownership, buffer length and application-data reads. It is not a compositor-presentation measurement. The native display-flush benchmark is a separate historical metric; it does not prove transition readiness or promise fixed RSS, garbage collection timing or performance under arbitrary OS stalls. Cold application startup is outside the running-app transition contract.

See [the current result summary](summary.json), [static and backend results](check-results.txt), [native results](native-results.txt), [native samples](native-benchmark.json). No live ticket payloads or client credentials are stored here.


Retained navigation adds actual WebKit Back, loading/error/authority and primary viewport checks. Query tests exercise the real TanStack client with inactive-cache clock advancement, superseded reads, unknown attempts and writes completing after pop/disposal. Response-cap tests use large fixture records and verify that an uncertain reply does not duplicate a committed comment. Acceptance obligations remain distinct from executed evidence; fixture repetition and serialized size indicators do not constitute heap-snapshot analysis.

Selection and sibling coverage uses private clipboard writers and a unique native pasteboard, leaving the general clipboard untouched during automated tests. Actual WebKit pointer selection, native Select All action routing, editable/programmatic exclusions, failure/size limits, stable collection membership, fresh sibling reads, replacement depth and keyboard repeat/editable behavior are exercised. No owner write API or canonical storage change is part of this feature.

Runtime-pack coverage builds the included NOTES fixture with the packaged SDK/compiler, installs and updates it, removes the source folder, checks storage identity isolation, rejects collisions and stale revisions, injects a startup failure, and drains a disconnected caller's admitted write. Native tests exercise Apply & Relaunch, retained command focus, and browsing a forced straggler through STRAG. Detector unit tests use an injected monotonic clock; no exact pixel-presentation assertion is claimed. Test stores and collectors are isolated from the operator's records.

The [pack management UI checks](pack-management.json) separately cover its compact, top-aligned layout, installed function names, state-specific actions, stable polling, and request/error recovery. Five UI tests and the three existing pack integration tests pass; fixture views are rendered for visual inspection. This focused run does not replace the recorded full-suite results.

The [compact shell checks](compact-shell.json) cover all 43 functional native cases: function toolbar launches, overflow, current-function highlighting, catalog refresh, inline Back/sibling controls, input handoff, DRQS and selection. This final UI run excludes the long retention soak; its prior pass and later test-host interruption are recorded separately. DRQS submission waits for the enabled action, independently of screen readiness; native pointer-selection fixtures activate their own window.
