# Layers

Four declared trees, one per package, listed in `lint/policy/declared-trees.ts`. Each has a `package.json`
`"imports"` alias, so an import's layer is readable from its specifier.

| Tree | Alias | Server-only | Feature layers |
|---|---|---|---|
| `packages/core/src` | `#core/` | no | `operations/` |
| `packages/cli/src` | `#cli/` | yes | `controllers/` |
| `packages/mcp/src` | `#mcp/` | yes | `controllers/` |
| `apps/review/src` | `#review/` | no | `ui/ → controllers/ → service/ → repo/` |

Anything outside these roots (`test/`, `scripts/`, `lint/`, `demo/`, root config, `apps/review/vite.config.ts`)
is ungoverned: tree-scoped rules are silent there. Only module mocking, file size, doc budgets and the
out-of-tree comment rule still run over it.

## Positions in core

| Position | Owns | May import at runtime |
|---|---|---|
| `domains/<d>/` | Pure rules and schemas: places, scope math, lifecycle, similarity, views | other domains, `shared/`, pure `effect` specifiers |
| `shared/` | Cross-cutting pure atoms (`InvalidTasteInput`, `CorruptRecordFile`, `TasteSurface`) | `shared/`, `effect` |
| `infrastructure/` | Files, yaml, SQLite, git, home directory, locks, ids | infrastructure, shared, `env.ts`, packages |
| `features/<f>/operations/` | One user-visible operation each, plus its text rendering | domains, shared, infrastructure, granted feature barrels |
| `env.ts` | The only `process.env` reader and writer; `TASTEBUD_STORE` is the one variable | — |

Infrastructure never imports upward. The record index takes its tokenizer, decoder and search projection as
arguments, so it knows storage rows and nothing about records.

## Positions in the shells

| Position | Owns |
|---|---|
| cli `routes/tastebud-command.ts`, mcp `routes/mcp-server.ts` | The root route: mounts command groups or tool handlers |
| cli/mcp `features/<f>/controllers/` | A command group or tool set, running an operation for that surface |
| cli/mcp `infrastructure/tastebud-core.ts` | The door to non-domain core subpaths |
| review `routes/` | Thin file routes: `createFileRoute`, search validation, a page from a feature |
| review `features/<f>/ui/` | Pages, components, query options, hooks |
| review `features/<f>/controllers/` | `createServerFn` modules with validators, exporting only server functions |
| review `features/<f>/service/` | Mapping operation results to review outcomes (often a passthrough) |
| review `features/<f>/repo/*.server.ts` | Calling core through `infrastructure/tastebud-core.server.ts` |
| review `shared/`, `shared/ui/` | Cross-feature helpers, query keys, refresh bundles, the theme, wrapped Mantine parts |

The review layering is uniform even where a layer passes through, so the place for a change never depends on
the feature. `health/trampolines` warns on those passthroughs; that warning is accepted.

## Where a change goes

| Change | Place |
|---|---|
| A rule about scopes, kinds or records that needs no IO | a core domain |
| Reading or writing store files, the index, git | core `infrastructure/` |
| A new thing agents or the reviewer can do | a core feature operation, declared in `operation-registry` |
| A CLI flag or command | `packages/cli/src/features/cli-operations/controllers/` |
| An MCP tool | nothing: tools are listed from the operation registry |
| A review screen | `apps/review/src/features/<f>/ui/`, routed from `routes/` |
| A key a write makes stale | a bundle in `apps/review/src/shared/query-keys.ts` |

## Barrels and grants

Each feature exposes `index.server.ts` (server surface) and, only if it has a client-safe surface, `index.ts`.
Barrels list their exports explicitly and re-export only their own unit. Another feature may import a barrel
only when the importee's `visibility.json` grants it, keyed by importer with a reason:
`{"operation-registry": "declares this feature's operations in the registry"}`. Cycles between features fail.
