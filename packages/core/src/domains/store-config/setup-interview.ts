/**
 * The setup interview an agent runs with the owner. It is the one copy: `config-show` returns it with
 * `guide`, which is where the skill, the MCP instructions and the no-store failure point.
 */
import { agentHostConnectLinesFor } from "#core/domains/agent-hosts/index.ts";

const defaultLines = agentHostConnectLinesFor();
const templateLines = agentHostConnectLinesFor("<root>");

export const TASTEBUD_SETUP_INTERVIEW = `# Set up Tastebud with the owner

You are setting up (or adjusting) a Tastebud store with its owner: the person whose judgment it holds. You interview them, draft the store's \`tastebud.config.ts\`, show them exactly what will be written, and write it once they say yes. Config is settings, not taste, so their yes in this chat is the ratification.

How to run it:
- One question at a time, each with your recommendation, so the owner can just say "yes". Skip anything they've already told you.
- Use their words. When they describe what they care about, quote them back in the kind descriptions and prompts.
- Never write without an explicit yes to the exact diff.

Operations are spelled \`config-show\` here; on the CLI that's \`tastebud config-show\`. Setup runs only through the CLI. Pass a file's text with \`--text -\` and pipe it in.

The CLI takes the store per command: \`--store <dir>\`, else \`TASTEBUD_STORE\`, else \`~/.tastebud\`. The MCP server's \`capture\` uses the one store the server was started with; no tool argument changes it.

## 1. Look before asking

This guide came from \`config-show\` with \`guide\`, so the rest of that result is where the store stands now. Call \`config-show\` again whenever you need a fresh look.
- **No store** (\`exists: false\`): it says where the store would go (\`root\`) and gives a commented \`starter\` text. Start from that. Confirm the location ("Your store will live at ~/.tastebud. OK, or somewhere else, like a synced folder?"). To use another one:
  - On the CLI, pass \`--store <dir>\` to every command from here on.
  - Over MCP, the server has to be started with the new store, then the host restarted or the server reconnected. With the Claude Code plugin that is \`${templateLines.claudeCodeStoreSettings}\` in \`~/.claude/settings.json\`; other hosts register the server again with their line from step 7. Ask before changing their agent settings. Then call \`config-show\` again and check \`root\` before going on.
- **A store exists**: summarise what's there (owner, kinds, resolver, review port) and offer to adjust it rather than start over. Keep its \`hash\`: you pass it back when writing.
- **Its file has problems**: list them, and offer to fix those first.

## 2. Who the owner is

Ask who they are as \`human:<id>\`, suggesting one from what you know (their login, their name: "human:dana?"). It's an id, not a display name; it never changes. Ask how their captured words should be labelled and set \`ownerName\` (default: the id after \`human:\`).

## 3. Whose words count: source kinds

Sources are people's exact words, verbatim and attributed. Ask what they want remembered, and from whom:
- their own corrections and preferences while working with agents;
- customers on calls, users in support tickets or interviews;
- teammates in code reviews or design docs.

Each distinct speaker population or medium, with its own provenance, is its own source kind: \`memory\` for the owner's words, \`call-quote\` for customers on recorded calls, \`review-comment\` for teammates. Don't split by topic; topics are what derivations are for. Recommend the default, just \`memory\`, unless they name another population. Each kind needs a key (\`^[a-z][a-z0-9-]*$\`), \`singular\`, \`plural\`, and a one-line \`description\` of whose words and from where. \`conversationSourceKind\` names the kind for words an agent hears in conversation (recommend \`memory\`), so \`capture\` needs no kind.

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
- **Claude Code**: the Tastebud plugin brings the MCP server, the skill, \`/tastebud:review\` and the prompt hook. \`inject\` kinds reach every prompt through the hook. \`pull\` kinds and everything else reach the agent only when it calls \`recall\` or \`context\`, which the skill and the MCP server's instructions tell it to do.
- **The prompt hook is on** once the plugin is installed. It does nothing without a store or an \`inject\` kind. Tell the owner how to turn it off: \`/config\` in Claude Code (the Tastebud plugin's "Prompt hook" row), or in a shell \`echo '{"prompt_hook":"false"}' | claude plugin configure tastebud@tastebud --values-stdin\`, then a restart. Recall still works with it off.
- **Other hosts** have no prompt hook: nothing is injected, and the agent recalls only when it calls \`recall\` or \`context\`, prompted by the MCP server's instructions (and the skill, where the host loads skills). Some hosts, Codex among them, tell the server nothing about where the agent is working, so the agent passes \`in\` (its working directory) to every tool that reads where it is.
- A newly registered MCP server or plugin needs the host restarted or the server reconnected; a new hook takes effect in a new session.

Suggest the lines for each host, and never edit their agent settings or run an install without a yes. If the store isn't \`~/.tastebud\`, use the actual root from \`config-show\` for \`<root>\`:
- Claude Code: \`${templateLines.claudeCodePlugin}\` in a shell, or \`/plugin install tastebud --marketplace GLips/tastebud\` inside Claude Code. For a store other than \`~/.tastebud\`, add \`${templateLines.claudeCodeStoreSettings}\` to \`~/.claude/settings.json\`.
- Codex: \`${defaultLines.codex}\`, or \`${templateLines.codex}\` for another store.
- Cursor: \`${defaultLines.mcpServersJson}\` in \`~/.cursor/mcp.json\`, with \`"--store", "<root>"\` after \`"mcp"\` for another store.
- VS Code: \`${defaultLines.vscode}\`, with the same \`--store\` arguments for another store.
- Any other MCP client takes the same JSON as Cursor. These lines run the npm package through \`npx\`, so they need Node. Have the owner run \`${defaultLines.npxPrefetch}\` once first: it downloads the binary where a failure shows, rather than during the host's first connection.
- The review UI: \`/tastebud:review\` in Claude Code, or \`tastebud review --open --store <root>\` (without \`--store\` for \`~/.tastebud\`), which opens it in a browser. With only the plugin installed, the agent can run it for them, since the plugin puts \`tastebud\` on its shell's PATH; otherwise the CLI comes from \`npm install -g tastebud\` or the install script in the README.

## 8. Prove the loop

Pick something the owner said during this interview, or before it if a preference is what led here, that is a real preference of theirs, quote it back exactly, and ask if you may capture it. With their yes, \`capture\` it verbatim as a \`memory\` (or the right source kind), said by their \`human:\` id, and \`propose\` the conclusion it supports by that kind's prompt. Hand them the link from \`review-url\` and tell them to open the review UI with \`/tastebud:review\` in Claude Code, or \`tastebud review --open\` (with \`--store <root>\` if it isn't ~/.tastebud), and accept it there: only they can.

Once they say they've accepted it, show it coming back:
- \`recall\` on its topic, from a place its scope covers. It should appear under accepted.
- For an \`inject\` kind on Claude Code, \`hook-preview\` with a prompt on that topic shows exactly what the hook will add.
If it doesn't come back, explain why from \`recall-explain\` (scope, kind policy, status). Finish by naming anything that is still not installed for their hosts (the plugin, or the MCP server and skill elsewhere) and what each would add.
`;
