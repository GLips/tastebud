---
date: 2026-10-25
topic: taste-v2
status: building
---

# Taste v2 build spec

v2 turns the v1 demo into the full shape:

- **Places** replace free-form `applies_to`.
- **`taste.config.ts`** replaces `taste.yaml`.
- **Kinds** generalise memories and beliefs.
- **One operation registry** drives the CLI, an MCP server and the review UI.

It builds on `docs/brainstorms/2026-10-19-taste/map.md` and `scope.md`, and on Codex session `01a157c9-8e94-7323-9e99-257e20cb87a9`, rounds 1–5. Where this spec and `scope.md` disagree, this spec wins. `scope.md` predates places and kinds.

These invariants are unchanged and can't be configured:

- Sources are verbatim, attributed snapshots.
- Derivations change only through a human.
- Rejections are kept and read back.
- Files are append-only.
- The core never calls a model.

No backward compatibility: the schema is now `"2"`, the demo is reseeded, and nothing migrates.

## 1. Vocabulary

| Term | Meaning |
|---|---|
| **Source** | A record of a human's exact words: who said them, when, and the excerpt around them. Its `kind` is a configured **source kind**. The default kind is `memory`; the demo also has `call-quote`. |
| **Derivation** | A one-line conclusion an agent proposes from sources and a human ratifies. Its `kind` is a configured **derived kind**. The default kind is `belief`; the demo also has `insight` and `idea`. Users see kind labels; "derivation" is mostly a code and docs word. |
| **Decision** | A human's accept, reject or retract on a derivation. An accept may also amend the scope (§3.4). |
| **Thread entry** | One comment on a derivation's review thread. |
| **Place** | A path-like key naming where work happens (§2). |
| **Scope** | Where a derivation may apply: `global`, or a non-empty list of places. |
| **Context** | The places the caller is in now, resolved from a cwd (or `--in`) by the configured resolver. |
| **Catalog** | The effective set of kinds after the config has loaded. |

Code uses these nouns throughout. Examples: `SourceRecord`, `DerivationRecord`, `DerivationStatus`, `proposeDerivation`, `decideDerivation`, `recallDerivations`. Nothing is called `Belief*` in core except the default kind's key, `"belief"`.

## 2. Places

### 2.1 Syntax

A place key is one of three forms:

- **Repo place:** `<repo-id>::<subpath>`, e.g. `github.com/GLips/taste::apps/billing`, or `github.com/GLips/taste::` for the repo root. The `::` marks where repo identity ends, so a nested group (`gitlab.com/a/b/c`) can't be mistaken for a subdirectory. `::` is reserved for repo places.
- **Directory place:** `~/…` or an absolute `/…` path, e.g. `~/Notes/clients/acme`. `~` alone is the home directory, and `/` alone is the filesystem root.
- **Named place:** any other key, e.g. `clients/acme/ads`, made by custom resolvers and writers like a Granola sweep.

For all three, segments are split on `/` and empty segments are dropped. A key must be non-empty, with no whitespace at either end, no `..` or `.` segments, and no backslashes.

**Canonical form:**

- The repo id has no scheme, user or `.git`. An explicit port is kept (`git.example.com:2222/team/app`), since dropping it could merge distinct servers. The host is lowercased; the path keeps its case.
- The subpath has no leading or trailing `/`.
- A directory place is `~/…` when it is under `$HOME`, otherwise absolute. It has no trailing `/`.

### 2.2 Containment

`placeCovers(scopePlace, contextPlace)` is true when both keys have the same *root* and the scope place's segments are a prefix of the context place's segments.

- **Repo place:** the root is the repo id, and the segments are the subpath.
- **Directory or named place:** the root is `~`, `/`, or "named", and the segments are the whole path.

A repo place never covers a directory place, and vice versa. This is pure code in `src/shared/places.ts`, so the UI can use it too.

A derivation is **eligible** in a context when it is `global`, or when any of its effective scope places covers any context place. Descendants never count: a context of `~/Programming` does not make `~/Programming/x` eligible.

### 2.3 Resolvers

The config's `place` setting chooses the resolver.

**`"git"` (the default):**

1. Resolve `cwd` with realpath.
2. Run `git -C <cwd> rev-parse --show-prefix` and `git -C <cwd> config --get remote.origin.url`, one `Bun.spawn` each, with a short timeout.
3. With a remote, the place is `normalizeRemote(url)::<prefix>`. A linked worktree and a second clone give the same key for the same subdirectory. A subdirectory never equals its repo root; the root covers it.
4. Not a git repo, or no `origin` remote: use the cwd's directory place.
5. An `origin` that is a local path or a `file://` URL also falls back to the cwd's directory place, not the remote's.
6. A git timeout, a malformed origin, or a throwing custom resolver is a `PlaceResolutionFailed` diagnostic. It is never a silent switch to another identity. The hook treats it as unknown context and stays silent.

**`"directories"`:** always the directory place of the realpath'd cwd.

**A function** `(ctx: PlaceContext) => readonly string[] | Promise<readonly string[]>`. The returned keys are validated and canonicalised. It must be deterministic. An empty result means *unknown context*.

`normalizeRemote` handles these spellings:

- `git@host:path(.git)`
- `ssh://[user@]host[:port]/path`
- `https://[user[:pw]@]host[:port]/path(.git)`
- `git://…`

It strips credentials and is covered by a table test.

**Context precedence.** One function, `resolveTasteContext`, applies it. `in` and `at` are mutually exclusive.

1. An explicit `--in <dir>` / `in`, resolved by the resolver.
2. An explicit `--at <place>` / `at` (repeatable), taken as given after canonicalising. This says where the caller *is*. It is never where a proposal applies; that is `--place` (§2.4).
3. The caller's cwd: the CLI's `process.cwd()`, or the hook's JSON `cwd`.
4. MCP never uses the server process's cwd. If the client offers exactly one local (`file://`) root, that root is the cwd. With none or several, the context is unknown.

Capture-time resolver calls pass `source` metadata (kind, address, said_by). Recall-time calls omit it.

**Unknown context** means only global derivations are eligible, and a proposal must give its scope explicitly.

`resolveTasteContext` returns `{ places, origin: "in" | "at" | "cwd" | "mcp-root" | "unknown", cwd? }`. Recall output, the hook preview and the UI inspector show it.

### 2.4 Scope on records

Derivation frontmatter:

```yaml
scope: places          # or: global
places:                # required and non-empty iff scope is places; forbidden for global
  - github.com/GLips/taste::
scope_source: defaulted   # or: explicit. Defaulted means the proposer didn't choose it.
```

Source frontmatter gains an optional `captured_in: [<place>…]`. It records the capture context and nothing more: it never filters, and it never determines applicability. Raw-source recall is store-wide, and the docs say so.

**Proposal scope** is its own input: `--global`, or `--place <key>` (repeatable). Either one sets `scope_source: explicit`. With neither, the scope is defaulted from the proposer's context:

- **Git resolver:** the repo *root* place of each context place (`github.com/GLips/taste::`, even from `apps/billing`). A directory context place is used as is.
- **Directories resolver:** the context's directory place.
- **Custom resolver:** the places it returned.

A defaulted scope sets `scope_source: defaulted`.

- If the context is unknown and no scope is given, the proposal is refused with `ScopeRequired`. Sweeps and importers always pass scope explicitly.
- `ScopeRequired` carries the resolved context, and its message gives concrete retries (`--place github.com/x/y::`, `--global`, `--in <dir>`).
- The word "always" never widens anything; widening is the human's call.

## 3. Kinds and lifecycle

### 3.1 Catalog

Defaults ship in core (`src/core/catalog.ts`):

```ts
sourceKinds: { memory: { singular: "memory", plural: "memories", description: "A person's exact words, verbatim and attributed." } }
derivedKinds: {
  belief: {
    singular: "belief", plural: "beliefs",
    description: "How the owner works or what is true about their world, ratified by them.",
    sources: ["memory"],
    recall: "inject",
    acceptLabel: "Believe",
    proposalPrompt: BELIEF_PROPOSAL_PROMPT, // shipped text in src/core/prompts.ts
  },
}
```

If a config supplies `sourceKinds` or `derivedKinds`, that map replaces the default one. Custom kinds must give every field except `description`.

Load-time validation:

- Kind keys match `^[a-z][a-z0-9-]*$`.
- `sources` refers only to source kinds that exist.
- No key is both a source kind and a derived kind.

Records whose kind is no longer in the catalog are **retired**: list and show only. They can't be captured, proposed, accepted, recalled or injected.

### 3.2 Recall policy

- **`inject`:** eligible for the prompt hook, `context`, and pull recall.
- **`pull`:** pull recall, and `context --kind`. Never sent by the hook.
- **`never`:** never recalled. Only `list`, `show` and the review UI surface it. An ideas backlog is a list, not a recall.

### 3.3 Fixed semantics, the same for every kind

- **Statuses:** pending, accepted, rejected, retracted, superseded. Decisions are accept, reject or retract. The `acceptLabel` changes the button's wording only.
- **Supersession** requires an accepted target of the same kind.
- **Evidence:**
  - Every derivation directly cites at least one source in `supports`, of a kind listed in its derived kind's `sources`.
  - Further citations of derivations, of any kind, are allowed in `supports` and `contradicts`. They never count toward the rule above.
  - Every reference points to an existing record older than the one citing it.
- **Repeat check:** runs within the kind, across every status, against effective scopes.
  - Similarity uses the existing measure: blocking at ≥ `REPEAT_THRESHOLD` and related at ≥ `RELATED_THRESHOLD`. Both are defined once in `src/core/similarity.ts`.
  - A blocking match with an overlapping scope refuses the proposal (`NearRepeat`). The proposal passes once its `despite` lists every blocking id.
  - Scopes overlap when either is global, or when a place of one covers a place of the other in either direction. Disjoint-scope matches are only related.
- **`subject`** is optional: `owner`, or a source account.
  - It defaults to `owner` for the built-in `belief` kind. Other kinds have no subject unless one is given.
  - The speaker warning fires when the subject is `owner` and no cited source was said by the owner.
  - An idea inspired by a client quote has no subject, so it never implies the client endorsed it.

### 3.4 Scope amendment on accept

Only an accept decision may carry a complete scope override: `scope`, plus `places` when the scope is `places`. It means "accepted, with this scope".

- **The effective scope** is the deciding accept's override when present, otherwise the proposed scope.
- It stays the effective scope after a retraction or supersession.
- It governs recall, the repeat check, grouping, the audit and repoint.
- `show` returns both the proposed and the effective scope.

**Widening at accept is checked.** Accepting re-runs the repeat check against the effective scope. Blocking matches that the proposal's `despite` didn't already list must appear in the decision's `acknowledges: [ids]`; otherwise the decision fails with `WideningNeedsAcknowledgement`. The UI shows those matches in the acceptance preview and sends the acknowledgement. This closes the loophole of proposing narrowly to dodge a rejection and then widening at accept.

This keeps records append-only and makes scope part of what the human ratifies. Changing the scope of something already accepted takes a new revision (`supersedes`), proposed by `repoint` (§6) or by an agent.

## 4. Store and config

### 4.1 Location

`--store` wins, then `TASTE_STORE`, then `~/.taste`. One function, `resolveStoreRoot`, is used by the CLI, the hook, the MCP server and the review server. An empty string counts as unset.

### 4.2 Layout

```
~/.taste/
  taste.config.ts        # the one editable file
  .gitignore             # .index/
  sources/YYYY/MM/<date>[-<slug>].<short-id>.md
  derivations/YYYY/MM/…
  decisions/YYYY/MM/…
  threads/YYYY/MM/…
  .index/                # sqlite cache, listeners, locks; rebuildable
```

`type` (`Source`, `Derivation`, `Decision` or `ThreadEntry`) and `kind` live in frontmatter, not in paths.

### 4.3 `taste.config.ts`

It is a default-exported plain object. It needs no imports, so it loads in any store. `taste init` writes a commented starter.

```ts
type PlaceKey = string;
type PlaceContext = Readonly<{
  cwd?: string;
  source?: Readonly<{ kind: string; address?: string; saidBy?: string }>;
  env: Readonly<Record<string, string | undefined>>;
}>;
type Labels = Readonly<{ singular: string; plural: string; description?: string }>;
type DerivedKind = Labels & Readonly<{
  sources: readonly [string, ...string[]];
  proposalPrompt: string;
  recall: "inject" | "pull" | "never";
  acceptLabel: string;
}>;
type TasteConfig = Readonly<{
  owner: `human:${string}`;
  place?: "git" | "directories" | ((ctx: PlaceContext) => readonly PlaceKey[] | Promise<readonly PlaceKey[]>);
  sourceKinds?: Readonly<Record<string, Labels>>;
  derivedKinds?: Readonly<Record<string, DerivedKind>>;
  hook?: Readonly<{ limit?: number; budgetMs?: number }>; // defaults 3 and 650
}>;
```

- The core loads it with a dynamic `import()`, since Bun runs TS natively. The import is cache-busted by mtime, so a long-running review server picks up edits.
- The result is decoded with Effect Schema, except `place`, which is checked as `string | function`.
- The browser never receives the function. The server sends the UI a serialisable `CatalogView`: the kinds, the owner, the resolver's name (`"git"`, `"directories"` or `"custom"`) and the hook settings.

## 5. Operation registry

All behaviour lives in `src/core`. Each shell is a thin adapter:

- **CLI:** `src/cli`, using effect/cli.
- **MCP:** `src/mcp`, using the `@modelcontextprotocol/sdk` low-level `Server` over stdio.
- **Review server:** `src/server`, as TanStack server functions.
- **Hooks:** run as `taste hook prompt`.

```ts
// src/core/operation.ts
declareTasteOperation({
  name: "recall",                 // CLI `taste recall`; MCP tool `taste_recall`
  audience: "agent" | "human",    // human operations are never on agent surfaces
  kind: "query" | "command",
  description: "…",               // MCP description, CLI help
  input: Schema.Struct({...}),    // annotated; its encoded form becomes the MCP JSON schema
  output: Schema.Struct({...}),
  run: (input, caller) => Effect<A, TasteError, TasteServices>,
  renderText: (a) => string,      // the text the CLI prints and MCP returns
})
```

- **Registry:** `TASTE_OPERATIONS` is a single `as const` record. Dispatch keeps each operation's input and output types; it never erases them into one union.
- **Dispatch:** `runTasteOperation(name, unknownInput, caller)` decodes with `{ errors: "all", onExcessProperty: "error" }` and then runs.
- **Results:** each operation declares an `output` schema, and its results are JSON-compatible objects.
- **Caller:** `caller` is `{ via: "cli" | "mcp" | "review" | "hook", actor?: string, context: TasteContext }`. Adapters build it; it is never read from input.
- **Shells share contracts, not construction:**
  - The effect/cli commands are written out explicitly. They map arguments, flags and stdin into the operation's input.
  - MCP generates each tool's JSON schema from the operation's *encoded* input schema.
  - TanStack exports explicit server functions that delegate through server-only modules.
  - The browser-safe contracts (`src/shared`) stay separate from the handlers (`src/core`).
- **Errors:** every `TasteError` is a `Data.TaggedError` with a `message` getter. One function in core, `describeTasteFailure(error)`, gives the sentence, a category (`input`, `refused`, `conflict` or `broken`) and the exit code. The CLI, MCP and the server all use it, so there is one mapper, not three.
- **JSON:** `--json` on the CLI prints the result, and MCP returns it as `structuredContent` alongside `renderText`.

### 5.1 Operations

| Name | Audience | What it does |
|---|---|---|
| `catalog` | agent | Kinds, prompts, the resolved context and the store root. This is what an agent reads first. |
| `capture` | agent | Append a source of a given kind. `captured_in` defaults to the context. |
| `propose` | agent | Append a derivation of a given kind, with a scope (§2.4) and the repeat check. |
| `recall` | agent | Eligible derivations of `inject` and `pull` kinds ranked by text, then rejections ("not accepted"), then matching sources. Takes `--kind` and `--history`. Each hit carries an explanation: policy, status, which place matched, and score. |
| `context` | agent | Every accepted, eligible derivation of the selected kinds (default: the `inject` kinds), for a SessionStart hook. |
| `list` | agent | Derivations filtered by kind, status, place, subject or text. Sources too, with `--sources`. |
| `show` | agent | One record with its evidence, decisions, thread, reverse links, and proposed and effective scope. |
| `thread-reply` | agent | Append an agent entry to a derivation's thread. |
| `hook-preview` | agent | The exact payload the prompt hook would inject for a prompt and context. |
| `places` | agent | Places in use, with counts by kind and status; the resolved context for a dir; the scope audit (§6). |
| `review-url` | agent | The review UI's URL for the store or for one record, so an agent can hand the human a link. |
| `repoint` | agent | Propose revisions that replace exact place A with B on accepted derivations (§6). It only proposes, so agents may call it. |
| `reindex` | agent | Rebuild `.index/`. |
| `inbox` | human | Pending derivations grouped by kind, then scope, then subject. |
| `decide` | human | Accept (with an optional scope amendment and acknowledgements), reject or retract. Reached only through the review UI's server functions. `taste decide <ref>` opens that record's review page and writes nothing. |
| `thread-note` | human | A human's comment on a thread, from the review UI. |
| `init`, `seed` | human | CLI only. |

The MCP server exposes every `agent` operation as `taste_<name>`, with `-` turned into `_`. `review listen` and `review` stay CLI process commands.

**Trust boundary.** Neither an actor string nor `audience: "human"` proves a human acted. Human operations are kept off the agent surfaces, CLI and MCP alike: the only writers of decisions and human thread notes are the review server and `taste seed`. The local filesystem remains the trust boundary. Taste does not claim protection against an agent that deliberately writes files.

## 6. Scope audit and repoint

A resolver can't prove that a place will never come back, so the audit only compares effective scope places against **probes** the caller supplies.

- **Probes:** directories (`--probe <dir>`, resolved by the configured resolver) or place keys.
- **Default probes:** the CLI uses its cwd. The UI uses the directories typed into the Places page tester, kept in local storage.
- **Unmatched place:** a scope place on an accepted derivation that covers none of the probes. It is reported as "unmatched by these probes", and the probes are listed.
- **Repoint `--from A --to B`** proposes a superseding revision, `pending`, for each accepted derivation whose effective scope contains exactly A.
  - Only A is replaced; the other places stay, and the result is de-duplicated.
  - The statement is unchanged.
  - The proposal is marked `proposed_by: process:repoint`, cites the same supports, and needs normal ratification.

## 7. Hooks

- **`taste hook prompt`** is the UserPromptSubmit hook.
  - It reads `{prompt, cwd}` JSON on stdin and resolves context from `cwd`.
  - It builds the payload with only `inject` kinds, at most `hook.limit` items, and a deadline of `hook.budgetMs`.
  - It prints the Claude Code hook JSON (`hookSpecificOutput.additionalContext`).
  - It always exits 0.
  - Install: `{"type":"command","command":"taste hook prompt"}`.
- **`taste hook preview`** shows the prompt payload, through the same builder.
- **Deferred: file-touch recall** (PostToolUse on Read and Edit, from the touched file's directory). It needs a relevance query, de-duplication based on what was actually delivered, context-reset handling and budgets. Post-edit delivery also lands too late to guide that edit. The `in` input is the seam it will use.

## 8. Review UI

- **Routes:**
  - `/` is the inbox.
  - `/kinds/$kind` is a kind's library, and `/derivations/$id` is the detail page.
  - `/sources` lists sources; `/sources/$id` is a source.
  - `/recall` is the inspector.
  - `/places` holds the places, the audit and the context tester.
  - `/settings` shows the catalog and the hook install snippet.
- **Inbox:**
  - Tabs or a segmented control by kind, with counts.
  - Cards show the scope as place chips. Global is an explicit orange chip, and a defaulted scope says "from <place>". The scope editor is inline.
  - Accept uses the kind's `acceptLabel`. When the scope was edited, or the effective scope overlaps blocking matches, accept first opens an **acceptance preview**. It shows the statement, the effective places, and any newly overlapping rejections or near repeats, which must be acknowledged before the decision is sent.
  - Batch accept stays within one kind and one scope group.
- **Detail:** as in v1, plus scope chips (proposed and effective), an "edit scope → propose revision" action once accepted, and the kind label everywhere.
- **Recall inspector:**
  - The context origin and its places.
  - A "pretend I'm in <dir>" input, and a kind filter.
  - The Injected panel.
  - An explanation per hit: policy, status, matched place and score.
  - Close items that were excluded, with the reason: out of scope, `never` policy, or pending.
- **Places page:**
  - The place tree, with repo places grouped by repo.
  - Counts per kind.
  - The audit against probes, with a repoint action.
  - A "where am I?" tester that resolves a typed path.
- **Settings:** owner, resolver, kinds (labels, policy, sources, and the prompt in a collapsible) and the store root. It's read-only, since the config is code edited in a text editor.

## 9. Tooling

Adopted from tk2, scaled to Taste's size:

- `oxfmt` with sorted imports, as one formatting commit before v2 code lands.
- `oxlint` with type-aware rules, plus a local `taste/no-long-comments` rule (60 words or 15 lines, doubled for a file header).
- `knip`.
- `lefthook`: format first, then lint, typecheck and test in parallel.
- `scripts/check.ts`, which runs all of the checks in parallel.
- `bun test` stays.

## 10. Tests

Integration tests run through operations, with temp stores and real git.

1. **Places:**
   - A `normalizeRemote` table, including ports and credentials.
   - `placeCovers`: ancestor, equal, descendant and cross-root.
   - The git resolver gives identical keys for the same subdirectory from a linked worktree and from a second clone. A subdirectory's key is covered by the root's, not equal to it.
   - Without a remote, it gives a directory place.
2. **Config:** a custom resolver function and custom kinds load. A bad kind reference fails with a clear error.
3. **Lifecycle per kind:**
   - Propose with a defaulted scope and accept with an amended scope. Recall finds it only where the amended scope covers.
   - A `never` kind is absent from recall and shown by `list`.
   - Only `inject` kinds reach the hook payload.
4. **Repeat check:**
   - It blocks within a kind when scopes overlap.
   - It is related-only when scopes are disjoint.
   - It ignores other kinds.
   - `despite` lets a proposal through.
5. **Supersession, repoint and accept conflicts:**
   - Supersede and repoint, with other places kept.
   - A double accept conflicts.
   - Widening at accept without an acknowledgement is refused.
6. **Carried over from v1:** reindex parity (v1 test 4) and the listener (v1 test 5).
7. **MCP over stdio,** with the SDK `Client`:
   - `tools/list` holds exactly the agent operations.
   - `taste_propose` then `taste_recall` work with an `in` argument.
   - Invalid input gives `isError`.
8. **CLI:** `taste capture`, `propose`, then `recall --json`, end to end in a temp store via `Bun.spawn`. `taste decide` writes nothing.
9. **`taste hook prompt`** with stdin fixtures: inject kinds only, the limit, and silence on unknown context.

## 11. Demo seed

`taste seed` writes a store whose config declares:

- **Source kinds:** `memory` and `call-quote`.
- **Derived kinds:**
  - `belief` (inject)
  - `insight` (pull, from `call-quote`)
  - `idea` (never, from `call-quote` and `memory`, with the accept label "Worth doing")

The seed spans:

- two repo places, `github.com/acme/web::` and `github.com/acme/billing-api::`;
- a monorepo subpath, `github.com/acme/web::apps/checkout`;
- a named place, `clients/acme`;
- some global beliefs.

It includes:

- pending, accepted, rejected and superseded derivations;
- a defaulted scope;
- a `despite`;
- a thread;
- an accept with a scope amendment;
- a place that the audit reports as unmatched.

## 12. Record fields (schema "2")

Every record has `id` (UUIDv7), `type` and `schema_version: "2"`. Fields stored in the markdown body are marked *Body*.

| Type | Fields |
|---|---|
| `Source` | `kind`, `said_by` (account), `said_by_label`, `said_at`, `said_at_precision` (second/minute/day), `captured_at`, `captured_via` (actor, never `human:`), `address?`, `captured_in?` (places), `revises?` (a source of the same kind). *Body:* `quote`, `before?`, `after?` |
| `Derivation` | `kind`, `statement` (one line), `scope` (global/places), `places?`, `scope_source` (defaulted/explicit), `subject?`, `supports` (≥1, see §3.3), `contradicts?`, `supersedes?`, `despite?` (ids), `proposed_by` (actor), `proposed_at`. *Body:* `reasoning`, `despite_case?` |
| `Decision` | `target` (derivation id), `outcome` (accept/reject/retract), `by` (`human:`), `at`, `reason?` (required for reject), `scope?` and `places?` (accept only), `acknowledges?` (ids, accept only), `via?` (process actor, e.g. the seed) |
| `ThreadEntry` | `thread` (derivation id), `author` (actor or `human:`), `at`. *Body:* `text` |

`despite` is now a list, where v1 had one id, because a proposal must name every blocking match.
