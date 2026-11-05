# Tastebud: build notes

Deviations from the spec, shortcuts, and open questions that still hold. The contract is [`v2-spec.md`](v2-spec.md).

## Core and storage

- **SQLite:** core wraps `bun:sqlite` directly rather than an Effect SQL client. The index is a disposable cache refreshed with sync prepared statements; Effect services and errors still wrap it. Core therefore needs Bun: `tastebud` ships compiled with Bun inside, serving the review server functions in-process, and `dev:review` runs `bun --bun vite`.
- **Filesystem:** core uses `node:fs` sync calls inside Effects rather than an Effect `FileSystem` service.
- **Index:** one `records` table, a `files` table and an FTS5 `search` table (porter stemming, ranked by bm25). Status and reverse links are computed in TypeScript from a full snapshot on every read, which is fine at the scale of one person's store.
- **Freshness:** a removed or touched file triggers a full rebuild; new files are added incrementally. A rebuild deletes only `taste.sqlite*`, so listener cursors in `.index/listeners/` survive `tastebud reindex`. Deleting `.index/` by hand resets them.
- **Index deleted under a running process:** every refresh checks the index file's inode and reopens when it has changed or gone, so a long-lived `tastebud review listen` or review server survives `rm -rf .index`.
- **Exclusive writes:** a record is written to a temp file and hard-linked into place. `link` fails if the target exists, so it stays exclusive, and a poller never reads a half-written file.
- **UUIDv7:** generated in core, not with `Bun.randomUUIDv7()`, whose `rand_a` is a sub-millisecond counter that leaves short ids almost no randomness. The short id in a file name skips the version nibble.
- **Body sections:** a source's body splits on `## Quote`, `## Before` and `## After` lines, so a quote that itself contains such a line would be split there.
- **Times:** `said_at` may omit seconds (minute precision is inferred), and every time needs an offset. New records are stamped in local time with milliseconds and an offset.

## Similarity and recall

- **Stopwords include negations and "always"** (`not`, `no`, `never`, `only`, `always`), so "Use X" and "Never use X" are near repeats. That's deliberate: a human should see both. It's a product call, still open.
- **`use`, `uses`, `used` and `using` are stopwords,** or any prompt containing "use" would match every "Use …" statement. Other imperative filler (`prefer`, `avoid`) is kept because it carries stance.
- **Open: recall relevance.** Repo and project names count as search words, and any top-3 full-text hit counts as related, so unrelated items with a shared name can surface. Options are dropping place names from query tokens, or a minimum bm25 score for the hook and for related lists.

## Shells

- **effect/cli platform:** there is no `@effect/platform-bun`, so `packages/cli/src/infrastructure/cli-platform-layer.ts` builds the layer `Command.run` needs by hand. Tastebud uses no prompts, file flags or effect child processes.
- **Review server functions:** `createServerFn` references live in each feature's `controllers/*.ts` (plain `.ts` names) under `apps/review/src/features/`, and core is reached only through `repo/*.server.ts` modules and `infrastructure/tastebud-core.server.ts`. importProtection denies `**/*.server.*`, core's `features/` and `infrastructure/`, the non-domain `@tastebud/core` subpaths, `bun:sqlite` and `node:*` to the client, and the browser must import the function references. Type-only imports from core are erased and allowed.
- **Listener:** emits human thread notes only, not decisions. The first poll for a new name only creates its cursor, so notes from before a listener first started are never printed.

## Demo seed

- **Through operations:** `tastebud seed` (`seedTasteDemoStore` in `packages/cli/src/features/demo-seed/controllers/seed-demo-store.ts`) writes every record through `runTasteOperation`, including `decide` and `thread-note` for Dana's decisions and notes, written `via: process:seed`. The repeat check and evidence rules apply to the seed as to any agent, so a core change that breaks a rule breaks the seed loudly.
- **Config by hand:** the seed writes `tastebud.config.ts` itself, because core's `initStore` only writes the starter config. It refuses a root that already has a config or any records.
- **Dates:** only `said_at` is in the past. `captured_at`, `proposed_at` and decision times are the moment the seed ran, because core stamps them.
- **Committed demo store:** `demo/.tastebud` is checked in so the review UI has something to show; its own `.gitignore` keeps `.index/` out. Regenerate it with `rm -rf demo/.tastebud && tastebud seed --store demo/.tastebud`.
