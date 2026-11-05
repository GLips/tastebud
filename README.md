<p align="center"><img src="docs/assets/banner.png" alt="tastebud: your taste, remembered" width="100%"></p>

# Tastebud

An opinionated memory layer for agents.

Execution is cheap now that agents do it, so a person's judgment is the moat. Tastebud captures the ad hoc decisions and preferences a person brings: their words, verbatim, with provenance. It turns patterns in those words into conclusions the person ratifies, never forgets a rejection, and hands agents the right conclusion in the right place.

You bring the sources and the agents. Tastebud fetches nothing and calls no model.

> Status: v2. It ships as one compiled executable; working on it needs [Bun](https://bun.sh). The contract is [`docs/v2-spec.md`](docs/v2-spec.md); build notes are in [`docs/notes.md`](docs/notes.md).

## The model

- **Sources are someone's exact words.** A source records who said what, when and where, with a frozen excerpt around it, so it still makes sense after the original is edited or deleted. Each source has a kind: the default is `memory`, and a store can add others, like `call-quote` for customer calls. An edit becomes a new source that `revises` the old one. An agent's own words are never a source.
- **Derivations are one-line conclusions a human ratified.** An agent proposes one, citing the sources it rests on, and only the owner accepts, rejects or retracts it. The default derived kind is `belief` ("how I work"); a store can add others, like `insight` ("what customers keep telling us") or `idea` ("things to try"). Each kind ships its own proposal prompt, and its recall policy says whether agents get it injected, can pull it, or never see it.
- **Places say where work happens.** A place is a repo (`github.com/acme/web::`, or a subpath like `github.com/acme/web::apps/checkout`), a directory (`~/Notes/clients/acme`) or a name (`clients/acme`). A derivation's scope is `global` or a list of places, and it applies wherever one of its places covers where you are. A proposal with no scope defaults to where you are: under the default `git` resolver, the repo you're in. Agents never widen a scope on their own; the owner can amend it when they accept.
- **Nothing changes without the owner.** An accepted derivation never edits itself. New evidence becomes a new proposal that `supersedes` the old one, and that needs ratifying too.
- **Rejections are kept and read back.** "We don't actually think this" is stored with the reason. A new proposal that nearly repeats a rejection in an overlapping scope is refused unless the agent names it with `--despite` and says what changed. Recall shows rejections next to what was accepted.

Everything else follows from that. The store is append-only markdown with YAML frontmatter, one file per source, derivation, decision and thread entry, laid out by month (`sources/2026/10/…`). The SQLite index in `.index/` is a cache you can delete. The folder can live in git, Dropbox or an Obsidian vault, and you can read it without Tastebud running.

## Install

Install is only getting an agent connected. Setup is a conversation the agent leads.

Tastebud is one executable with the review UI inside; nothing else to install, no Bun. Releases aren't published
yet, so for now build it from a checkout (see [Developing](#developing)). Once they are:

```bash
curl -fsSL https://github.com/GLips/tastebud/releases/latest/download/install.sh | sh   # into ~/.local/bin
# or: npm install -g tastebud, or download tastebud-<os>-<arch>.tar.gz from the release page

claude mcp add tastebud -- tastebud mcp   # Claude Code (Codex: codex mcp add tastebud -- tastebud mcp)
```

The skill (when to capture, propose and recall) is [`skills/tastebud`](skills/tastebud); copy or link it into
`~/.claude/skills/tastebud`. Binaries run on macOS (arm64, x64) and Linux (x64, arm64). A config may import its own
relative files and `node:` builtins, never packages.

Then **ask your agent to set Tastebud up**, or run `/mcp__tastebud__setup` in Claude Code. An agent with only the CLI reads the same interview from `tastebud setup-guide`. It asks whose words you want kept and from where, what conclusions you want drawn from them, and where your work lives. It tests the place resolver on your real directories, shows you the whole `tastebud.config.ts` and its diff, and writes it once you say yes. Then it captures something you said during the interview and hands you the review link.

The store is `--store`, else `$TASTEBUD_STORE`, else `~/.tastebud`. Without an agent, `tastebud init` writes a commented starter config.

## Try the demo

```bash
tastebud seed --store /tmp/tastebud-demo   # a fictional store: Dana, Acme's web and billing repos, three customer calls
export TASTEBUD_STORE=/tmp/tastebud-demo
tastebud recall "tailwind styling" --at github.com/acme/billing-api::
tastebud review                            # review UI on http://127.0.0.1:4747
```

[`docs/demo.md`](docs/demo.md) is a five-minute tour of that store.

## The CLI at a glance

| Command | What it does |
|---|---|
| `tastebud catalog` | The kinds in this store, each kind's proposal prompt, where you are. Agents read it first. |
| `tastebud capture` | Append a source: someone's exact words. |
| `tastebud propose` | Propose a derivation that cites sources, with a scope and the near-repeat check. |
| `tastebud recall "<query>"` | What applies here: accepted, then rejected, then raw sources, each with why it matched. |
| `tastebud context` | Every accepted derivation of the inject kinds that applies here, for session start. |
| `tastebud list` / `tastebud show <ref>` | Browse by kind, status, place, subject or text; one record with its evidence, decisions and thread. |
| `tastebud thread-reply <ref> "<text>"` | Answer the owner's note on a review thread. |
| `tastebud review` / `tastebud review listen` | The review UI; a long-lived listener that wakes an agent when the owner writes a note. |
| `tastebud places` / `tastebud repoint` | Places in use and an audit of scopes that match none of your directories; propose moving a scope from one place to another. |
| `tastebud hook prompt` / `tastebud hook preview` | The prompt hook, and exactly what it would inject. |
| `tastebud mcp` | The agent commands as MCP tools over stdio. |
| `tastebud config-show` / `config-check` / `config-write` | Setup's operations: the config and its hash, validate a candidate and diff it, write it (creating the store). `tastebud setup-guide` is the interview. |
| `tastebud init` / `tastebud seed` / `tastebud reindex` | The starter config; the demo store; rebuild the index. |

Every command has `--help`, and most take `--json`. Commands that read where you are take `--in <dir>` (resolve that directory) or `--at <place>` (take that place as given). Exit codes: 0 ok, 1 broken, 2 bad input (including a proposal with no scope from an unknown place), 3 refused (a near repeat), 4 conflict.

Only the owner decides, and only in the review UI. `tastebud open [ref]` prints the review link (the inbox, or one record), opens it in a browser at a terminal, and writes nothing.

## Agents

**The skill.** [`skills/tastebud/SKILL.md`](skills/tastebud/SKILL.md) teaches an agent when to capture, propose, recall and listen, and points it at setup.

**MCP.** `tastebud mcp` serves the agent commands as tools (`tastebud_catalog`, `tastebud_recall`, `tastebud_propose`, …) and the `setup` prompt. The owner's commands are never exposed. The server never uses its own working directory: when the client offers exactly one `file://` root, that is where the agent is; otherwise tools take `in` (a directory) or `at` (places).

```bash
claude mcp add tastebud -- tastebud mcp   # Claude Code
codex mcp add tastebud -- tastebud mcp    # Codex
```

Cursor reads `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{ "mcpServers": { "tastebud": { "command": "tastebud", "args": ["mcp"] } } }
```

Add `--store <dir>` after `mcp`, or set `TASTEBUD_STORE` in the server's environment, to use a store other than `~/.tastebud`.

**The prompt hook (opt-in).** `tastebud hook prompt` is a Claude Code `UserPromptSubmit` hook. It resolves where the session is from the hook's `cwd`, and adds at most three accepted or rejected derivations of the `inject` kinds that match the prompt, labelled as evidence. It never adds raw sources, gives up silently after 650 ms, and always exits 0. Add it to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "tastebud hook prompt" }] }]
  }
}
```

`tastebud hook preview "<prompt>"` shows exactly what it would inject, and so does the review UI's recall inspector.

## `tastebud.config.ts` (reference)

Each store has one editable file. Setup writes it; you can also edit it by hand. It default-exports a plain object, so it needs no imports, and the review server picks up edits without a restart.

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
  review: { port: 4747 }, // where `tastebud review` serves and agents' links point
};
```

- A resolver function gets `{ cwd, source, env }` and returns place keys. It must be deterministic. `source` is set only when capturing.
- `recall` is `inject` (the hook, `context` and recall), `pull` (recall and `context --kind` only) or `never` (only list, show and the review UI).
- `sources` lists the source kinds a derivation of that kind must cite. A kind you remove later is retired: its records stay readable but can't be proposed, accepted or recalled.
- The demo's [`demo/.tastebud/tastebud.config.ts`](demo/.tastebud/tastebud.config.ts) has three full proposal prompts to copy from.

## Developing

```bash
git clone https://github.com/GLips/tastebud && cd tastebud
bun install
bun run build:review                                          # the review UI `tastebud review` serves
ln -s "$PWD/packages/cli/src/main.ts" ~/.local/bin/tastebud   # run from source, any directory on your PATH
ln -s "$PWD/skills/tastebud" ~/.claude/skills/tastebud
```

`bun run dev:review` runs the UI with hot reload on :4747. `bun run build:binary` compiles `dist/bin/<os>-<arch>/tastebud`
for this machine (`--all` for every platform), and `bun run check` is the gate.

## Out of scope

Fetching or ingesting sources, agent-authored sources, summarised sources, derivations that change themselves, topics and oracles, decay ranking, and writing derivations into other files such as CLAUDE.md.

## Prior art

Karpathy's LLM wiki, Matt Pocock's personal wiki, Yak's memory and builder packages, basic-memory (files as truth), Graphiti (two timelines), Letta (a commit per edit), the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) (records are OKF-conformant through `type` and actor ids), and the Agent Memory Atlas's "rejected-value tombstone".

## License

MIT. See [LICENSE](LICENSE).
