# Boundaries

## Packages and their owners

An SDK is imported only by its owner module (`lint/policy/package-owners.ts`, checked by
`boundary/sdk-containment`). Everything else calls the owner.

| Package | Owner |
|---|---|
| `bun:sqlite` | `packages/core/src/infrastructure/record-index/` |
| `yaml` | `packages/core/src/infrastructure/frontmatter-codec.ts` |
| `@modelcontextprotocol/server` (and `/stdio`) | `packages/mcp/src/infrastructure/mcp-sdk.ts` |
| `@taste/mcp` | `packages/cli/src/infrastructure/mcp-server.ts` |
| `@taste/review` | `packages/cli/src/infrastructure/review-app-server.ts` |
| `@mantine/core` `Textarea` | `apps/review/src/shared/ui/textarea.tsx` |

`effect`, React, TanStack, StyleX, Mantine (except `Textarea`) and `lucide-react` are the framework and are
unconstrained, except where the rules below fence them.

IO is the infrastructure layer's job in every tree. `taste/io-only-in-infrastructure` bans `node:fs`,
`node:child_process`, `node:os`, `node:crypto`, `bun:sqlite`, `Bun.spawn`/`file`/`write`/`stdin` and the
`process` streams, exit and argv outside `infrastructure/`. `taste/no-ambient-nondeterminism` bans
`Date.now()`, bare `new Date()`, `Math.random()` and random ids in domains, shared and feature layers; time
comes from Effect `Clock`, ids from `infrastructure/record-ids.ts`. `process.env` is touched only in core's `env.ts`.

## The core door

`@taste/core` has no root export. Shells import:

- `@taste/core/<domain>` (`places`, `kind-catalog`, `record-views`, …): pure and client-safe, importable anywhere.
- `@taste/core/operations`, `@taste/core/host` and feature subpaths: server code.

`taste/core-server-door` allows a runtime import of a non-domain subpath in exactly one file per shell:
`infrastructure/taste-core.ts` in cli and mcp, `infrastructure/taste-core.server.ts` in review. In review, only
`features/*/repo/*.server.ts` may import that door. Type-only imports, which erase, are free.

`taste/domain-runtime-packages` keeps core `domains/` and `shared/` to pure `effect` specifiers (root modules,
`effect/schema`, `effect/encoding`) and other domain subpaths, since domains reach the browser through their barrels.

## Between trees

A package imports another by its name, never by path: the global `no-restricted-imports` bans
`**/packages/*/src/**` and `**/apps/*/src/**`, and `taste/relative-imports-stay-in-tree` rejects a relative
specifier that resolves outside its tree. Each package typechecks alone and installs are isolated, so a
missing dependency fails there too. Inside a tree, cross-directory imports use the alias (`#review/shared/…`);
relative imports stay within a directory.

## Declared and ungoverned

`lint/policy/declared-trees.ts` is the only list of governed roots. A directory not under one is ungoverned
and nothing reports that. Adding a package means declaring its tree, with the vocabulary its directories use,
before writing code in it. `test/`, `scripts/` and `lint/` are deliberately outside: they are checked for file
size, module mocking and comment length only.
