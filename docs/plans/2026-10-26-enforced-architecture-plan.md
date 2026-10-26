# Enforced architecture plan for Taste

Repo state: HEAD `e1aa96c`, which is the Bun workspace split into `@taste/core`, `@taste/mcp`, `@taste/cli` and
`apps/review`. This is a **migration** plan for a codebase that already exists. It was produced by Phases 1–5 of the
`enforced-architecture` skill. It also answers whether the tk2 rules came in: yes. tk2's Effect v4 `effect/` tag
and tk2's structural `effect/` checks are adopted. The tk2 `tk-plugin` idea becomes a `taste/` plugin of five
rules. `no-long-comments` and the cross-package path ban are kept.

Constraints for whoever executes this plan:

- Never write to `demo/.taste`.
- Leave the review server on `:4747` alone.
- Do not commit until Graham asks. "Commit" below means "a reviewable unit".

## 1. Decision Summary

Graham decided the following. They are fixed, so do not relitigate them.

| Decision | Choice | Reasoning |
|---|---|---|
| `@taste/core` layout | `features/<name>/` (operations + `errors.ts`), `infrastructure/`, `domains/`, `shared/` | Operations are the product, IO is a small set of adapters, and the rest is pure logic. |
| `domains/` | Pure logic, no IO. Holds today's `shared/` (places, vocabulary, catalog-view) plus similarity, scope math, lifecycle, views | The review UI can then reuse it in the browser, and tests stay IO-free. |
| Review → core | Review imports only domains and types from core at runtime, except through one server-only infrastructure door | The browser bundle cannot reach `bun:sqlite`, `yaml` or `node:*` by construction. Today only `vite` importProtection guards this. |
| `apps/review` layering | tk2's full feature layering `ui → controllers → service → repo`, even where a layer is a passthrough | Every feature has the same shape, so an agent always knows where a change goes. `health/trampolines` warns on the passthroughs, and that warning is accepted. |
| Errors | Typed per feature as Effect tagged errors in `errors.ts`. `describeTasteFailure` stays the single mapper to the CLI, MCP and review envelopes | One envelope, one mapper. Because of that, tk2's `effect/require-failure-disclosure` is **not** copied (see §4). |
| Env | One `env.ts` in core. `TASTE_STORE` is the only variable | `TASTE_REVIEW_URL` goes away (see §2.1, `record-browsing`). |
| Docs | A CLAUDE.md rules section plus `docs/architecture/`, under word budgets | See §6. |

These are the configurable choices made in this plan, with the reason for each:

1. **Four declared trees, one per package.** Each package gets a `package.json` `"imports"` alias (`#core/`,
   `#cli/`, `#mcp/`, `#review/`), so an import's layer can be read from the specifier. Cross-package imports stay
   by package name. The existing global `no-restricted-imports` path ban is kept, because nothing in the catalog
   reports one declared tree importing another tree's files by path.
2. **Errors live in the layer that raises them, not only in a feature.** Several errors are raised by
   infrastructure or a domain (`CorruptRecordFile` in the frontmatter codec, `UnknownKind` in the kind catalog).
   Under `boundary/server-no-upward` and `placement/layer-direction`, infrastructure cannot import a feature's
   `errors.ts`. So each error is declared at the lowest layer that raises it: `infrastructure/store-errors.ts`,
   `domains/<d>/errors.ts` or `features/<f>/errors.ts`. `features/operation-registry/operations/taste-error.ts`
   is the union that `describeTasteFailure` matches. This departs from "per feature", and it is the only shape
   the direction invariant allows.
3. **The domain runtime-package policy is widened by one area.** The catalog's `DOMAIN_RUNTIME_AREAS =
   ["domain","shared"]` would ban `effect` (Schema, Match, Option) in every domain. Taste's domains are written in
   Effect Schema, so `"package"` is added. That is the catalog's documented adaptation point.
   `taste/domain-runtime-packages` then narrows it back to `effect` (not `effect/unstable/*`) and the core
   domain subpaths. **Suggest an ADR** for this edit. Graham decides; do not write one.
4. **Core exposes one export subpath per shell-facing barrel.** The `api/feature-barrel` row is `{}`, so a barrel
   cannot re-export another feature. The `"."` root export is dropped. Shells import
   `@taste/core/<domain>` (pure), `@taste/core/<feature>` (server) or `@taste/core/host` (env + store root).
   `./host` is the barrel of a `store-host` feature, not a source-root file, because the `source-root` row denies
   feature imports and `tasteStoreFromEnv` composes `record-store`.
8. **CLI and MCP are server-only trees.** Their declarations set `serverOnly: true`, a new vocabulary field read
   by `isServerContext` (`policy/declared-trees.ts`), so every file in them is a server context. A directory name
   cannot establish that. Record in `decisions.md` as a catalog policy edit.
5. **tk2's `effect/` tag replaces the skill's.** Taste runs Effect `4.0.5`. The skill's `effect/` tag targets v3
   spellings (`catchAllCause`, `catchAll`), and tk2's targets v4 (`catchCause`, `Effect.catch`).
6. **Feature-graph thresholds are off, and cycles still block.** `feature-deps` `fanOutThreshold` and
   `totalEdgeThreshold` are set to `Number.POSITIVE_INFINITY`. The reason, as in tk2: every edge is argued in the
   importee's `visibility.json`, so a count adds nothing.
7. **Files are split, not exempted.** `cli/src/demo/seed-demo-store.ts` (805 lines) and
   `core/src/operation.ts` (511 lines) split so that `health/file-size` keeps its 500/600 defaults with no
   exclusion list.

## 2. Phase 1 audit

These findings come from reading every file at `e1aa96c`. They are what the gate would report today, grouped by
invariant.

### 2.0 Whole workspace

- **No declared trees, no catalog, no structural tier.** `.oxlintrc.json` runs these rules:
  - `taste/no-long-comments`
  - five `typescript/*` rules
  - `import/no-cycle` and `eqeqeq`
  - the cross-package `no-restricted-imports` path ban
- **Effect language-service severities are inline in `tsconfig.base.json`.** tk2 keeps them in
  `tsconfig.effect.json` with a drift test, and Taste has neither.
- **Client/server separation is guarded only by `vite.config.ts` `importProtection`** (`bun:sqlite`, `/^node:/`,
  `**/*.server.*`, `packages/core/src/*.ts`, `packages/core/src/render/**`). That catches a leak only at
  build or dev time, not at lint time, and not for `yaml` or `effect/unstable/*`.
- **lefthook** has `format`, then `lint` (staged) + `typecheck` + `bun test` in parallel. There is no structure
  job.
- **`scripts/check.ts`** typechecks five programs via `@effect/tsgo` and runs `lint`, `knip`, `format:check` and
  `test`. There is no rule-spec run and no structural run.

### 2.1 `packages/core`

Every source file is flat or in `shared/` / `render/`, so all of them are unclassified.

| Invariant | Finding | Paths |
|---|---|---|
| Unclassified source | 47 files, none in a declared position | all of `packages/core/src/**` |
| IO scattered across logic | `node:fs` in `config`, `decide` (lock file), `listener`, `store`, `store-files`, `index-db`. `Bun.spawn` git in `place-resolution`. `os.homedir` in `place-resolution` and `scope-input`. `randomUUID` and `Date.now` in `decide`. `new Date()` in `listener` | as listed |
| Ambient env | `process.env` in `place-resolution` (git env, resolver env) and `review-url` (`TASTE_REVIEW_URL`) | `place-resolution.ts`, `review-url.ts` |
| SDK containment | `bun:sqlite` is in `index-db.ts` only, so the boundary holds informally. `yaml` is in `frontmatter.ts` only, also informal | — |
| DB isolation | `store.ts` holds the index handle and reopen logic beside the `TasteStore` service. `index-db.ts` imports domain `similarity` (`normaliseTokens`) and `records` (`TasteRecordSchema`) | `store.ts`, `index-db.ts` |
| Barrels | The root `index.ts` re-exports nearly everything, so the server-only and pure surfaces are one door | `index.ts`, `package.json` `exports["."]` |
| Error placement | All 19 errors are in one `errors.ts` next to `describeTasteFailure` | `errors.ts` (356 lines) |
| Manual tag comparison | `describeTasteFailure`'s `retryFieldsOf` uses `switch (error._tag)` with a `default`, and `error._tag === …` appears in several places | `errors.ts` |
| File size | `operation.ts` 511 lines: registry + caller + listing + runner | `operation.ts` |
| Mixed render | `render/operation-text.ts` renders every operation's result in one file, coupling every feature | `render/operation-text.ts` |
| Span names | `Effect.fn("taste.x")` throughout. `effect/controller-effect-fn` wants `"<feature>.<export>"` | operations |

### 2.2 `packages/mcp`

| Invariant | Finding | Paths |
|---|---|---|
| Unclassified source | One file: SDK server + transport, JSON-schema building and tool dispatch | `src/server.ts` |
| Ambient env | `process.env.TASTE_STORE` | `src/server.ts` |
| SDK containment | `@modelcontextprotocol/server` and `/stdio` sit beside tool logic | `src/server.ts` |

### 2.3 `packages/cli`

| Invariant | Finding | Paths |
|---|---|---|
| Unclassified source | 9 files | all of `src/**` |
| Ambient process | `process.argv` (`main`), `process.exitCode` (`cli`), `process.env` / stdout / `Bun.stdin` (`runtime`), `Bun.spawn` (`commands` openInBrowser, `review` vite), `process.exit` / `performance.now` (`hook-prompt`), `node:fs` + `Date.parse` (`seed-demo-store`) | as listed |
| File size | `seed-demo-store.ts` 805 lines | `src/demo/seed-demo-store.ts` |
| Mixed concerns | `commands.ts` (397 lines) is the command definitions, the operation runner and the browser opener | `src/commands.ts` |

### 2.4 `apps/review`

| Invariant | Finding | Paths |
|---|---|---|
| Unclassified source | 46 of 53 files (all of `ui/`, `server/`) | `src/ui/**`, `src/server/**` |
| Route thinness | `routes/index.tsx` is 327 lines with `localStorage` reads. `places.tsx` uses `useLocalStorage`. Every route renders its page inline | `src/routes/*.tsx` |
| Server functions | About 12 `createServerFn` in one module with no feature ownership. Validators exist | `src/server/review-functions.ts` |
| Ambient globals | `process.env.TASTE_STORE` in `taste-store.server.ts`. `localStorage` in `routes/index.tsx`, `ui/review-session-log.ts`, `routes/places.tsx` | as listed |
| Core runtime surface | `server/taste-store.server.ts` and `review-functions.ts` import core server code. `ui/*` imports `@taste/core/places`, `vocabulary` and `catalog-view` (pure, which is fine) | — |
| Router infra | `QueryClient` is built inside `router.tsx` | `src/router.tsx` |
| Style | 65 raw HTML elements, 38 `style={{}}` props, 26 `stylex.create` sites. Mantine `Textarea` is used directly in 3 files | `src/ui/**`, `src/routes/**` |
| Theme | `ui/theme.ts` has a green ramp as hex with no explicit spacing/radius scales | `src/ui/theme.ts` |
| Hooks in shared atoms | `ui/derivation-link.tsx` calls a hook to look up kind | `src/ui/derivation-link.tsx` |
| Polling | `REVIEW_POLL_MS` in `review-queries.ts` is deliberate, so tk2's `no-refetch-interval` is not adopted | `src/ui/review-queries.ts` |

### 2.5 Outside the trees

`test/` (`cli`, `config`, `hook`, `lifecycle`, `mcp`, `places`, `seed`, `support.ts`), `scripts/`, `lint/`,
config files, `skills/`, `apps/review/public/`, `apps/review/postcss.config.cjs`, `knip.jsonc` and `demo/`.
Tests import the core root `@taste/core`. So do 27 review files (type-only), `server/taste-store.server.ts`,
`server/review-outcome.ts`, and cli `commands`, `runtime`, `review`, `hook-prompt`, `demo/demo-config`,
`demo/seed-demo-store`, and mcp `server.ts`. Review also imports `/vocabulary` and `/catalog-view`. All of them
move to subpaths in the same step that swaps the exports (A5).

## 3. Target Architecture

### 3.1 Vocabulary per tree

| Position | core | cli | mcp | review |
|---|---|---|---|---|
| Feature dir | `features/<f>/` | `features/<f>/` | `features/<f>/` | `features/<f>/` |
| Feature layers | `operations/` (controllers role) | `controllers/` | `controllers/` | `ui/ → controllers/ → service/ → repo/` |
| Domains | `domains/<d>/` | `domains/<d>/` | `domains/<d>/` | — |
| Infrastructure | `infrastructure/` | `infrastructure/` | `infrastructure/` | `infrastructure/` |
| Shared | `shared/` | `shared/` | — | `shared/`, `shared/ui/` |
| Routes | — (no router) | `routes/` (root route only) | `routes/` (root route only) | `routes/` (TanStack file routes) |
| Root route | — | `taste-command` | `mcp-server` | `__root` |
| Server entry | — (none; `./host` is a feature barrel) | `main` | `index.server` | `start` |
| Env module | `env` (`"env-server"`) | — | — | — |
| `serverOnly` | false | true | true | false |

### 3.2 `packages/core/src` (every existing file mapped)

```
packages/core/src/
  env.ts                                  ← place-resolution.ts (git env, resolver env), review-url.ts (removed var),
                                            the TASTE_STORE read now in cli/mcp/review. The one process.env reader.
  shared/                                 runtime imports: `effect` (not `effect/unstable/*`) and shared only,
                                            because domains re-export it into the browser
    input-text.ts                         ← shared/input-text.ts
    invalid-taste-input.ts                ← errors.ts (InvalidTasteInput)
    corrupt-record-file.ts                ← errors.ts (CorruptRecordFile: raised by both the domain decoder and
                                            infrastructure, so it sits below both)
    taste-surface.ts                      ← operation.ts (TasteSurface)
    schema-problems.ts                    ← errors.ts (formatSchemaProblems)
  domains/
    places/                               ← shared/places.ts; pure parts of place-resolution.ts (normalizeRemote,
      index.ts, place-keys.ts,              placeKeysFromFacts); scope matching from recall.ts
      git-remote.ts, scope-match.ts
    taste-vocabulary/index.ts, …          ← shared/vocabulary.ts
    kind-catalog/                         ← catalog.ts, prompts.ts, shared/catalog-view.ts
      index.ts, kind-catalog.ts, kind-prompts.ts, catalog-view.ts,
      errors.ts                           UnknownKind, RetiredKind, KindNotRecallable
    records/                              ← records.ts; ids.ts (compareIsoTimes, formatLocalIsoTime, slugify);
      index.ts, record-schemas.ts,          frontmatter.ts (decode half: parseRecordFile body → record, failing
      record-times.ts, record-paths.ts,     with shared CorruptRecordFile); store-files.ts (recordRelativePath as
      record-file-format.ts,                "/"-joined string ops, no node:path; uniqueShortId);
      record-search-entry.ts                index-db.ts searchEntryOf (record → {kind, text}, injected into index)
    record-snapshot/                      ← store.ts (StoreSnapshot, buildStoreSnapshot,
      index.ts, store-snapshot.ts,          snapshotWithUnwrittenDerivations, candidatesForRef, resolve ref).
      record-refs.ts, errors.ts             Takes ReadonlyArray<TasteRecord>, never the IndexedRecord infra type.
                                          UnknownRecordRef, AmbiguousRecordRef
    derivation-lifecycle/index.ts, …      ← lifecycle.ts
    repeat-detection/                     ← similarity.ts, repeat-check.ts
      index.ts, token-similarity.ts, repeat-check.ts
    record-views/                         ← view-schemas.ts, views.ts
      index.ts, view-schemas.ts, record-views.ts
    derivation-scope/                     ← scope-input.ts (home passed in, not read), caller.ts
      index.ts, scope-input.ts              (canonicalInputPlaces, home passed in)
    taste-caller/index.ts, taste-caller.ts ← caller.ts (TasteCaller, requireAgentActor, hasContextOverride)
    record-text/index.ts, text-helpers.ts, ← render/text-helpers.ts; render/recall-text.ts (formatContextLine,
      context-line.ts                       used by recall, store-catalog and record-browsing text)
    store-config/index.ts, config-schema.ts ← config.ts (TasteConfig schema, types, defaults)
  infrastructure/
    store-errors.ts                       ← errors.ts: StoreNotInitialised, InvalidConfig,
                                            StoreWriteFailed, DecisionLockTimeout, PlaceResolutionFailed
    record-files.ts                       ← store-files.ts (writeFileExclusive, atomic write with process.pid temp
                                            names, listRecordFiles, index dir paths, node:path join of root +
                                            the stored relative path)
    frontmatter-codec.ts                  ← frontmatter.ts (yaml owner: parse/stringify only)
    record-index/                         ← index-db.ts, store.ts (openIndexHandle, reopenIfReplaced, inode check)
      record-index.ts, index-handle.ts,     bun:sqlite owner. Its contract is a storage row
      index-search.ts, index-rows.ts        (IndexRow: id, type, path, mtime, size, body) plus an injected
                                            tokenizer, decoder and search projection (record → {kind, text}).
                                            No TasteRecord, no Derivation/Source branches, no domain import.
    store-config-module.ts                ← config.ts (dynamic import of taste.config.ts, mtime cache, Date.now
                                            cache-bust name)
    store-root.ts                         ← config.ts / scope-input.ts (resolveStoreRoot)
    home-directory.ts                     ← os.homedir in place-resolution, scope-input, list, places-audit,
                                            repoint, config
    git-repository.ts                     ← place-resolution.ts (Bun.spawn git, env from env.ts)
    directory-facts.ts                    ← place-resolution.ts (stat, realpath of a directory)
    decision-lock.ts                      ← decide.ts (fs lock, randomUUID owner token, Date.now)
    listener-heartbeats.ts                ← listener.ts (fs heartbeat files, wall clock)
    record-ids.ts                         ← ids.ts (Clock-backed uuidv7, crypto.getRandomValues)
  features/
    store-host/                           NEW  exported as @taste/core/host: resolveStoreRoot, tasteStoreFromEnv,
      index.server.ts, visibility.json      childProcessEnvWithStore (composes record-store + env.ts)
      operations/taste-store-from-env.ts
    record-store/                         ← store.ts (TasteStore, provideTasteStore, withFreshTasteConfig),
      index.server.ts, visibility.json      config.ts (loadTasteConfig composition)
      operations/taste-store.ts, operations/load-taste-config.ts, operations/reindex-store.ts
    place-context/                        ← place-resolution.ts (resolveTasteContext, resolvePlacesForDirectory,
      index.server.ts, visibility.json      expandInputDirectory); caller.ts (resolveOperationContext)
      operations/resolve-taste-context.ts, operations/expand-input-directory.ts
    store-setup/                          ← config.ts (initStore), cli seed's requireEmptyStore
      index.server.ts, errors.ts          StoreAlreadyExists, StoreNotEmpty
      operations/init-taste-store.ts, operations/require-empty-store.ts
    store-catalog/operations/catalog.ts, catalog-text.ts   ← catalog op; render/operation-text.ts (its part)
    capture/operations/capture.ts, capture-text.ts         ← capture.ts; render/operation-text.ts
    proposals/                            ← propose.ts, revise-scope.ts, repoint.ts (incl. repoint preview)
      errors.ts                           ScopeRequired, NearRepeat
      operations/propose.ts, revise-scope.ts, repoint.ts, repoint-preview.ts, proposal-text.ts
    decisions/                            ← decide.ts (decide, accept preview)
      errors.ts                           WideningNeedsAcknowledgement, DecisionNotAllowed
      operations/decide.ts, accept-preview.ts, decision-text.ts
    recall/                               ← recall.ts, recall-explain.ts, hook-payload.ts, render/recall-text.ts
                                            (all but formatContextLine)
      operations/recall.ts, recall-explain.ts, recall-context.ts, hook-preview.ts,
      build-hook-payload.ts, recall-text.ts
    record-browsing/                      ← list.ts, show.ts, review-url.ts, render/derivation-text.ts
      operations/list-records.ts, show-record.ts, review-url.ts, derivation-text.ts
                                            review-url uses a constant http://localhost:4747 base. Consequence:
                                            `taste review --port N` links break for N≠4747. Accepted with the
                                            one-variable decision; record it in decisions.md.
    review-threads/                       ← threads.ts, listener.ts (logic half)
      operations/thread-reply.ts, thread-note.ts, list-listeners.ts, poll-threads.ts, heartbeat.ts
    inbox/operations/inbox.ts, count-pending-by-kind.ts, inbox-text.ts   ← inbox.ts
    places-audit/operations/places-audit.ts, places-audit-text.ts        ← places-audit.ts
    operation-registry/                   ← operation.ts (split), errors.ts (describeTasteFailure), index.ts
      errors.ts                           OperationNotAllowed
      operations/agent-operations.ts, human-operations.ts, taste-operations.ts,
      run-taste-operation.ts, build-operation-caller.ts, operation-listing.ts,
      describe-taste-failure.ts (Match.valueTags only), taste-error.ts (union)
  (deleted) index.ts, errors.ts, render/ after their contents move. There is no source-root index.server.ts.
```

Every feature gets an `index.server.ts` (its shell-facing surface) and a `visibility.json`. A feature gets an
`index.ts` only when it has a client-safe surface, and none does today.

**Judgment item, inversion:** `TasteStore` today builds the snapshot. In the target it exposes indexed records,
and `record-snapshot` (a domain) builds the snapshot. The feature `record-store` composes them. The snapshot has
no cache today, so this costs nothing. Keep it that way, and note it in `decisions.md` before anyone adds a
cache.

**`package.json` `exports` (core):**

| Subpath | Target |
|---|---|
| `./places`, `./taste-vocabulary`, `./kind-catalog`, `./records`, `./record-snapshot`, `./derivation-lifecycle`, `./repeat-detection`, `./record-views`, `./derivation-scope`, `./taste-caller`, `./record-text`, `./store-config` | `domains/<d>/index.ts` (pure, client-safe) |
| `./operations` | `features/operation-registry/index.server.ts` |
| `./record-store`, `./store-setup`, `./recall`, `./review-threads`, `./place-context`, `./record-browsing`, `./decisions`, `./proposals`, `./inbox` | `features/<f>/index.server.ts` (only those a shell imports; knip prunes the rest) |
| `./host` | `features/store-host/index.server.ts` |
| `"."` | removed |

`package.json` `"imports"`: `"#core/*": "./src/*"`.

### 3.3 `packages/mcp/src`

```
packages/mcp/src/
  index.server.ts                         ← server.ts (export serveTasteMcpOverStdio)
  routes/mcp-server.ts                    ← server.ts (root route: wires transport, list/call handlers)
  features/taste-tools/
    index.server.ts, visibility.json
    controllers/list-taste-tools.ts       ← server.ts (tool listing from operation registry)
    controllers/call-taste-tool.ts        ← server.ts (dispatch, failure envelope via describeTasteFailure)
  domains/tool-input-schema/index.ts, tool-input-schema.ts   ← server.ts (JSON schema building)
  infrastructure/mcp-sdk.ts               ← server.ts (@modelcontextprotocol/server + /stdio owner)
  infrastructure/taste-core.ts            the door: @taste/core/operations, /record-store, /host
```

`"imports"`: `"#mcp/*": "./src/*"`. `TASTE_STORE` is read through `@taste/core/host`. `package.json`
`exports["."]` changes from `./src/server.ts` to `./src/index.server.ts`, and knip's mcp entry follows. The tree
is `serverOnly`, and `mcp-server` is its root route, whose row already allows feature barrels and infrastructure.

### 3.4 `packages/cli/src`

```
packages/cli/src/
  main.ts                                 ← main.ts (server entry; imports only the root route)
  routes/
    taste-command.ts                      ← cli.ts (root route: mounts each feature's command group, reads argv
                                            via infrastructure/process-arguments, Command.run, exit code)
  features/                               each command group is a controller behind its feature barrel, so no
                                            non-root route needs feature or infrastructure imports
    cli-operations/                       ← commands.ts, runtime.ts
      index.server.ts
      controllers/run-cli-operation.ts, report-cli-failure.ts, init-taste-store.ts,
      query-commands.ts (recall, list, show, inbox, catalog, places…),
      write-commands.ts (capture, propose, decide, reply…), store-commands.ts (init, reindex)
    review-server/                        ← review.ts, cli.ts (review, review listen)
      index.server.ts, controllers/review-commands.ts, start-review-server.ts, listen-for-threads.ts
    prompt-hook/                          ← hook-prompt.ts, cli.ts (hook prompt, hook preview, mcp)
      index.server.ts, controllers/hook-commands.ts, run-prompt-hook.ts
    demo-seed/                            ← seed.ts, demo/seed-demo-store.ts (split by story chapter, each <500)
      controllers/seed-demo-store.ts, seed-sources.ts, seed-derivations.ts,
      seed-decisions.ts, seed-threads.ts
  domains/acme-demo-story/index.ts, demo-config.ts, story-constants.ts   ← demo/demo-config.ts
  shared/cli-flags.ts                     ← runtime.ts (flag definitions)
  infrastructure/
    terminal.ts                           ← runtime.ts (stdout/stderr writes, Bun.stdin)
    cli-platform-layer.ts                 ← runtime.ts (platform layer, exitCode)
    browser-opener.ts                     ← commands.ts (openInBrowser, Bun.spawn)
    review-app-process.ts                 ← review.ts (Bun.spawn vite, env from @taste/core/host). Its
                                            REVIEW_APP_ROOT base becomes new URL("../../../../apps/review", …)
                                            because the file is one directory deeper
    process-arguments.ts                  ← main.ts (process.argv)
    demo-store-files.ts                   ← seed-demo-store.ts (node:fs writes)
    taste-core.ts                         the door for non-domain @taste/core subpaths
    mcp-server.ts                         owns the @taste/mcp import (serveTasteMcpOverStdio)
```

`"imports"`: `"#cli/*": "./src/*"`. The tree is `serverOnly`. `prompt-hook`'s `hook-commands.ts` mounts
`taste mcp` through `infrastructure/mcp-server.ts`.

### 3.5 `apps/review/src`

```
apps/review/src/
  start.ts                                ← start.ts (server entry, CSRF middleware)
  router.tsx                              ← router.tsx (QueryClient moved out)
  routeTree.gen.ts                        generated, ignored
  styles.css                              ← styles.css (token stylesheet)
  routes/                                 thin: createFileRoute + validateSearch + page from a feature
    __root.tsx, index.tsx, derivations.$id.tsx, kinds.$kind.tsx, places.tsx,
    recall.tsx, settings.tsx, sources.$id.tsx, sources.index.tsx
  infrastructure/
    taste-core.server.ts                  ← server/taste-store.server.ts (the only runtime door to non-domain
                                            core; runAsReviewer, settleReviewEffect; store from @taste/core/host)
    browser-storage.ts                    ← localStorage in routes/index.tsx, routes/places.tsx,
                                            ui/review-session-log.ts
    providers/query-client.ts             ← router.tsx (QueryClient)
  shared/
    review-outcome.ts                     ← server/review-outcome.ts
    format.ts                             ← ui/format.ts
    query-keys.ts                         ← ui/review-queries.ts (keys)
    refresh-after-write.ts                ← ui/review-queries.ts (invalidation sets, react/mutation-refresh-keys)
    known-place-labels.ts                 ← ui/known-place-search.tsx (pure label logic)
    known-places.ts                       ← ui/use-review-context.ts (the KnownPlaces type, so shared/ui and
                                            every feature can name it without a grant)
    ui/
      theme.ts                            ← ui/theme.ts (+ explicit spacing/radius scales)
      textarea.tsx                        NEW  the one Mantine Textarea wrapper
      router-links.tsx, route-panels.tsx, fact-row.tsx, status-chips.tsx, kind-identity.tsx,
      place-chips.tsx, known-place-search.tsx, source-quote.tsx   ← ui/ same names
      derivation-link.tsx                 ← ui/derivation-link.tsx (takes `kind` prop; no hook)
  features/
    review-shell/                         ← ui/review-app-shell.tsx; ui/use-review-context.ts (useKnownPlaces,
                                            useReviewCatalog); ui/review-queries.ts (reviewShellQuery,
                                            knownPlacesQuery, reviewContextQuery, recordDetailQuery);
                                            review-functions (fetchReviewShell, resolveReviewContext,
                                            fetchRecordDetail). These reads are used by nearly every page.
      ui/review-app-shell.tsx, ui/use-review-context.ts, ui/review-shell-queries.ts,
      controllers/review-shell.ts, review-context.ts, record-detail.ts, service/*.ts,
      repo/*.server.ts, visibility.json (granted to every feature)
    derivation-decisions/                 ← routes/index.tsx (page body), routes/derivations.$id.tsx (page body
      ui/inbox-page.tsx, derivation-page.tsx, → ui/derivation-page.tsx), ui/inbox-card.tsx,
      inbox-card.tsx, inbox-group-section.tsx, ui/inbox-group-section.tsx, ui/inbox-queue.ts,
      derivation-review.tsx, …             ui/derivation-review.tsx, derivation-header.tsx,
      ui/inbox-queue.ts, scope-draft.ts     derivation-sidebar.tsx, derivation-thread.tsx,
      ui/use-review-decision.ts, …          acceptance-preview.tsx, reject-reason-form.tsx,
      ui/decision-queries.ts                revision-repeat-resolution.tsx, scope-editor.tsx, scope-draft.ts,
      controllers/inbox.ts, decide.ts,      use-review-decision.ts, review-session-list.tsx,
      accept-preview.ts, thread-note.ts,    review-session-log.ts (storage → infrastructure);
      revise-scope.ts                       review-queries (inboxGroupsQuery, acceptPreviewQuery);
      service/*.ts, repo/*.server.ts        review-functions (fetchInboxGroups, fetchAcceptPreview,
                                            decideReviewDerivation, postOwnerThreadNote, proposeScopeRevision)
    derivation-library/                   ← routes/kinds.$kind.tsx (page), derivationListQuery, fetchDerivationList
      ui/kind-page.tsx, ui/derivation-list-queries.ts, controllers/derivation-list.ts, service/, repo/
    sources/                              ← routes/sources.index.tsx, sources.$id.tsx (pages), sourceListQuery,
      ui/source-list-page.tsx, source-page.tsx, ui/source-queries.ts,   fetchSourceList. The source page
      controllers/source-list.ts, service/, repo/                       reads detail via review-shell
    places/                               ← routes/places.tsx (page), ui/places/*.tsx|ts, placesAuditQuery,
      ui/places-page.tsx, place-details.tsx, place-repoint-sheet.tsx,   repointPreviewQuery, fetchPlacesAudit,
      place-test-bench.tsx, place-tree-nav.tsx, place-tree.ts,          repointReviewPlace, fetchRepointPreview
      ui/places-queries.ts
      controllers/places-audit.ts, repoint.ts, repoint-preview.ts, service/, repo/
      visibility.json (no grants until an import needs one)
    recall-inspector/                     ← routes/recall.tsx (page), ui/recall/*.tsx|ts, recallInspectionQuery,
      ui/recall-page.tsx, recall-candidate-groups.tsx, recall-context.tsx,   recallExplanationQuery,
      recall-find-item-panel.tsx, recall-injected-panel.tsx, recall-reasons.ts,   fetchRecallInspection,
      ui/recall-queries.ts                                                         fetchRecallExplanation
      controllers/recall-inspection.ts, recall-explain.ts, service/, repo/
    settings/                             ← routes/settings.tsx (page; reads catalog via review-shell)
      ui/settings-page.tsx
  (deleted) server/, ui/ after their contents move
```

- Controllers are plain `.ts` `createServerFn` modules with validators, and they export only server functions
  (`placement/no-plain-export-in-server-fn-module`).
- `repo/*.server.ts` is the only layer that touches `infrastructure/taste-core.server.ts`, and that file is the
  only review module that runtime-imports non-domain core (`taste/core-server-door`, both halves).
- Browser-reachable review code (routes, `features/*/ui`, `shared/`, `shared/ui`) may not runtime-import
  `effect/unstable/*` or `@tanstack/react-start/server` (`taste/browser-runtime-packages`).
- There is no `api-client.ts`, because review never calls `fetch`.
- `"imports"`: `"#review/*": "./src/*"`. tk2 used tsconfig paths for web, but `"imports"` is the one mechanism
  across all four trees and Vite resolves it.

`vite.config.ts` `importProtection`:

- Add `@taste/core/operations`, `@taste/core/host` and every feature subpath to `client.specifiers`.
- Keep `**/*.server.*`.
- Replace the core file globs with `**/packages/core/src/features/**` and `**/packages/core/src/infrastructure/**`.

### 3.6 Responsibility table

| Position | Owns | May import (runtime) |
|---|---|---|
| core `domains/<d>` | Pure rules and schemas | other domains, `shared/`, `effect` (not `effect/unstable/*`) |
| core `shared/` | Cross-cutting pure atoms | shared, `effect` (not `effect/unstable/*`) |
| core `infrastructure/` | Files, yaml, SQLite, git, clock, home, locks | infrastructure, shared, env, packages |
| core `features/<f>/operations` | One user-visible operation each | domains, shared, infrastructure, granted features' barrels |
| core `env.ts` | `process.env` | — |
| cli/mcp root route | Command/tool surface wiring | feature barrels, shared, infrastructure |
| cli/mcp `features/*/controllers` | Command groups, tools, running an operation for that surface | domains, shared, infrastructure (door) |
| review `routes/` | URL → page, search validation | feature `ui` barrels, shared/ui |
| review `features/*/ui` | Pages and components | own controllers, `review-shell` ui barrel, shared, shared/ui, core domains |
| review `controllers` | `createServerFn` + validator | own service |
| review `service` | Mapping results to review outcomes | own repo, shared |
| review `repo/*.server.ts` | Calling core through the door | `infrastructure/taste-core.server.ts` |

### 3.7 Dependency graph

```
                         ┌──────────── apps/review ────────────┐
                         │ routes → features(ui→ctrl→svc→repo) │
                         │ repo → infrastructure/taste-core.server ──┐
                         │ ui → @taste/core/<domain> (pure)    │    │
                         └─────────────────────────────────────┘    │
 packages/cli: routes → features → infrastructure/taste-core ───────┤
          infrastructure/mcp-server → @taste/mcp (index.server)     │
 packages/mcp: routes → features → infrastructure/taste-core ───────┤
                                                                    ▼
 @taste/core: features/<f>/operations ─► domains/* ─► shared/
                     │                       ▲
                     └──► infrastructure/* ──┘ (never upward; tokenizer/decoder/projection injected)
                     └──► env.ts
```

Within core, these feature edges exist and each is granted in the importee's `visibility.json`:

- every feature → `record-store`
- `store-host` → `record-store`
- `proposals`, `decisions`, `recall`, `record-browsing`, `places-audit`, `capture`, `store-catalog` →
  `place-context` (`resolveOperationContext`)
- `store-catalog` → `inbox` (`countPendingByKind`)
- `operation-registry` → every operation feature

`formatContextLine` moves to `domains/record-text`, so `store-catalog` and `record-browsing` need no `recall` edge.
The old `recall → record-browsing` entry is gone, because no such import exists. The edge list is re-derived from
real imports at A4 before the grants are written. No cycles.

### 3.8 Barrels and naming

- `index.ts` is a client-safe barrel. `index.server.ts` is the server barrel, which `api/barrel-direction`
  orders. Both re-export only their own feature or domain.
- `*.server.ts` marks a server-only module in review (`api/server-import-context`, `barrel-purity`).
- Export names are grep addresses (`runTasteOperation`, `describeTasteFailure`, `resolveTasteContext`,
  `startReviewServer`). One term per concept: `kind`, `derivation`, `place`, `scope`, `listener`.

## 4. Declared Trees

`lint/policy/declared-trees.ts`:

| Root | alias | Vocabulary deltas from catalog defaults | tsconfig |
|---|---|---|---|
| `packages/core/src` | `#core/` | `featureLayerDirs.controllers = "operations"` (other layers unused); `rootRouteName: null`; `sourceRootPositions` `{ clientEntry: "index", serverEntry: "index.server", router: "router", routeTree: "routeTree.gen" }`, none of which has a file; `envModules: { env: "env-server" }`; `dbSubdir: "record-index"`; `serverOnly: false` | `packages/core/tsconfig.json` |
| `packages/cli/src` | `#cli/` | `routesDir: "routes"` (root route only); `rootRouteName: "taste-command"`; `serverEntry: "main"`; `envModules: {}`; `serverOnly: true` | `packages/cli/tsconfig.json` |
| `packages/mcp/src` | `#mcp/` | `rootRouteName: "mcp-server"`; `serverEntry: "index.server"`; `envModules: {}`; `serverOnly: true` | `packages/mcp/tsconfig.json` |
| `apps/review/src` | `#review/` | `serverEntry: "start"`; `router: "router"`; `rootRouteName: "__root"`; `themeModuleName: "theme"` (under `shared/ui/`); `envModules: {}`; `serverOnly: false` | `apps/review/tsconfig.json` |

These are left outside on purpose: `test/`, `scripts/`, `lint/`, `demo/`, `skills/`, `apps/review/public/`,
root config files (`package.json`, `tsconfig*.json`, `knip.jsonc`, `lefthook.yml`, `.oxfmtrc.json`, `bunfig.toml`),
`apps/review/vite.config.ts` and `apps/review/postcss.config.cjs`. **A package or directory not declared here is ungoverned.** Every tree-scoped rule
in both tiers is silent for it, with nothing saying so. Only `testing/no-module-mocking`, `health/file-size` and
`health/doc-budgets` still run over it.

## 5. Rule Adaptations

The catalog comes in whole. "Standard" means it is copied as-is, with its layout read from `declared-trees.ts`.

### 5.1 Policy (`lint/policy/`)

| Item | Adaptation |
|---|---|
| `declared-trees.ts` | The four trees in §4. `isServerContext` also returns true when `role.tree.vocabulary.serverOnly` |
| `layout.ts` | Add `serverOnly: boolean` to the tree vocabulary (default `false`) |
| `import-policy.ts` `DOMAIN_RUNTIME_AREAS` | `+= "package"` (the catalog's documented adaptation). Narrowed by `taste/domain-runtime-packages`. Otherwise standard |
| `package-owners.ts` | The rows in §6 |

### 5.2 oxlint tier (`lint/oxlint/<tag>/`)

| Rule | Adaptation |
|---|---|
| `api/barrel-direction`, `api/server-import-context` | Standard |
| `boundary/ambient-globals` | Standard. `process.env` only in `env.ts`, `fetch` only in `api-client` (none), `localStorage` only in `browser-storage` |
| `boundary/client-server-infra` | `CLIENT_SAFE_INFRASTRUCTURE = ["providers/query-client", "browser-storage"]` |
| `boundary/db-isolation` | Standard. `dbSubdir` is `record-index` (core) |
| `boundary/import-policy` | Standard |
| `boundary/route-thinness` | Standard |
| `boundary/sdk-containment` | Rows from `package-owners.ts` |
| `boundary/server-no-upward` | Standard |
| `effect/*` | **Sourced from tk2** (`~/Programming/tk2/lint/oxlint/effect/`, the Effect v4 spellings): `no-effect-catchcause`, `Effect.catch` forms, `no-manual-tag-comparison`, `no-discarding-catch`, the remaining shared rules, and `language-service-policy.test.ts`. **`require-failure-disclosure` is not copied**, because it assumes per-call-site disclosure and Taste keeps `describeTasteFailure` as the single mapper. Record this in `decisions.md` |
| `health/accumulator-count`, `cognitive-complexity`, `return-width` | Standard |
| `health/no-long-comments` | Standard inside trees. `taste/no-long-comments` covers files outside trees (§5.4) |
| `naming/no-vacant-symbol-names` | Standard |
| `placement/deprecated-paths` | `DEPRECATED_PATHS`: `^@taste/core$`, `^@taste/core/vocabulary$` (→ `taste-vocabulary`), `^@taste/core/catalog-view$` (→ `kind-catalog`), and the old flat core file paths |
| `placement/no-deprecated-input-validator`, `no-plain-export-in-server-fn-module`, `no-raw-result`, `schema-placement`, `server-fn-placement`, `server-fn-validation` | Standard |
| `react/*` (`hook-count`, `mutation-refresh-keys`, `no-async-effect`, `primed-suspense-reads`, `prop-count`, `single-component-export`) | Standard |
| `style/no-arbitrary-class-values`, `no-inline-color`, `no-inline-font-size`, `no-inline-style-prop`, `no-raw-primitives` | Standard |
| `style/vendor-component-containment` | `WRAPPED_COMPONENTS`: Mantine `Textarea` → `wrapperModule: "textarea"` (the default row, kept) |
| `testing/no-module-mocking` | Standard |
| `types/*` (5 rules) | Standard |

### 5.3 Structural tier (`lint/structural/`, values in `arch.config.ts`)

| Check | Adaptation |
|---|---|
| `api/barrel-purity` | `serverOnlyPackages: ["bun:sqlite", "yaml", "@modelcontextprotocol/server", "@taste/mcp"]`; `serverFnBoundary: { module: "@tanstack/react-start", calls: ["createServerFn", "createMiddleware"] }`; `maxTraceDepth: 16` (tk2). `@taste/core/<feature>` subpaths cannot be listed (`packageNameOf` collapses subpaths), so `taste/core-server-door` covers them |
| `api/feature-visibility` | Standard. The skill version has no `everyImporterGranters`, so every edge in §3.7 gets an explicit grant |
| `boundary/import-policy`, `boundary/layer-occupancy` | Standard |
| `graph/domain-cycles` | Standard |
| `graph/feature-deps` | `fanOutThreshold` and `totalEdgeThreshold` = `Number.POSITIVE_INFINITY`. Reason: "every edge is argued in visibility.json". `pairSaturation` default. Cycles block |
| `health/doc-budgets` | Manifest in §6 |
| `health/file-size` | Roots: all four trees + `test`, `scripts`, `lint`. 500/600 defaults kept (files split) |
| `health/trampolines` | Default (service). Review passthrough services warn, and that is accepted under Graham's layering decision |
| `naming/barrel-discoverability`, `naming/test-file-mirror` | Standard |
| `placement/layer-direction`, `placement/topology` | Standard |
| `style/css-tokens` | Standard |
| `style/shadow-source` | `allowedFile` set during calibration (the theme module) |
| `style/token-equality` | Scales read from `apps/review/src/shared/ui/theme.ts` via `theme-scale`. That needs the explicit spacing/radius scales added in A7 |
| `types/*` (7 checks + `type-shapes` helper) | Standard |
| `effect/no-tagged-error-instanceof`, `effect/controller-effect-fn`, `effect/is-tagged-known-tag` | **Copied from tk2's structural tier** and registered in `registry.ts`. `controller-effect-fn` span names become `"<feature>.<export>"` |

### 5.4 Project rules (`lint/oxlint/taste/`, the `taste` plugin)

`lint/oxlint/taste/plugin.ts` is the second `jsPlugins` entry. Each rule has a spec in RuleTester that includes
at least one adversarial case: aliased import, re-export or computed member.

| Rule | Bans | Why the catalog doesn't cover it |
|---|---|---|
| `taste/io-only-in-infrastructure` | Outside `infrastructure/` of any tree: `node:fs`, `fs/promises`, `node:child_process`, `node:os`, `node:crypto`, `bun:sqlite`, `Bun.spawn`/`spawnSync`/`file`/`write`/`stdin`, `process.stdout`/`stderr`/`stdin`/`exit`/`exitCode`/`cwd`/`argv`/`platform`/`pid` | `ambient-globals` covers env/fetch/storage only. This is "only infrastructure opens SQLite or spawns git", generalised |
| `taste/core-server-door` | Outside `packages/core`, two halves. (1) A runtime import of a non-domain `@taste/core/*` subpath (read from core's `package.json` exports, `./host` included) is allowed only in exactly `infrastructure/taste-core.ts` (cli, mcp) or `infrastructure/taste-core.server.ts` (review). (2) In review, only `features/*/repo/*.server.ts` may import that door. Type-only imports are free | `sdk-containment` and `barrel-purity` see one package name. This mirrors tk2's `tk/no-second-db-client` |
| `taste/domain-runtime-packages` | In core `domains/` and core `shared/` (browser-reachable through domain barrels): runtime package imports other than `effect` (excluding `effect/unstable/*`) and `@taste/core/<domain>` subpaths | Restores the precision lost by `DOMAIN_RUNTIME_AREAS += "package"`, transitively, since the catalog lets domains import shared freely |
| `taste/browser-runtime-packages` | In review `routes/`, `features/*/ui`, `shared/`, `shared/ui`: runtime imports of `effect/unstable/*` and `@tanstack/react-start/server` | `barrel-purity` lists packages, not subpaths, and Vite protection fires only at build time |
| `taste/no-ambient-nondeterminism` | In `domains/`, `shared/`, and feature `operations`/`controllers`/`service`/`repo` of every tree: `Date.now()`, zero-arg `new Date()`, `performance.now()`, `Math.random()`, `randomUUID`, `crypto.getRandomValues`, `crypto.randomUUID` | Time and ids go through Effect `Clock` or `infrastructure/record-ids`, so tests stay deterministic. `shared/` is covered so a helper cannot launder it into a domain |
| `taste/no-long-comments` | Moved from `lint/no-long-comments.ts`. Now scoped to files **outside** declared trees (`test/`, `scripts/`, `lint/`) | Inside trees, `health/no-long-comments` reports, and running both would double-report |
| Global `no-restricted-imports` | Kept verbatim: `**/packages/*/src/**`, `**/apps/*/src/**` with message "Import another workspace package by name (@taste/core and its subpaths), never by path." | The catalog has no rule for one declared tree importing another's files by path |

These tk2 `tk-plugin` rules are not adopted:

- `no-refetch-interval`: review polls on purpose.
- `queries-through-read-set-query`, `no-request-read-in-effect` and `change-notices-in-change-feed`: none has a
  subject here.
- tk2's structural `tk/` data-access checks: Taste has no Drizzle.
- `tk/agent-parity`: inverse model.

`tk/agent-parity` is replaced by a **test**, `test/operation-surface-parity.test.ts`. It checks that every
agent operation has a CLI command and every human operation has a review repo call.

### 5.5 `oxlint.config.ts`

1. Copy `setup/oxlint.config.ts` unedited.
2. Make only additive edits:
   - `jsPlugins` gets the taste plugin path.
   - `ignorePatterns` keeps `.claude`, `.agent_cache`, `.tanstack`, `demo` and `apps/review/src/routeTree.gen.ts`.
   - Add the global `no-restricted-imports`, the five `typescript/*` rules, `import/no-cycle` and `eqeqeq` from
     today's `.oxlintrc.json`.
   - Add a `taste/*` block (tree-scoped via the `DECLARED_TREES` globs, except `no-long-comments`, which uses the
     complement).
3. Add the taste rules to the `TREE_SCOPED` severity table so the load-time assertion holds.
4. **Delete `.oxlintrc.json`.** Only one config is allowed per directory.

## 6. SDK Containment

| Package | Status | Owner path |
|---|---|---|
| `bun:sqlite` | Wrapped | `packages/core/src/infrastructure/record-index/` |
| `yaml` | Wrapped | `packages/core/src/infrastructure/frontmatter-codec.ts` |
| `@modelcontextprotocol/server` (+ `/stdio`) | Wrapped | `packages/mcp/src/infrastructure/mcp-sdk.ts` |
| `@taste/mcp` | Wrapped | `packages/cli/src/infrastructure/mcp-server.ts` |
| `@taste/core` non-domain subpaths | Wrapped by `taste/core-server-door` | each shell's `infrastructure/taste-core(.server).ts` |
| `effect` | Unconstrained, fenced in domains by `taste/domain-runtime-packages` | — |
| `@mantine/core` | Unconstrained, except `Textarea` via `vendor-component-containment` | `apps/review/src/shared/ui/textarea.tsx` |
| `@stylexjs/stylex`, `@tanstack/*`, `lucide-react`, `react` | Unconstrained, stated as such: they are the framework | — |

## 7. Documentation Spec

| File | Content | Ceiling (words) |
|---|---|---|
| `CLAUDE.md` | Keep the `tk` line. Add a **Rules** section: the four trees, where work goes, the core door, errors-by-layer, `TASTE_STORE` only, `bun run check:arch`, links to `docs/architecture/` | target ≤600, ceiling = measured + ≤5% |
| `docs/architecture/README.md` | "Read when" table | 250 |
| `docs/architecture/layers.md` | Trees, positions, vocabulary, where each kind of change goes | 900 |
| `docs/architecture/boundaries.md` | SDK rows, the core door, declared trees and what is ungoverned, the cross-package path ban | 700 |
| `docs/architecture/server-client-boundaries.md` | Review's `*.server.ts`, controllers/repo, importProtection, client-safe infrastructure | 600 |
| `docs/architecture/error-conventions.md` | Errors by raising layer, the `taste-error` union, `describeTasteFailure` as single mapper, Match not `_tag` | 600 |
| `docs/architecture/decisions.md` | No `require-failure-disclosure`, `DOMAIN_RUNTIME_AREAS += package`, the `serverOnly` tree flag, `CorruptRecordFile` in core `shared/`, feature-deps thresholds, fixed review-url base, snapshot inversion/no cache, accepted trampolines | 800 |
| `docs/architecture/how-to/new-core-operation.md` | Domain → operation → registry → CLI command → MCP tool → parity test | 500 |
| `docs/architecture/how-to/new-review-feature.md` | ui → controllers → service → repo, visibility grant, route | 500 |
| `docs/architecture/how-to/new-infra-adapter.md` | Owner row, store-errors, injection into features | 400 |

`docs/doc-budgets.manifest.json` is written after the docs, with each ceiling set to the measured count plus
≤5%. The ratchet rejects more slack than that. The figures above are targets, not ceilings.

## 8. Migration Plan

There are two parallel tracks. Then the migration phases wire the gate and clear violations inside-out, as
`migration-patterns.md` orders them. Mechanical changes go in batches. Each judgment change is its own reviewable
unit (do not commit). Run `bun run check` after each step. The tests in `test/` are the behavioral safety net and
must stay green throughout.

### Track A: code restructure

A1. Add `"imports"` aliases to all four `package.json`s.

A2. Core `shared/` and `domains/` (§3.2). Make domain code pure:
   - pass `home` into `scope-input` and `canonicalInputPlaces`
   - split pure place-key code out of `place-resolution`
   - move record decode out of `frontmatter`, failing with `shared/corrupt-record-file.ts`
   - `recordRelativePath` as "/"-joined string ops; filesystem joins stay in `infrastructure/record-files`
   - `formatContextLine` → `domains/record-text`; `searchEntryOf` → `domains/records/record-search-entry.ts`

A3. Core `infrastructure/`:
   - `store-errors.ts`
   - `record-files`, `frontmatter-codec`, `record-index/` (an `IndexRow` storage contract; tokenizer, decoder and
     search projection injected)
   - `store-config-module`, `store-root`, `home-directory`, `git-repository`, `directory-facts`
   - `decision-lock`, `listener-heartbeats`, `record-ids`
   - `env.ts`

A4. Core `features/` (§3.2):
   - Split `render/operation-text.ts` per feature.
   - Split `operation.ts` into `operation-registry/operations/*`.
   - Rewrite `describeTasteFailure` and `retryFieldsOf` with `Match.valueTags` / `Match.tags`, with no `switch`
     on `_tag` and no `_tag ===`.
   - Rename spans to `"<feature>.<export>"`.
   - Re-derive the §3.7 edge list from real imports.

   *Judgment:* the snapshot inversion (domain builds the snapshot from records, `TasteStore` exposes records).

A5. **One step, so nothing is left importing a removed export:** the `store-host` feature (`./host`), the
    per-feature `index.server.ts`, `visibility.json` grants (§3.7), the new core `exports` map, and every consumer
    specifier repointed in the same change: cli (`commands`, `runtime`, `review`, `hook-prompt`, `demo/*`), mcp
    `server.ts`, review (`server/*`, the 27 type-only root imports, `/vocabulary` → `/taste-vocabulary`,
    `/catalog-view` → `/kind-catalog`) and `test/**`. Only specifiers move here; file moves wait for A6/A7.
    Delete `index.ts`, `errors.ts` and `render/`.

   *Judgment:* drop `TASTE_REVIEW_URL` and use a constant base.

A6. MCP and CLI restructure (§3.3, §3.4):
   - CLI command groups become feature controllers; `routes/` keeps only `taste-command.ts`.
   - Split `seed-demo-store.ts` by chapter, each part under 500 lines.
   - Read `TASTE_STORE` via `@taste/core/host`.
   - `review-app-process.ts`: rebase `REVIEW_APP_ROOT` one directory deeper.
   - mcp `package.json` `exports["."]` → `./src/index.server.ts`; update knip entries.

A7. Review restructure (§3.5):
   - thin routes (including the `derivations.$id.tsx` body → `derivation-decisions/ui/derivation-page.tsx`)
   - features with ui/controllers/service/repo; `review-queries.ts` and `review-functions.ts` split per the
     §3.5 owners; `KnownPlaces` → `shared/known-places.ts`
   - `infrastructure/{taste-core.server, browser-storage, providers/query-client}`
   - `shared/ui/textarea.tsx`
   - `derivation-link` takes `kind`
   - theme spacing/radius scales
   - `importProtection` update

A8. Replace raw elements and inline styles with Mantine/StyleX primitives (65 raw elements, 38 inline styles)
    wherever `style/*` will report them. Batch this per feature.

A9. Add `test/operation-surface-parity.test.ts`. Keep the tests in `test/`, outside the trees.

### Track B: lint catalog copy (independent of A until the migration phases)

Each step leaves `bun run check` green. Checks are installed as runnable scripts first and become blocking only
in M8.

B0. Isolate the test runner before any spec lands: `bunfig.toml` `[test] root = "test"`, so `bun test` (both
    the `test` script and lefthook's direct `bun test`) never discovers `lint/**/*.test.ts`.

B1. Copy `lint/policy/` whole. Write `declared-trees.ts` (§4). Apply the §5.1 edits.

B2. Copy `lint/oxlint/` `plugin.ts`, `lib/` and each tag with its specs. Use one subagent per tag, and take
    `effect/` from tk2 minus `require-failure-disclosure`. Apply the §5.2 list edits. Respell spec fixture
    filenames into the declared vocabulary (`operations/`, `record-index/`, `index.server.ts`, `start.ts`).
    Not loaded by any oxlint config yet.

B3. Copy `lint/structural/` whole and unmodified. Register every check, plus tk2's three `effect/` checks, in
    `registry.ts`. Write `arch.config.ts` (§5.3).

B4. Copy `lint/with-real-node.sh`. RuleTester cannot run under Bun, and Bun's `globSync` differs from Node's.
    Add tsconfigs for `lint/oxlint`, `lint/structural` and `lint/policy`.

B5. Port the Effect language-service severities to `tsconfig.effect.json` (extended by `tsconfig.base.json`).
    Add tk2's drift test.

B6. Scripts, **non-blocking**:
   - `check:rules` = `./lint/with-real-node.sh --test --test-isolation=none 'lint/**/*.test.ts'`
   - `check:structural` (through `with-real-node.sh`)
   - `check:arch` (both, run independently)
   - `duplication` (jscpd, CI-only), plus `.jscpd.json` (minTokens 60, minLines 6, mild)
   - `scripts/check.ts` adds the three lint typecheck programs and `check:rules` (specs are green on their own).
     `check:structural` stays out of the gate until M8.

B7. **One step: plugin and config swap together.** `lint/oxlint/taste/` holds the plugin, the five new rules + the
    moved `no-long-comments`, and specs, each with an adversarial case. Write `oxlint.config.ts` (§5.5), delete
    `.oxlintrc.json`, `lint/taste-plugin.ts` and `lint/no-long-comments.ts`. Until migration clears them, the new
    tree-scoped rules start at `warn` in the severity table; M8 raises them to their catalog severity.

### Migration phases (after A and B land)

Clear the findings in this order. After each phase, run `bun run check` and `bun run check:arch` (the latter is
expected red until M8).

| Phase | Findings expected | Cleared by |
|---|---|---|
| M1 Unclassified | `unclassifiedSource` / `topology` everywhere | A2–A7 moves |
| M2 DB isolation | `db-isolation` in `store.ts`, `index-db.ts` | `infrastructure/record-index/` |
| M3 SDK containment | `sdk-containment` for `yaml`, `bun:sqlite`, MCP SDK, `@taste/mcp`; `taste/core-server-door` in review `ui`, `server/`, cli `commands.ts`, mcp `server.ts` | owner modules, doors |
| M4 Barrels / exposure | `barrel-direction`, `barrel-purity`, `feature-visibility`, `deprecated-paths` (`@taste/core` root) | A5 exports, grants |
| M5 Alias | relative cross-layer imports | `#core/`, `#cli/`, `#mcp/`, `#review/` |
| M6 Layer placement | `layer-direction`, `server-no-upward`, `route-thinness`, `ambient-globals` (`process.env`, `localStorage`), `taste/io-only-in-infrastructure`, `taste/no-ambient-nondeterminism`, `taste/domain-runtime-packages`, `taste/browser-runtime-packages` | A3, A7 |
| M7 Cross-file | `no-manual-tag-comparison` (`describeTasteFailure`), `controller-effect-fn` spans, `file-size` (seed, operation), `style/*`, `vendor-component-containment` (`Textarea` ×3), `token-equality`, `trampolines` (warn, accepted) | A4, A6, A8 |
| M8 Gate | `doc-budgets` | write docs, then the manifest; raise warn-started rules to catalog severity; add `check:structural` to `scripts/check.ts`; lefthook `structure` job with `STAGED_FILES` (tk2 shape) |

Verification:

- `bun run check` is green, `bun run check:arch` is green, and the five typecheck programs pass.
- `bun test` is green, including the parity test.
- **Confirm red** by introducing one deliberate violation per tier and watching the gate fail:
  - an `import { Database } from "bun:sqlite"` in a review ui file
  - `Date.now()` in a domain
  - `Date.now()` in a core `shared/` helper that a domain re-exports
  - an `effect/unstable/process` import in a core `shared/` helper reached by a domain the review ui imports
  - a review controller importing `infrastructure/taste-core.server.ts` directly
  - a cross-feature import with no grant

  Then revert them.
- `bun run dev:review` builds under a fresh port. Do not touch `:4747`.

## 9. Current Violations (inside-out)

1. **Unclassified:** all 47 core, 1 mcp, 9 cli and 46 review files (§2). Fix: the A2–A7 moves.
2. **DB isolation:** the index handle and reopen logic sit in `packages/core/src/store.ts`. `index-db.ts` imports
   `similarity` and `records`, and `IndexedRecord` carries a `TasteRecord`. Fix: move them to
   `infrastructure/record-index/` behind an `IndexRow` contract, and inject the tokenizer, decoder and search
   projection.
3. **SDK containment:**
   - `yaml` in `frontmatter.ts` → `frontmatter-codec.ts`.
   - The MCP SDK in `mcp/src/server.ts` → `infrastructure/mcp-sdk.ts`.
   - Core server code imported from `apps/review/src/server/*.ts` and `cli/src/commands.ts`/`runtime.ts` → the
     doors.
4. **Barrels:** the core root `index.ts` and `exports["."]` → per-domain and per-feature subpaths. The test imports
   of `@taste/core` → subpaths.
5. **Alias:** relative imports across layers in all packages → `#…/` aliases.
6. **Layer placement and ambient:**
   - `process.env` in `place-resolution.ts`, `review-url.ts`, `mcp/src/server.ts`, `cli/src/runtime.ts`,
     `cli/src/review.ts` and `review/src/server/taste-store.server.ts` → `core/src/env.ts` + `@taste/core/host`.
   - `localStorage` in `routes/index.tsx`, `routes/places.tsx` and `ui/review-session-log.ts` →
     `infrastructure/browser-storage.ts`.
   - `Bun.spawn` in `place-resolution.ts`, `cli/src/commands.ts` and `cli/src/review.ts` → infrastructure.
   - `node:fs` in `config`, `decide`, `listener`, `store`, `store-files` and `seed-demo-store` → infrastructure.
   - `Date.now`/`randomUUID` in `decide.ts`, `new Date()` in `listener.ts` and `performance.now` in
     `hook-prompt.ts` → `Clock` / `record-ids` / infrastructure.
   - The fat routes `routes/index.tsx` (327 lines) and the other routes → feature pages.
   - The `QueryClient` in `router.tsx` → `infrastructure/providers/query-client.ts`.
7. **Cross-file:**
   - `switch (error._tag)` and `_tag ===` in `errors.ts` → `Match`.
   - The `"taste.*"` spans → `"<feature>.<export>"`.
   - `operation.ts` (511 lines) and `seed-demo-store.ts` (805 lines) → splits.
   - 65 raw elements and 38 inline styles in review → primitives.
   - Mantine `Textarea` in 3 files → `shared/ui/textarea.tsx`.
   - The theme has no explicit scales → add them.
   - The hook in `ui/derivation-link.tsx` → a prop.
8. **Gate:** no structural job, no rule specs and no `check:arch` → M8.

## Considered and rejected

From the Codex review (session `01a17690-47b8-7ee0-a1d9-1b43ca0452ba`). Every finding was adopted. These are the
alternatives it offered that were not taken:

- Temporary core exports kept until consumers migrate (P1.1): rejected because they are a compatibility shim. A5
  repoints every consumer specifier in the same step instead.
- A narrow server-entry permission on the `source-root` row (P2.3): rejected. A `store-host` feature barrel needs
  no policy edit, and the core tree has no entry file to grant it to.
- Widening the non-root `route` row so CLI command routes reach features and infrastructure (P2.4): rejected.
  Command groups become feature controllers under the root route, which the catalog already permits.
- Returning domain failures from record decoding and mapping them to `CorruptRecordFile` in the composing layer
  (P2.5): rejected. One error in `shared/` is smaller and keeps a single tag.
- A temporary `lefthook` change instead of `bunfig.toml` (P2.12): rejected, because `bunfig` fixes the script and
  the hook in one place.

## Rule implementation

> Rule templates are in the `enforced-architecture` skill
> (`~/.claude/skills/enforced-architecture/references/lint/`), split by tier: `lint/policy/`,
> `lint/oxlint/<tag>/` and `lint/structural/<tag>/`. Each rule below names its template by that path,
> so the path names the tier. The project mirrors the tree — copy into its own `lint/`.
>
> **`lint/policy/` first, before either tier.** Copy it whole, then declare this project's source
> roots in `lint/policy/declared-trees.ts`, each with the vocabulary its directories are spelled in
> and the `tsconfig` whose program contains it. Both tiers import it, and an oxlint rule has no
> adaptation of its own — its layout comes from that file. A tree left off that list is silent for
> every tree-scoped rule in both tiers, with nothing saying so; only `testing/no-module-mocking`,
> `health/file-size` and `health/doc-budgets` still run over it.
>
> **oxlint rules:** copy the template and its spec into `lint/oxlint/<tag>/`, register it in
> `lint/oxlint/plugin.ts`, switch it on in `oxlint.config.ts`. Never repoint one at a path: tree
> scoping comes from `declared-trees.ts` through the `oxlint.config.ts` overrides.
>
> **Structural checks:** copy `lint/structural/` whole and unmodified, register each check
> in `lint/structural/registry.ts`, and put every project-specific value in
> `lint/structural/arch.config.ts`. The keys and defaults are in `lint/structural/config.ts`, typed
> per check; most checks have none. Do not reimplement a check from its doc.

The Effect rules come from tk2 (`~/Programming/tk2/lint/oxlint/effect/` and `~/Programming/tk2/lint/structural/`
for the `effect/` checks) rather than the skill, because Taste runs Effect v4. The project `taste/` rules have no
template. Write them in the style of tk2's `lint/oxlint/tk-plugin.ts`, using plain `defineRule` so they run under
both oxlint and RuleTester.
