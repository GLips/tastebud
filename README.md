<p align="center"><img src="docs/assets/banner.png" alt="taste: your taste, remembered" width="100%"></p>

# Taste

An opinionated memory layer for agents.

Execution is cheap now that agents do it, so a person's judgment is the moat. Taste captures the ad hoc decisions and preferences a person brings: their words, verbatim, with provenance. It turns patterns in those words into conclusions the person ratifies, never forgets a rejection, and hands agents the right conclusion in the right place.

You bring the sources and the agents. Taste fetches nothing and calls no model.

> Status: v2. It runs from source with [Bun](https://bun.sh). The contract is [`docs/v2-spec.md`](docs/v2-spec.md); build notes are in [`docs/notes.md`](docs/notes.md).

## The model

- **Sources are someone's exact words.** A source records who said what, when and where, with a frozen excerpt around it, so it still makes sense after the original is edited or deleted. Each source has a kind: the default is `memory`, and a store can add others, like `call-quote` for customer calls. An edit becomes a new source that `revises` the old one. An agent's own words are never a source.
- **Derivations are one-line conclusions a human ratified.** An agent proposes one, citing the sources it rests on, and only the owner accepts, rejects or retracts it. The default derived kind is `belief` ("how I work"); a store can add others, like `insight` ("what customers keep telling us") or `idea` ("things to try"). Each kind ships its own proposal prompt, and its recall policy says whether agents get it injected, can pull it, or never see it.
- **Places say where work happens.** A place is a repo (`github.com/acme/web::`, or a subpath like `github.com/acme/web::apps/checkout`), a directory (`~/Notes/clients/acme`) or a name (`clients/acme`). A derivation's scope is `global` or a list of places, and it applies wherever one of its places covers where you are. A proposal with no scope defaults to the repo you're in. Agents never widen a scope on their own; the owner can amend it when they accept.
- **Nothing changes without the owner.** An accepted derivation never edits itself. New evidence becomes a new proposal that `supersedes` the old one, and that needs ratifying too.
- **Rejections are kept and read back.** "We don't actually think this" is stored with the reason. A new proposal that nearly repeats a rejection in an overlapping scope is refused unless the agent names it with `--despite` and says what changed. Recall shows rejections next to what was accepted.

Everything else follows from that. The store is append-only markdown with YAML frontmatter, one file per source, derivation, decision and thread entry, laid out by month (`sources/2026/10/…`). The SQLite index in `.index/` is a cache you can delete. The folder can live in git, Dropbox or an Obsidian vault, and you can read it without Taste running.

## Try it

```bash
git clone https://github.com/GLips/taste && cd taste
bun install
ln -s "$PWD/src/cli/main.ts" ~/.local/bin/taste   # any directory on your PATH

taste seed --store /tmp/taste-demo                # a fictional store: Dana, Acme's web and billing repos, three customer calls
export TASTE_STORE=/tmp/taste-demo
taste recall "tailwind styling" --at github.com/acme/billing-api::
taste review                                      # review UI on http://localhost:4747
```

[`docs/demo.md`](docs/demo.md) is a five-minute tour of that store. For your own store, `taste init` writes a commented `~/.taste/taste.config.ts`.

The store is `--store`, else `$TASTE_STORE`, else `~/.taste`.

## The CLI at a glance

| Command | What it does |
|---|---|
| `taste catalog` | The kinds in this store, each kind's proposal prompt, where you are. Agents read it first. |
| `taste capture` | Append a source: someone's exact words. |
| `taste propose` | Propose a derivation that cites sources, with a scope and the near-repeat check. |
| `taste recall "<query>"` | What applies here: accepted, then rejected, then raw sources, each with why it matched. |
| `taste context` | Every accepted derivation of the inject kinds that applies here, for session start. |
| `taste list` / `taste show <ref>` | Browse by kind, status, place, subject or text; one record with its evidence, decisions and thread. |
| `taste thread-reply <ref> "<text>"` | Answer the owner's note on a review thread. |
| `taste review` / `taste review listen` | The review UI; a long-lived listener that wakes an agent when the owner writes a note. |
| `taste places` / `taste repoint` | Places in use and an audit of scopes that match none of your directories; propose moving a scope from one place to another. |
| `taste hook prompt` / `taste hook preview` | The prompt hook, and exactly what it would inject. |
| `taste mcp` | The agent commands as MCP tools over stdio. |
| `taste init` / `taste seed` / `taste reindex` | A new store; the demo store; rebuild the index. |

Every command has `--help`, and most take `--json`. Commands that read where you are take `--in <dir>` (resolve that directory) or `--at <place>` (take that place as given). Exit codes: 0 ok, 1 broken, 2 bad input (including a proposal with no scope from an unknown place), 3 refused (a near repeat), 4 conflict.

Only the owner decides, and only in the review UI. `taste decide <ref>` prints the record's review link and writes nothing.

## Agents

**The skill.** [`skills/taste/SKILL.md`](skills/taste/SKILL.md) teaches an agent when to capture, propose, recall and listen. For Claude Code:

```bash
ln -s "$PWD/skills/taste" ~/.claude/skills/taste
```

**MCP.** `taste mcp` serves the agent commands as tools (`taste_catalog`, `taste_recall`, `taste_propose`, …). The owner's commands are never exposed. The server never uses its own working directory: when the client offers exactly one `file://` root, that is where the agent is; otherwise tools take `in` (a directory) or `at` (places).

```bash
claude mcp add taste -- taste mcp                          # Claude Code
codex mcp add taste -- taste mcp                           # Codex
```

Cursor reads `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{ "mcpServers": { "taste": { "command": "taste", "args": ["mcp"] } } }
```

Add `--store <dir>` after `mcp`, or set `TASTE_STORE` in the server's environment, to use a store other than `~/.taste`.

**The prompt hook (opt-in).** `taste hook prompt` is a Claude Code `UserPromptSubmit` hook. It resolves where the session is from the hook's `cwd`, and adds at most three accepted or rejected derivations of the `inject` kinds that match the prompt, labelled as evidence. It never adds raw sources, gives up silently after 650 ms, and always exits 0. Add it to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "taste hook prompt" }] }]
  }
}
```

`taste hook preview "<prompt>"` shows exactly what it would inject, and so does the review UI's recall inspector.

## `taste.config.ts`

Each store has one editable file. It default-exports a plain object, so it needs no imports, and the review server picks up edits without a restart.

```ts
export default {
  owner: "human:dana",

  // "git" (the default): a repo place from the origin remote, else the directory.
  // "directories": always the directory. Or a function, which replaces both:
  place: ({ cwd, source }) => {
    if (source?.address?.startsWith("granola://")) return ["clients/acme"];
    const client = cwd?.match(/\/Notes\/clients\/([^/]+)/)?.[1];
    return client === undefined ? [] : [`clients/${client}`]; // [] means "unknown": only global applies
  },

  // Giving sourceKinds or derivedKinds replaces the defaults (memory, belief) whole.
  sourceKinds: {
    memory: { singular: "memory", plural: "memories" },
    "call-quote": { singular: "call quote", plural: "call quotes" },
  },
  derivedKinds: {
    belief: {
      singular: "belief", plural: "beliefs",
      sources: ["memory"], recall: "inject", acceptLabel: "Believe",
      proposalPrompt: "Propose a belief when the owner's own words show a durable preference…",
    },
    insight: {
      singular: "insight", plural: "insights",
      description: "What customers keep telling us.",
      sources: ["call-quote"], recall: "pull", acceptLabel: "Accept",
      proposalPrompt: "Propose an insight when two or more customers, on different calls, say the same thing…",
    },
  },

  hook: { limit: 3, budgetMs: 650 },
};
```

- A resolver function gets `{ cwd, source, env }` and returns place keys. It must be deterministic. `source` is set only when capturing.
- `recall` is `inject` (the hook, `context` and recall), `pull` (recall and `context --kind` only) or `never` (only list, show and the review UI).
- `sources` lists the source kinds a derivation of that kind must cite. A kind you remove later is retired: its records stay readable but can't be proposed, accepted or recalled.
- The demo's [`demo/.taste/taste.config.ts`](demo/.taste/taste.config.ts) has three full proposal prompts to copy from.

## Out of scope

Fetching or ingesting sources, agent-authored sources, summarised sources, derivations that change themselves, topics and oracles, decay ranking, and writing derivations into other files such as CLAUDE.md.

## Prior art

Karpathy's LLM wiki, Matt Pocock's personal wiki, Yak's memory and builder packages, basic-memory (files as truth), Graphiti (two timelines), Letta (a commit per edit), the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) (records are OKF-conformant through `type` and actor ids), and the Agent Memory Atlas's "rejected-value tombstone".
