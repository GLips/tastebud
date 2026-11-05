`tk` tracks tickets in this repo. Titles = the deliverable; `--desc` = durable what & why; state lives in status/owner, never the description. Run `tk` for the full guide.

## Rules

`bun run check` is the gate: every package's typecheck, oxlint (catalog plus the `tastebud` plugin), the rule
specs (`check:rules`), the structural checks (`check:structural`), knip, oxfmt and `bun test`. It runs every
step and reports all failures. Fix the code, not the rule; a rule that is wrong for Tastebud is a decision for
Graham ([decisions](docs/architecture/decisions.md)).

**Four trees**, declared in `lint/policy/declared-trees.ts`, each with an import alias:
`packages/core/src` (`#core/`), `packages/cli/src` (`#cli/`), `packages/mcp/src` (`#mcp/`), `apps/review/src`
(`#review/`). Anything else is ungoverned. Import another package by name, never by path.

**Where work goes** ([layers](docs/architecture/layers.md)):

- Pure rules and schemas: core `domains/<d>/`. No IO, no clock, no randomness.
- Files, SQLite, yaml, git, locks: core `infrastructure/`. It never imports features or domains.
- Anything agents or the reviewer can do: a core `features/<f>/operations/` operation, declared in
  `operation-registry` ([how-to](docs/architecture/how-to/new-core-operation.md)).
- CLI commands: `cli-operations` controllers. MCP tools come from the registry.
- Review: `features/<f>/ui → controllers → service → repo` ([how-to](docs/architecture/how-to/new-review-feature.md)).

**The core door** ([boundaries](docs/architecture/boundaries.md)): shells import pure `@tastebud/core/<domain>`
subpaths anywhere. Non-domain subpaths (`operations`, `host`, features) are imported at runtime only in
`infrastructure/tastebud-core.ts` (cli, mcp) or `infrastructure/tastebud-core.server.ts` (review), and in review only
`repo/*.server.ts` imports that door ([server and client](docs/architecture/server-client-boundaries.md)).

**Barrels and grants:** a feature exposes `index.server.ts` (and `index.ts` if client-safe) with named
exports. Importing another feature's barrel needs a reason in its `visibility.json`.

**Errors** ([conventions](docs/architecture/error-conventions.md)): tagged errors in the lowest layer that
raises them, all in the `TasteError` union, shown only through `describeTasteFailure`. Match tags with
`Match`/`catchTag`, never `_tag` comparisons or `instanceof`.

**Environment:** `TASTEBUD_STORE` is the only variable, read only in core `env.ts`.

**Effect:** exported controllers and operations are `Effect.fn("<feature>.<export>")`. Decode outside data
with Schema at the boundary; no `as` casts.

**Review UI:** theme tokens (`gap="xs"`, `fz`, named `shadow`), no inline colours, sizes or styles. A
mutation refreshes through a bundle from `shared/query-keys.ts`. Render stays pure.

**Adapters:** an SDK has one owner module, listed in `lint/policy/package-owners.ts`
([how-to](docs/architecture/how-to/new-infra-adapter.md)).
