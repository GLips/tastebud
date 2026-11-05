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

> Releases aren't published yet, so none of these lines works until the first one is. Until then, build it from a checkout (see [Developing](#developing)).

**Claude Code: the plugin.** One line brings the MCP server, the skill, `/tastebud:setup` and the prompt hook. The plugin downloads the Tastebud binary for its own version on first start, so there is nothing else to install.

```bash
claude plugin install tastebud --marketplace GLips/tastebud --config prompt_hook=true
```

Inside Claude Code that is `/plugin install tastebud --marketplace GLips/tastebud`, or on releases before 2.1.275, `/plugin marketplace add GLips/tastebud` then `/plugin install tastebud@tastebud`; those may note that `prompt_hook` is not yet set, and unset means on. The prompt hook is on: before each prompt it adds up to three ratified derivations of the `inject` kinds that match, and nothing without a store; `/config` (the plugin's "Prompt hook" row) turns it off, as does `echo '{"prompt_hook":"false"}' | claude plugin configure tastebud@tastebud --values-stdin`. To use a store other than `~/.tastebud`, add `{"env":{"TASTEBUD_STORE":"<root>"}}` to `~/.claude/settings.json`.

**Other hosts** run the npm package through `npx`, so they need Node. Add `--store <root>` after `mcp` for a store other than `~/.tastebud`.

- Codex: `codex mcp add tastebud -- npx -y tastebud@0.1.0 mcp`. The first start fetches the package; if Codex gives up on it, raise `startup_timeout_sec` under `[mcp_servers.tastebud]` in `~/.codex/config.toml`.
- Cursor: [![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tastebud&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsInRhc3RlYnVkQDAuMS4wIiwibWNwIl19), or `{"mcpServers":{"tastebud":{"command":"npx","args":["-y","tastebud@0.1.0","mcp"]}}}` in `~/.cursor/mcp.json`. Any other MCP client (Claude Desktop, Windsurf, …) takes the same JSON.
- VS Code: `code --add-mcp '{"name":"tastebud","type":"stdio","command":"npx","args":["-y","tastebud@0.1.0","mcp"]}'`

The skill (when to capture, propose and recall) is [`plugins/tastebud/skills/tastebud`](plugins/tastebud/skills/tastebud); outside Claude Code, copy it wherever your host reads skills (Codex: `~/.codex/skills/tastebud`).

**The CLI alone.** One executable with the review UI inside; no Bun, no Node:

```bash
curl -fsSL https://github.com/GLips/tastebud/releases/latest/download/install.sh | sh   # into ~/.local/bin
npm install -g tastebud                                                                  # or through npm
```

Or download `tastebud-<os>-<arch>.tar.gz` from the release page. Binaries run on macOS (arm64, x64) and Linux (x64, arm64). With the CLI on your PATH, any host can run `tastebud mcp` instead of the `npx` line. A config may import its own relative files and `node:` builtins, never packages.

Then **ask your agent to set Tastebud up**, or run `/tastebud:setup` in Claude Code (the MCP prompt `setup` in other hosts that show prompts). An agent with only the CLI reads the same interview from `tastebud setup-guide`. It asks whose words you want kept and from where, what conclusions you want drawn from them, and where your work lives. It tests the place resolver on your real directories, shows you the whole `tastebud.config.ts` and its diff, and writes it once you say yes. Then it captures something you said during the interview and hands you the review link.

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

**The skill.** [`plugins/tastebud/skills/tastebud/SKILL.md`](plugins/tastebud/skills/tastebud/SKILL.md) teaches an agent when to capture, propose, recall and listen, and points it at setup.

**MCP.** `tastebud mcp` serves the agent commands as tools (`tastebud_catalog`, `tastebud_recall`, `tastebud_propose`, …) and the `setup` prompt. The owner's commands are never exposed. The server never uses its own working directory: when the client offers exactly one `file://` root, that is where the agent is; otherwise tools take `in` (a directory) or `at` (places).

Registered by hand against an installed CLI (the [install section](#install) has the plugin and the `npx` lines):

```bash
claude mcp add tastebud -- tastebud mcp   # Claude Code without the plugin
codex mcp add tastebud -- tastebud mcp    # Codex
```

Cursor reads `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{ "mcpServers": { "tastebud": { "command": "tastebud", "args": ["mcp"] } } }
```

Add `--store <dir>` after `mcp`, or set `TASTEBUD_STORE` in the server's environment, to use a store other than `~/.tastebud`.

**The Claude Code plugin** lives in [`plugins/tastebud`](plugins/tastebud), served from this repo's marketplace. Its `bin/tastebud` runs the release binary of the plugin's version, downloaded once into `~/.cache/tastebud/<version>/` (or `$XDG_CACHE_HOME`), and is on the Bash tool's PATH, so Claude can run the CLI too. Its server shows as `plugin:tastebud:tastebud`, with tools like `mcp__plugin_tastebud_tastebud__tastebud_recall`.

**The prompt hook.** `tastebud hook prompt` is a Claude Code `UserPromptSubmit` hook; the plugin installs it, on by default. It resolves where the session is from the hook's `cwd`, and adds at most three accepted or rejected derivations of the `inject` kinds that match the prompt, labelled as evidence. It never adds raw sources, gives up silently after 650 ms, and always exits 0. The plugin skips it without starting anything when there is no store, and `tastebud` stops before resolving the place when no kind is `inject`. Without the plugin, add it to `~/.claude/settings.json`:

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
claude --plugin-dir "$PWD/plugins/tastebud"                    # the plugin from this checkout, for one session
```

The plugin runs the binary at `~/.cache/tastebud/<version>/tastebud` and downloads the release when it's missing; to run your own build instead, link it there first (`ln -s "$PWD/packages/cli/src/main.ts" ~/.cache/tastebud/0.1.0/tastebud`, or a compiled binary).

`bun run dev:review` runs the UI with hot reload on :4747. `bun run build:binary` compiles `dist/bin/<os>-<arch>/tastebud`
for this machine (`--all` for every platform), and `bun run check` is the gate.

## Out of scope

Fetching or ingesting sources, agent-authored sources, summarised sources, derivations that change themselves, topics and oracles, decay ranking, and writing derivations into other files such as CLAUDE.md.

## Prior art

Karpathy's LLM wiki, Matt Pocock's personal wiki, Yak's memory and builder packages, basic-memory (files as truth), Graphiti (two timelines), Letta (a commit per edit), the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) (records are OKF-conformant through `type` and actor ids), and the Agent Memory Atlas's "rejected-value tombstone".

## License

MIT. See [LICENSE](LICENSE).
