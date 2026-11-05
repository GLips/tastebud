# Add a core operation

An operation is one thing an agent or the reviewer can do. It is declared once and every shell reaches it
through the registry.

1. **Domain first.** Put any pure rule it needs (scope math, a record shape, a text helper) in a core domain,
   `packages/core/src/domains/<d>/`, exported from the domain's `index.ts`. No IO, no `Date.now()`.
2. **The operation.** Add `features/<f>/operations/<verb-noun>.ts` with an `Effect.fn("<f>.<export>")`
   that takes the decoded input and yields `TasteStore` (only `TasteStoreRoot` for a config operation, which runs before a store exists) and other services. Read and write the store only
   through `record-store` and infrastructure. Raise failures as tagged errors at the lowest layer that knows
   about them ([error-conventions.md](../error-conventions.md)), and add new ones to `TasteError`.
3. **Its text.** Add `render<Thing>Text(result)` beside it for the CLI's non-JSON output.
4. **Export it.** List the operation, its input schema, result schema and renderer in the feature's
   `index.server.ts`. If the feature is new, give it a `visibility.json` granting `operation-registry`, and a
   core `package.json` export only if a shell imports it directly.
5. **Declare it.** Add a `declareTasteOperation({ name, audience, kind, description, input, output, run,
   renderText })` entry to `agent-operations.ts`, `store-root-operations.ts` or `human-operations.ts` in
   `features/operation-registry/operations/`. If it needs to know where the caller is, include the context
   fields from `ContextOverrideInputSchema` in its input; the registry resolves context only for inputs with `in`.
6. **CLI command (agent operations).** Add the command in the matching
   `packages/cli/src/features/cli-operations/controllers/*-commands.ts`, calling
   `runCliOperation("<name>", input, options)`. Flags come from `shared/cli-flags.ts`.
7. **MCP tool.** Nothing to do: tools and their input schemas are listed from the registry.
8. **Review (human operations).** Call it from a review repo; see
   [new-review-feature.md](new-review-feature.md).
9. **Tests.** `test/operation-surface-parity.test.ts` fails until the operation is reachable from its audience.
   Add behaviour tests through a public surface (`test/lifecycle.test.ts`, `test/cli.test.ts`), with real files
   in a scratch store.

Run `bun run check`.
