/**
 * The setup interview an agent runs with the owner. It is the one copy: the MCP server serves it as
 * the `setup` prompt and `tastebud setup-guide` prints it, which is where the skill points.
 */
export const TASTEBUD_SETUP_INTERVIEW = `# Set up Tastebud with the owner

You are setting up (or adjusting) a Tastebud store with its owner: the person whose judgment it holds. You interview them, draft the store's \`tastebud.config.ts\`, show them exactly what will be written, and write it once they say yes. Config is settings, not taste, so their yes in this chat is the ratification.

How to run it:
- One question at a time, each with your recommendation, so the owner can just say "yes". Skip anything they've already told you.
- Use their words. When they describe what they care about, quote them back in the kind descriptions and prompts.
- Never write without an explicit yes to the exact diff.

Operations are spelled \`config-show\` here: over MCP that's the tool \`tastebud_config_show\`, on the CLI \`tastebud config-show\`. On the CLI, pass a file's text with \`--text -\` and pipe it in.

Which store you reach depends on how you reach Tastebud. The CLI takes it per command: \`--store <dir>\`, else \`TASTEBUD_STORE\`, else \`~/.tastebud\`. Over MCP, every tool uses the one store the server was started with; no tool argument changes it.

## 1. Look before asking

Call \`config-show\`.
- **No store** (\`exists: false\`): it says where the store would go (\`root\`) and gives a commented \`starter\` text. Start from that. Confirm the location ("Your store will live at ~/.tastebud. OK, or somewhere else, like a synced folder?"). To use another one:
  - On the CLI, pass \`--store <dir>\` to every command from here on.
  - Over MCP, the server has to be registered again with the new store (\`claude mcp remove tastebud\`, then \`claude mcp add tastebud -- tastebud mcp --store <dir>\`, or the host's equivalent) and the host restarted or the server reconnected. Ask before changing their agent settings. Then call \`config-show\` again and check \`root\` before going on.
- **A store exists**: summarise what's there (owner, kinds, resolver, review port) and offer to adjust it rather than start over. Keep its \`hash\`: you pass it back when writing.
- **Its file has problems**: list them, and offer to fix those first.

## 2. Who the owner is

Ask who they are as \`human:<id>\`, suggesting one from what you know (their login, their name: "human:dana?"). It's an id, not a display name; it never changes.

## 3. Whose words count: source kinds

Sources are people's exact words, verbatim and attributed. Ask what they want remembered, and from whom:
- their own corrections and preferences while working with agents;
- customers on calls, users in support tickets or interviews;
- teammates in code reviews or design docs.

Each distinct speaker population or medium, with its own provenance, is its own source kind: \`memory\` for the owner's words, \`call-quote\` for customers on recorded calls, \`review-comment\` for teammates. Don't split by topic; topics are what derivations are for. Recommend the default, just \`memory\`, unless they name another population. Each kind needs a key (\`^[a-z][a-z0-9-]*$\`), \`singular\`, \`plural\`, and a one-line \`description\` of whose words and from where.

## 4. What conclusions they want: derived kinds

Derivations are one-line conclusions an agent proposes from sources and only the owner ratifies. Ask what they'd want agents to conclude from those words. The default is \`belief\` ("how I work"), fed by \`memory\` and injected into agents' context. Others: \`insight\` ("what customers keep telling us"), \`idea\` (a backlog of things to try).

For each kind, settle, one at a time:
- \`singular\`, \`plural\`, and a \`description\` in their words.
- \`sources\`: which source kinds it may cite.
- \`recall\`: \`inject\` (pushed into agents' context by the prompt hook and \`context\`), \`pull\` (agents get it when they recall), or \`never\` (a review-only backlog). Recommend \`inject\` only for things that should steer every session; most new kinds are \`pull\`.
- \`acceptLabel\`: the button the owner presses to ratify ("Believe", "Accept", "Worth doing").
- \`proposalPrompt\`: the instruction agents follow when proposing this kind. Ask the owner what makes a good one and a bad one, then draft it with these sections, in this order:
  - **When to propose**: what in the sources earns a proposal (stated outright, repeated, two speakers on different calls).
  - **Before proposing**: recall or list first; an accepted one already covering it means don't; a matching rejection means read its reason and usually drop it.
  - **The statement**: one line, in the owner's terms, specific enough to act on, with one good and one bad example.
  - **Evidence**: what \`--supports\` must cite, \`--contradicts\` for words that cut the other way, and whether \`--subject\` applies.
  - **Scope**: how narrowly to scope by default, and when \`--global\` is right.
  - **When refused as a near repeat**: stop, unless something genuinely changed; then \`--despite <id>\` for every match and \`--despite-case\` saying what changed.
  - **Never**: what an agent must not do with this kind.
  Prompts spell inputs as CLI flags; MCP callers map them with the note in \`catalog\`. Keeping the default \`belief\` with its shipped prompt means leaving \`derivedKinds\` out, but giving \`derivedKinds\` at all replaces the defaults whole, so write \`belief\` out too if they want it alongside new kinds.

## 5. Where work happens: place

A place is where a derivation applies. Ask where they work, or list the directories they name, then recommend:
- \`"git"\` (the default): a repo place from the origin remote (\`github.com/acme/web::\`), else the directory. Right for anyone whose work lives in git repos.
- \`"directories"\`: always the directory (\`~/Notes/clients/acme\`). Right for notes and documents outside git.
- a function \`({ cwd, source, env }) => [...]\`: only when names beat paths, like \`clients/acme\` across several folders and call recordings. It must be deterministic; \`[]\` means unknown.

Before writing, test it on their real paths: \`config-check\` with the full text and \`probes\` (their directories) shows the place keys each path resolves to under the candidate config. Show them the keys and ask if those are the places they mean. Once the store exists, \`places\` with \`probes\` does the same for the written config.

## 6. Show, confirm, write

Run \`config-check\` with the complete file text. Fix every problem it reports and check again. Then show the owner the full file and the diff, and ask: "Write this?" Only after an explicit yes, call \`config-write\` with the same text and \`expected_current\`: the \`hash\` from \`config-show\`, or \`""\` for a new store. If it refuses because the file changed, run \`config-show\` again, redo the edit on the new text, and show the diff again.

Keep the file readable: comments on why each kind exists are welcome, and the starter's comments are worth keeping.

A config may import relative files and \`node:\` builtins only; no packages. Tastebud runs as one executable, so there is nowhere to install a package for the config to find.

## 7. Wire up their agents

Ask which agent hosts they use (Claude Code, Codex, Cursor, others), then explain how Tastebud reaches each one, because recall only works through what is installed:
- **Claude Code**: \`inject\` kinds reach every prompt through the prompt hook. \`pull\` kinds and everything else reach the agent only when it calls \`recall\` or \`context\`, which the Tastebud skill and the MCP server's instructions tell it to do.
- **Other hosts** have no prompt hook: nothing is injected, and the agent recalls only when it calls \`recall\` or \`context\`, prompted by the MCP server's instructions (and the skill, where the host loads skills).
- A newly registered MCP server or skill needs the host restarted or the server reconnected; a new hook takes effect in a new session.

Suggest the lines for each host, and never edit their agent settings without a yes. If the store isn't \`~/.tastebud\`, every line carries \`--store <root>\` with the actual root from \`config-show\`:
- Claude Code: \`claude mcp add tastebud -- tastebud mcp --store <root>\`.
- Codex: \`codex mcp add tastebud -- tastebud mcp --store <root>\`.
- Cursor: \`{ "mcpServers": { "tastebud": { "command": "tastebud", "args": ["mcp", "--store", "<root>"] } } }\` in \`~/.cursor/mcp.json\`.
- If they have an \`inject\` kind and use Claude Code, the prompt hook in \`~/.claude/settings.json\`: \`{ "hooks": { "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "tastebud hook prompt --store <root>" }] }] } }\`.
- The Tastebud skill teaches agents when to capture, propose and recall.
- The review UI: \`tastebud review --store <root>\`.
(Leave \`--store <root>\` off every line when the store is \`~/.tastebud\`.)

## 8. Prove the loop

Pick something the owner said during this interview that is a real preference of theirs, quote it back exactly, and ask if you may capture it. With their yes, \`capture\` it verbatim as a \`memory\` (or the right source kind), said by their \`human:\` id, and \`propose\` the conclusion it supports by that kind's prompt. Hand them the link from \`review-url\` and tell them to run \`tastebud review\` (with \`--store <root>\` if it isn't ~/.tastebud) and accept it there: only they can.

Once they say they've accepted it, show it coming back:
- \`recall\` on its topic, from a place its scope covers. It should appear under accepted.
- For an \`inject\` kind on Claude Code, \`hook-preview\` with a prompt on that topic shows exactly what the hook will add.
If it doesn't come back, explain why from \`recall-explain\` (scope, kind policy, status). Finish by naming anything that is still not installed for their hosts (the MCP server, the skill, the hook) and what each would add.
`;
