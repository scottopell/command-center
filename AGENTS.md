# CommandCenter

Native AppKit command shell, disposable WebKit/React function views, and a separate local Function Worker service. Built-ins are DRQS, HOST, SLOW and STRAG.

- Keep the public function API narrow: metadata, synchronous preparation and View; ordinary controls and cleanup.
- Preserve focus-dependent Escape, fresh invocations and the native input handoff boundary.
- Source, schemas and specifications live together. Requirements retain their permanent IDs.
- Verify with `npm run check`, `npm run check:specs`, `npm run build`, and `npm run test:native` as appropriate. Native tests require a macOS desktop session.
- Keep generated builds, credentials, live app data and machine-local configuration out of Git.
- V1 integrations add useful frontend functions over existing services. Moving application ownership or data into this platform is v2 work.

- Runtime packs use the standalone SDK, immutable host-owned builds and stable pack/function storage identities. Do not revive source composition or a global installed-function type union.
- Keep readiness independent of input ownership and data loading. Straggler detection never cancels a transition.
