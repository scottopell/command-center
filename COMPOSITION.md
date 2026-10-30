# Build-time function composition

The public checkout builds by itself with DRQS, HOST, and SLOW. `npm ci` configures the public registry. Supported check/build scripts configure again before use, so a prior composed build cannot silently select private sources for a public build.

A trusted local extension checkout can opt in explicitly:

```sh
COMMAND_CENTER_EXTENSION=/absolute/path/to/extension npm run check
COMMAND_CENTER_EXTENSION=/absolute/path/to/extension npm run build
COMMAND_CENTER_EXTENSION=/absolute/path/to/extension npm run test:native
```

The extension provides `extension.json`, `contracts.ts`, `workers.ts`, and `ui.ts`:

- `extension.json`: `commands` containing unique uppercase `mnemonic` and `title` fields, plus `localSourceOrigins` containing exact loopback HTTP origins.
- `contracts.ts`: exports `privateContracts`, mapping function mnemonics to operation schemas built with `operation` from `@command-center/contracts/core`.
- `workers.ts`: exports `createWorkers()`, returning workers defined against those schemas.
- `ui.ts`: exports `privateFunctions`, mapping mnemonics to ordinary framework function definitions.

The extension's local file dependencies can reference the public `packages/contracts`, `packages/ui`, `packages/backend`, and `packages/cli` packages. These expose source import paths through package exports. Install dependencies in both checkouts. The configured build deduplicates React, React DOM, TanStack Query, and Zod in the browser bundle.

Configuration generates ignored files under `.generated/`: typed operation, UI and worker registries; the native command/source catalog; and the selected TypeScript inputs. Generated content is build output and may contain private schemas and paths. It must stay out of Git. The composed tests, native test sources, source guards, and specification checks include the extension checkout. Public checks include only public sources.

Both modes use the same app/service output locations. The most recent build selects the resulting binary. Build from the intended checkout immediately before installation; never publish a composed binary as a public release. There is no runtime source loading, automatic sibling discovery, plugin installer, or compatibility negotiation.
