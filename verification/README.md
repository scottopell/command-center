# CommandCenter verification

Fresh results for this repository are recorded after running the local checks. Code and requirement mappings are in [requirements.json](requirements.json); the behavioral acceptance journeys are in [the specification checks](specs/acceptance.md).

- `npm run check`: TypeScript, function source guards, backend, CLI, persistence and HOST fixtures.
- `npm run check:specs`: requirement identity, status/link validation and Allium analysis.
- `npm run build`: UI and worker bundles plus the native app.
- `npm run test:native`: actual WebKit, isolated backend stores, lifecycle/input/cancellation checks, and repeated disposal samples.

Native display-flush timing is separate from compositor presentation and backend readiness. The benchmark records actual activation/visibility state; it does not promise fixed RSS, garbage collection timing or performance under arbitrary OS stalls. Cold application startup is not part of the running-app visual SLO.

See [the current result summary](summary.json), [static and backend results](check-results.txt), [native results](native-results.txt), [native samples](native-benchmark.json). No live ticket payloads or client credentials are stored here.


Retained navigation adds actual WebKit Back, loading/error/authority and primary viewport checks. Query tests exercise the real TanStack client with inactive-cache clock advancement, superseded reads, unknown attempts and writes completing after pop/disposal. Response-cap tests use large fixture records and verify that an uncertain reply does not duplicate a committed comment. Acceptance obligations remain distinct from executed evidence; fixture repetition and serialized size indicators do not constitute heap-snapshot analysis.

Selection and sibling coverage uses private clipboard writers and a unique native pasteboard, leaving the general clipboard untouched during automated tests. Actual WebKit pointer selection, native Select All action routing, editable/programmatic exclusions, failure/size limits, stable collection membership, fresh sibling reads, replacement depth and keyboard repeat/editable behavior are exercised. No owner write API or canonical storage change is part of this feature.
