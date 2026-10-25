---
date: 2026-10-19
topic: taste-scope
status: proposal, awaiting Graham
---

# Where a belief applies: scope as location

A proposal for replacing free-form `applies_to` tags. It was argued to agreement between Claude and Codex (session `01a157c9-8e94-7323-9e99-257e20cb87a9`). It is not yet a decision in the map.

Research it draws on:

- `~/research/2026-10-19-agent-memory-scoping.md`: how other agents and memory layers scope items.
- `~/research/2026-10-19-agent-hooks-cwd-worktrees.md`: what hooks receive, and where worktrees live.
- `~/research/2026-10-19-memory-write-time-scope.md`: how products pick scope when writing, conditions versus scope, and staleness.

## The problem

`applies_to` is a list of strings the proposing agent makes up, and leaving it off means "everywhere". Nothing ties those strings to anything real:

- an agent can't know the vocabulary;
- the hook can't tell which tag applies;
- a forgotten field silently makes a belief global.

Embedding-ranked recall makes tags weaker still. Similarity can tell you a belief is *about* the current task. It can't tell you the human meant it to *apply* here: two Effect repos both match "model failures as TaggedErrors".

## The idea

**Scope says where a belief may apply. Relevance says which eligible belief fits the prompt.** Scope is a hard filter, resolved from the directory the agent is working in. Ranking (text now, embeddings later) only orders what passes the filter.

A "place" is a working context where certain judgments hold: a repo, a client folder, a manuscript, an ops workspace. A directory is a fine stand-in for one in v1, because everyone using Taste works out of a file system. More to the point, a directory is an address the caller can observe without inventing a vocabulary. The assumption breaks in a few places, and v1 states them as limits rather than solving them:

- chat-only agents with no cwd;
- cloud agents in fresh containers;
- different folder layouts on different machines;
- teammates sharing a store.

Domain or tool beliefs ("Effect", "Stripe webhooks") don't need a domain scope. They are global beliefs whose condition lives in the statement: "When using Effect, model recoverable failures as TaggedErrors." Global means eligible everywhere, not relevant everywhere; ranking still has to match.

## Rules

1. **Store:** `--store`, then `TASTE_STORE`, then `~/.taste`. The current default is `./.taste` under the cwd, which quietly makes stores per-directory. There is one personal store, with no upward discovery and no merging of stores.
2. **Scope is required.** Every belief is either `global` or a non-empty list of directory roots. Leaving it off is invalid; global never happens by omission.
3. **Paths:** roots under home are stored as `~/…`, so they survive a second machine with a different home but the same layout. Anything else is stored as an absolute path. Matching is by path component (`/repo/a` doesn't contain `/repo/ab`), with symlinks resolved consistently.
4. **Worktrees:** a linked worktree maps to its main worktree plus the same relative path (`git rev-parse --show-toplevel`, then `git worktree list --porcelain -z`, where the main tree is listed first). This happens on both sides: when roots are written at proposal time, and when the working directory is resolved at recall time. The Codex app (`$CODEX_HOME/worktrees`) and Windsurf (`~/.windsurf/worktrees`) put worktrees outside the repo, so plain containment fails there. Claude Code's `.claude/worktrees/` fails for any root below the repo root. Bare repos, or no git at all, fall back to literal paths.
5. **Recall context:** an explicit `--in <dir>` wins. Otherwise the CLI uses its cwd, and the hook uses the `cwd` in its JSON input; that `cwd` follows `cd` and worktree entry, unlike `CLAUDE_PROJECT_DIR`. With no known context, only global beliefs are eligible.
6. **Eligibility** = global beliefs, plus beliefs with a root that contains the resolved directory, so monorepo packages inherit repo-level beliefs. Descendants never count: a session started at `~/Programming` must not make every project eligible. The filter runs before ranking and before the three-item limit. Scope is printed on injected beliefs and on rejections.
7. **Proposal default:** the proposer's git toplevel (after worktree mapping), otherwise its cwd. The UI labels the second case "current directory", not "project". An agent may pass explicit roots or global. Sweeps and importers (tk2, the journal) must pass scope, because a service's own cwd isn't task context. A proposal with no task context and no explicit scope is refused. The word "always" alone doesn't mean global: "always do X in billing" stays scoped to billing.
8. **Review:** the inbox shows the exact roots and whether they were defaulted or chosen. The human ratifies the statement and its scope together, and can narrow it, add roots or make it global before accepting. Changing scope after acceptance takes a new revision, like rewording.
9. **Deleted:** tags, the free-form `TASTE_SCOPE` and `--applies-to`, and the "Everywhere" default. Also not added: a separate condition field, topic hints, `audience`, a pending-scope state, repo identity and expiry.
10. **One resolver** serves recall, context, the hook, `hook preview` and the review UI's recall inspector. The schema changes and the demo is reseeded, with no migration.

Record shape (frontmatter; the body and decision records are unchanged):

```yaml
schema_version: "2"
type: Belief
statement: "When writing tests, prefer integration tests over mocks."
scope_kind: directories        # or: global (and no scope_roots)
scope_roots:
  - ~/Programming/billing-api
scope_source: defaulted        # or: explicit
subject: owner
supports: [<memory-id>]
```

`scope_source` is the one field added beyond what Codex wrote. It is there for rule 8's "defaulted or chosen" and can be cut if the UI can get that from elsewhere.

## Considered and dropped

- **Repo identity** (normalised git remote, a `.taste/project.toml` id, aliases): it solves independent clones and teammates, but forks, renames, mirrors and copied templates make it a second product. If sharing becomes a requirement, use an explicit workspace id rather than guessing from remotes.
- **Scope as file location** (a `.taste/` in each project, like CLAUDE.md): it makes git sharing and portability free. But a belief is tied to its quotes, decisions, rejections and thread. Moving the file to widen it would change where it applies without a new ratification, and would push private verbatim quotes into repos.
- **Descendant eligibility** (a hook at the monorepo root also sees `apps/billing` beliefs, ranked lower): the vaguer the caller's location, the more Taste would hand over. Labelling the belief just passes the scope decision on to the agent.
- **A separate condition field:** nothing can check "when writing tests" at prompt time, so the field would just be a second description.

## Known gap, and the planned answer

A hook fired at a monorepo root won't see beliefs scoped to `apps/billing` until the agent passes `--in apps/billing`. The planned answer is file-touch recall: recall for the directory of the file the agent just read or edited.

- Codex documents `additionalContext` on `PreToolUse`.
- Claude Code, Cursor, Gemini and Copilot document it on `PostToolUse`. That can shape the agent's next step, not a write that has already happened.

This is not part of this change. Rule 5's `--in` is the seam it plugs into.

## Graham's calls

1. **Directory beliefs follow the same path across branches and worktrees.** There is no worktree- or branch-specific scope. Recommended: yes, since a branch-only fact isn't a lasting preference.
2. **Single machine layout, no teammates in v1.** `~/…` paths cover a second machine only if its layout matches. Recommended: accept, and revisit when sharing is designed.
3. **Default store moves to `~/.taste`.** Recommended: yes; the cwd-relative default contradicts everything above.
4. **The monorepo-root gap stays until file-touch recall exists.** Recommended: accept.
5. Whether to record this in the map as a decision (D9), and whether it deserves an ADR.
