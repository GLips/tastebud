/**
 * The setup interview an agent runs with the owner. It is the one copy: `config-show` returns it with
 * `guide`, which is where the CLI's help and the no-store failure point. Every step is a CLI command,
 * because the MCP server serves capture alone.
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

Setup runs from a shell, through the CLI. Operations are spelled \`config-show\` here; on the CLI that's \`tastebud config-show\`. Pass a file's text with \`--text -\` and pipe it in. The MCP server only captures, so an agent without a shell can't run setup: ask the owner to run it from an agent that has one (Claude Code with the plugin does).

The CLI takes the store per command: \`--store <dir>\`, else \`TASTEBUD_STORE\`, else \`~/.tastebud\`. The MCP server's \`capture\` uses the one store the server was started with; no tool argument changes it.

## 1. Look before asking

This guide came from \`config-show\` with \`guide\`, so the rest of that result is where the store stands now. Call \`config-show\` again whenever you need a fresh look.
- **No store** (\`exists: false\`): it says where the store would go (\`root\`) and gives a commented \`starter\` text. Start from that. Confirm the location ("Your store will live at ~/.tastebud. OK, or somewhere else, like a synced folder?"). To use another one:
  - On the CLI, pass \`--store <dir>\` to every command from here on.
  - Over MCP, the server has to be started with the new store, then the host restarted or the server reconnected. With the Claude Code plugin that is \`${templateLines.claudeCodeStoreSettings}\` in \`~/.claude/settings.json\`; other hosts register the server again with their line from step 7. Ask before changing their agent settings. Then call \`config-show\` again and check \`root\` before going on.
- **A store exists**: summarise what's there (owner, kinds, resolver, review port) and offer to adjust it rather than start over. Keep its \`hash\`: you pass it back when writing.
- **Its file has problems**: list them, and offer to fix those first.

## 2. Who the owner is

Ask who they are as \`human:<id>\`, suggesting one from what you know (their login, their name: "human:dana?"). It's an id, not a display name; it never changes. Then ask how their captured words should be labelled ("Dana?") and set \`ownerName\` (default: the id after \`human:\`). Together these are who \`said_by: "owner"\` means, so an agent capturing the owner's words never has to look them up.

When you can infer these instead (the name from \`git config user.name\`, the id from their login), you may skip the questions, but say each inferred value and where it came from in step 6's confirmation ("I'll call you Graham, from your git config"), so they can correct it before the write rather than learn of it after.

## 3. Whose words count: source kinds

Sources are people's exact words, verbatim and attributed. Ask what they want remembered, and from whom:
- their own corrections and preferences while working with agents;
- customers on calls, users in support tickets or interviews;
- teammates in code reviews or design docs.

Each distinct speaker population or medium, with its own provenance, is its own source kind: \`memory\` for the owner's words, \`call-quote\` for customers on recorded calls, \`review-comment\` for teammates. Don't split by topic; topics are what derivations are for. Recommend the default, just \`memory\`, unless they name another population. Each kind needs a key (\`^[a-z][a-z0-9-]*$\`), \`singular\`, \`plural\`, and a one-line \`description\` of whose words and from where. Set \`conversationSourceKind\` to the kind for words an agent hears in conversation (recommend \`memory\`): it is what \`capture\` uses when given no kind, which is how agents capture over MCP.

## 4. What conclusions they want: derived kinds

Derivations are one-line conclusions an agent proposes from sources and only the owner ratifies. Ask what they'd want agents to conclude from those words. The default is \`belief\` ("how I work"), fed by \`memory\` and recalled automatically by the prompt hook. Others: \`insight\` ("what customers keep telling us"), \`idea\` (a backlog of things to try).

For each kind, settle, one at a time:
- \`singular\`, \`plural\`, and a \`description\` in their words.
- \`sources\`: which source kinds it may cite.
- \`recall\`: \`inject\` (the prompt hook adds matching accepted ones to the agent's context on each message), \`pull\` (an agent sees it only when it runs \`tastebud recall\`), or \`never\` (a review-only backlog). Recommend \`inject\` for things that should steer every session; \`pull\` kinds are seldom seen, since agents rarely recall unprompted.
- \`acceptLabel\`: the button the owner presses to ratify ("Believe", "Accept", "Worth doing").
- \`proposalPrompt\`: the instruction agents follow when proposing this kind. Ask the owner what makes a good one and a bad one, then draft it with these sections, in this order:
  - **When to propose**: what in the sources earns a proposal (stated outright, repeated, two speakers on different calls).
  - **Before proposing**: recall or list first; an accepted one already covering it means don't; a matching rejection means read its reason and usually drop it.
  - **The statement**: one line, in the owner's terms, specific enough to act on, with one good and one bad example.
  - **Evidence**: what \`--supports\` must cite, \`--contradicts\` for words that cut the other way, and whether \`--subject\` applies.
  - **Scope**: how narrowly to scope by default, and when \`--global\` is right.
  - **When refused as a near repeat**: stop, unless something genuinely changed; then \`--despite <id>\` for every match and \`--despite-case\` saying what changed.
  - **Never**: what an agent must not do with this kind.
  Prompts spell inputs as CLI flags, since proposing runs only through the CLI. Keeping the default \`belief\` with its shipped prompt means leaving \`derivedKinds\` out, but giving \`derivedKinds\` at all replaces the defaults whole, so write \`belief\` out too if they want it alongside new kinds.

## 5. Where work happens: place

A place is where a derivation applies. Ask where they work, or list the directories they name, then recommend:
- \`"git"\` (the default): a repo place from the origin remote (\`github.com/acme/web::\`), else the directory. Right for anyone whose work lives in git repos.
- \`"directories"\`: always the directory (\`~/Notes/clients/acme\`). Right for notes and documents outside git.
- a function \`({ cwd, source, env }) => [...]\`: only when names beat paths, like \`clients/acme\` across several folders and call recordings. It must be deterministic; \`[]\` means unknown.

Before writing, test it on their real paths: \`config-check\` with the full text and \`probes\` (their directories) shows the place keys each path resolves to under the candidate config. Show them the keys and ask if those are the places they mean. Once the store exists, \`places\` with \`probes\` does the same for the written config.

## 6. Show, confirm, write

Run \`config-check\` with the complete file text. Fix every problem it reports and check again. Then show the owner the full file and the diff, name every value you inferred rather than heard with its source, and ask: "Write this?" Only after an explicit yes, call \`config-write\` with the same text and \`expected_current\`: the \`hash\` from \`config-show\`, or \`""\` for a new store. If it refuses because the file changed, run \`config-show\` again, redo the edit on the new text, and show the diff again.

Keep the file readable: comments on why each kind exists are welcome, and the starter's comments are worth keeping.

A config may import relative files and \`node:\` builtins only; no packages. Tastebud runs as one executable, so there is nowhere to install a package for the config to find.

## 7. Wire up their agents

Ask which agent hosts they use (Claude Code, Codex, Cursor, others), then explain what each one gets, because Tastebud currently installs automatic recall only for Claude Code:
- **Claude Code**: the Tastebud plugin brings the prompt hook, the MCP server (its one tool is \`capture\`) and \`/tastebud:review\`, and puts \`tastebud\` on the agent's shell PATH. The hook is the automatic recall: before each message it adds the accepted derivations of \`inject\` kinds that match the message and the turn before it, so the agent never has to look anything up.
- **The prompt hook is on** once the plugin is installed. It does nothing without a store or an \`inject\` kind. Tell the owner how to turn it off: \`/config\` in Claude Code (the Tastebud plugin's "Prompt hook" row), or in a shell \`echo '{"prompt_hook":"false"}' | claude plugin configure tastebud@tastebud --values-stdin\`, then a restart. With it off, nothing they accepted reaches the agent on its own; capture still works.
- **Codex, Cursor, VS Code and other MCP clients** get the MCP-only setup, which provides capture only. Their agents save the owner's words through \`capture\`, but nothing the owner accepted reaches them automatically. Say this plainly. Some of them, Codex among them, tell the server nothing about where the agent is working, so the agent passes \`in\` (its working directory) to \`capture\`.
- A newly registered MCP server or plugin needs the host restarted or the server reconnected; a new hook takes effect in a new session.

Suggest the lines for each host, and never edit their agent settings or run an install without a yes. If the store isn't \`~/.tastebud\`, use the actual root from \`config-show\` for \`<root>\`:
- Claude Code: \`${templateLines.claudeCodePlugin}\` in a shell, or \`/plugin install tastebud --marketplace GLips/tastebud\` inside Claude Code. For a store other than \`~/.tastebud\`, add \`${templateLines.claudeCodeStoreSettings}\` to \`~/.claude/settings.json\`: the hook and the MCP server both read it.
- Codex: \`${defaultLines.codex}\`, or \`${templateLines.codex}\` for another store.
- Cursor: \`${defaultLines.mcpServersJson}\` in \`~/.cursor/mcp.json\`, with \`"--store", "<root>"\` after \`"mcp"\` for another store.
- VS Code: \`${defaultLines.vscode}\`, with the same \`--store\` arguments for another store.
- Any other MCP client takes the same JSON as Cursor. These lines run the npm package through \`npx\`, so they need Node. Have the owner run \`${defaultLines.npxPrefetch}\` once first: it downloads the binary where a failure shows, rather than during the host's first connection.
- The review UI: \`/tastebud:review\` in Claude Code, or \`tastebud review --open --store <root>\` (without \`--store\` for \`~/.tastebud\`), which opens it in a browser. With only the plugin installed, the agent can run it for them, since the plugin puts \`tastebud\` on its shell's PATH; otherwise the CLI comes from \`npm install -g tastebud\` or the install script in the README.

## 8. Prove the loop

Capturing and recalling are separate paths, so check each on its own: "capture works" says nothing about whether recall does.

**How to capture.** Capture through Tastebud's MCP server when this host has it (its \`capture\` tool), because a capture that lands proves the server is connected, which nothing else here checks. Use \`tastebud capture\` only when the host has no Tastebud MCP server.

**Capture.** Pick something the owner said during this interview, or before it if a preference is what led here, that is a real preference of theirs, quote it back exactly, and ask if you may capture it. With their yes, save it verbatim, said by the owner: over MCP, \`capture\` with \`said_by: "owner"\`; on the CLI, \`tastebud capture --said-by owner --quote "<their words>" --by <you>\`.

If nothing in this chat qualifies, don't ask them to come up with a preference cold. If you have a shell (mining can't run over MCP alone), offer a small mining pass instead: "I could look through what you typed to Claude Code in <project> over the last week and show you up to 3 things worth keeping. Those messages would enter my context. Want me to?" With a yes, follow "Mine recent sessions" in \`tastebud catalog --guide\`, kept small: the projects and days they agreed to, at most 3 candidates shown, read by you or by subagents as its "Read in batches" step says. Capture the ones they pick by reference (MCP \`capture\` with \`transcript\` and \`quote\`, else \`tastebud capture --transcript-session <session> --transcript-message <message> --quote "<exact words>" --by <you>\`), and propose from the strongest. If they decline or nothing qualifies, say so and carry on: setup may end with recall untested, but never invent a belief, or capture your own words, to finish the demo.

After a capture, tell them plainly: saving words doesn't create an active belief. It is a source waiting in the store, and nothing reaches an agent until a derivation citing it is proposed and they accept it.

**Propose and accept.** \`propose\` the conclusion those words support, by that kind's prompt. Hand them the link from \`review-url\` and tell them to open the review UI with \`/tastebud:review\` in Claude Code, or \`tastebud review --open\` (with \`--store <root>\` if it isn't ~/.tastebud), and accept it there: only they can. Start \`tastebud review listen --as <your-name>\` as you hand it over, so a note they leave reaches you: it never exits, so in Claude Code run it under the Monitor tool (each line it prints is an event); a \`run_in_background\` shell reports only on exit and would miss them.

**Automatic recall.** Once they say they've accepted it, show it coming back:
- \`tastebud hook preview "<a prompt on that topic>"\`, from a place its scope covers, shows exactly what the hook would add. An \`inject\` kind should appear; a \`pull\` kind won't, and \`tastebud recall "<topic>"\` shows it instead.
- Then the hook itself, in Claude Code: in a new session there, a message on that topic should arrive with a block that starts "These are previously accepted preferences". Ask them to try it, or try it yourself if you are in a new session. If the preview shows it and the session doesn't, the hook isn't running: the plugin isn't installed, the prompt hook is off, or the store isn't \`~/.tastebud\` and \`TASTEBUD_STORE\` isn't in \`~/.claude/settings.json\`.
If the preview doesn't show it, explain why from \`recall-explain\` (scope, kind policy, status).

Finish by naming anything still not installed for their hosts and what it would add, and tell them what happens next: agents capture their words as they work, and when they want those turned into proposals, they can ask an agent with a shell to review their saved words (it runs \`tastebud catalog --guide\`), then accept or reject in the review UI.
`;
