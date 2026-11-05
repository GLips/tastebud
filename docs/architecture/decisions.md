# Decisions

Where Tastebud departs from the enforced-architecture catalog, and why. Graham made these; change them by
deciding again, not by editing a rule.

**No `effect/require-failure-disclosure`.** It assumes each call site discloses its failures. Tastebud maps every
failure once, in `describeTasteFailure`, for all three shells. Copying the rule would demand disclosure at
sites that never show a failure.

**`DOMAIN_RUNTIME_AREAS` includes `package`.** The catalog's default bans runtime packages in domains, which
would ban `effect` Schema, Match and Option, the language Tastebud's domains are written in. The area is widened
at the catalog's documented adaptation point, and `tastebud/domain-runtime-packages` narrows it back to an
allowlist of pure `effect` specifiers and core domain subpaths.

**A `serverOnly` tree flag.** CLI and MCP never run in a browser, but a directory name cannot say so. The tree
vocabulary gained `serverOnly`, read by `isServerContext` in `lint/policy/declared-trees.ts`, so every file in
those trees is a server context.

**`CorruptRecordFile` lives in core `shared/`.** Both the record decoder (a domain) and the frontmatter codec
(infrastructure) raise it. Infrastructure may not import a domain's errors and a domain may not import
infrastructure, so the error sits below both.

**Feature-graph thresholds are off; cycles still fail.** `graph/feature-deps` fan-out and total-edge
thresholds are infinite because every edge is already argued in the importee's `visibility.json`. A count adds
nothing an argued grant does not.

**The review port lives in the store config.** `review.port` (default 4747) sets where `tastebud review` serves
and `record-browsing` links point; no second environment variable. `--port N` moves only that server.

**The snapshot is built in a domain, with no cache.** `TasteStore` exposes indexed records and
`domains/record-snapshot` builds the snapshot from them. Nothing caches it, so the inversion costs nothing.
Anyone adding a cache must place it in `record-store` and revisit this note first.

**Passthrough review services are accepted.** Every review feature has `ui → controllers → service → repo`,
even when a service only forwards. `health/trampolines` warns about each; those warnings are the cost of a
uniform shape and are not fixed by collapsing layers.

**Files are split, not exempted.** `health/file-size` keeps its 500/600 defaults with no exclusion list. When a
file outgrows them, split it by cohesive group. The vendored catalog under `lint/` is outside its roots, so syncs stay copies.

**`tastebud/no-long-comments` covers only ungoverned files.** Inside trees the catalog's `health/no-long-comments`
reports; running both would double-report.

**No agent-parity lint.** tk2's `tk/agent-parity` assumes the inverse model. `test/operation-surface-parity.test.ts`
checks instead that every agent operation has a CLI command and every human operation a review repo call.

**Review polls.** tk2 bans `refetchInterval`; Tastebud keeps it, because agents write from other processes and
there is no push channel.
