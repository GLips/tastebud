# Server and client in the review app

The review app is TanStack Start with `defaultSsr: false`: the server renders only the shell and answers server
functions; screens render in the browser. `tastebud review` serves the build in-process
(`review-app-server.ts`); `dev:review` is Vite. Core's features and infrastructure touch the filesystem and SQLite, so none of
it may reach the browser bundle.

## How a screen reaches the store

```
features/<f>/ui  ──useQuery/useMutation──►  controllers/<x>.ts (createServerFn + validator)
                                            └► service/<x>.ts → repo/<x>.server.ts
                                                               └► infrastructure/tastebud-core.server.ts
                                                                  └► @tastebud/core/operations
```

- Controllers are plain `.ts` modules that export only server functions, each with a Schema validator.
- `repo/*.server.ts` is the only layer that imports `infrastructure/tastebud-core.server.ts`, and that is the only
  review module importing non-domain core at runtime (`runReviewOperation`).
- Review never calls `fetch`; server functions are the transport.

## What the browser may import

Routes, `features/*/ui`, `shared/` and `shared/ui/` are browser code. They may import core domains
(`@tastebud/core/places`, `@tastebud/core/record-views`, …) and types from anywhere. `tastebud/browser-runtime-packages`
bans impure `effect` areas (`effect/http`, `effect/process`, …) and `@tanstack/react-start/server` there.

Client-safe infrastructure is limited to `infrastructure/providers/query-client.ts` and
`infrastructure/browser-storage.ts` (the one `localStorage` owner), set in `boundary/client-server-infra`.

## Three fences

1. **Lint:** the rules above, plus `api/server-import-context` and `api/barrel-purity`, which trace imports from
   browser code and reject any path that reaches a `*.server.ts` module or a server-only package.
2. **Build:** `vite.config.ts` `importProtection` errors when a client module imports `bun:sqlite`, `node:*`,
   `@tastebud/core/operations`, `@tastebud/core/host`, a core feature subpath, any `*.server.*` file or a file under
   core's `features/` or `infrastructure/`.
3. **Types:** each package typechecks alone, so a missing dependency or a path import fails there.

The vite list of core feature subpaths is hand-kept. Adding a core feature export means adding it there too.

## Writes and refreshes

A `useMutation` settles through `refreshReviewQueriesAfterWrite(queryClient, bundle)` from
`shared/refresh-after-write.ts`, with a bundle exported by `shared/query-keys.ts` (`STORE_WRITE_STALES`,
`THREAD_NOTE_STALES`, `acceptPreviewsStaleOf(ref)`). `react/mutation-refresh-keys` rejects key lists built at
the call site and direct `invalidateQueries` calls, so what a write stales is decided in one place. Screens
also poll every `REVIEW_POLL_MS`, because agents write from other processes.
