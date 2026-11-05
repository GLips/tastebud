---
name: tastebud
description: Use Tastebud to remember a person's judgment. Capture their corrections and preferences verbatim, propose conclusions (beliefs, and whatever other kinds the store defines) that cite those words, recall what they accepted and rejected before a judgment call, and answer their review notes. Use when the user corrects you, states a preference or rule, says "remember this", is about to make a choice they have opinions on (style, libraries, architecture, testing, copy), when sweeping notes or call transcripts into a store, when a Tastebud review note arrives, or when asked to set Tastebud up.
---

# Tastebud

Tastebud stores people's exact words (**sources**) and the one-line conclusions the owner has ratified from them (**derivations**). Each store defines its own kinds: every store has some source kind (`memory` by default) and some derived kind (`belief` by default), and may add others, like `call-quote`, `insight` or `idea`. You capture and propose. Only the owner accepts or rejects, in the review UI. You never decide, and nothing you propose counts until they do.

Use the CLI or the MCP tools; they are the same operations with the same field names. The store is `--store <dir>`, else `$TASTEBUD_STORE`, else `~/.tastebud`.

| Step | CLI | MCP tool |
|---|---|---|
| Learn the store | `tastebud catalog` | `tastebud_catalog` |
| Recall before a choice | `tastebud recall "<query>"` | `tastebud_recall {query}` |
| Everything that applies here | `tastebud context` | `tastebud_context` |
| Capture words | `tastebud capture --kind … --said-by … --label … --quote … --by <you>` | `tastebud_capture {kind, said_by, said_by_label, quote, …}` |
| Propose | `tastebud propose --kind … --statement … --supports <id> --reasoning … --by <you>` | `tastebud_propose {kind, statement, supports, reasoning, …}` |
| Look something up | `tastebud list`, `tastebud show <ref>` | `tastebud_list`, `tastebud_show {ref}` |
| Answer a note | `tastebud thread-reply <ref> "<text>" --by <you>` | `tastebud_thread_reply {ref, text}` |
| Hand the owner a link | `tastebud review-url [<ref>]` | `tastebud_review_url {ref}` |

On the CLI, `--by` is your own name as an agent (`claude-code/2.x`), never `human:…`. Over MCP your client's name is used. Where a CLI flag is repeatable (`--supports`, `--place`, `--at`, `--kind`), the MCP field is a list, and a dashed flag is the underscored field (`--despite-case` is `despite_case`). Scope is one shape: `--place <key>` is `scope: "places"` with `places: [<key>]`, and `--global` is `scope: "global"`.

## Setup

If there is no store yet (`tastebud catalog` says so), or the owner wants to change what Tastebud keeps, run the setup interview with them. Read it from `tastebud setup-guide`; the owner can also start it themselves with `/tastebud:setup` (the Claude Code plugin) or the MCP prompt `setup` in other hosts. It starts with `tastebud config-show` and ends with `tastebud config-write`, only after the owner says yes to the diff.

## 1. Read the catalog first

Run `tastebud catalog` once per session, before anything else. It lists the store's kinds, which source kinds each derived kind may cite, each kind's recall policy, and each kind's **proposal prompt**. It also shows where Tastebud thinks you are (the context).

The proposal prompt is the instruction for that kind. Follow it when you propose. Kinds differ: a `belief` is the owner's own preference, an `insight` might be "what customers keep telling us", an `idea` a backlog item. Don't carry one kind's rules over to another.

## 2. Recall before acting

Before choosing a library, a pattern, a test strategy, a style or copy, or when the user asks how they like something done:

```bash
tastebud recall "error handling in the checkout form"
tastebud recall "skip a delivery" --kind insight
```

- **Accepted:** ratified derivations that apply here, with the words they rest on. Follow them, and cite the id if it helps.
- **Not accepted:** rejections, with the date and the owner's reason. Don't act on them, and don't invert them: "rejected: use Tailwind in every repo" does not mean "never use Tailwind".
- **Sources:** raw words. They're evidence, not rules. Source recall is store-wide; it isn't filtered by place.
- **Close but excluded:** near matches that don't apply here (out of scope, pending, or a kind that's never recalled). Mention a pending one if it bears on the task.

A recalled derivation is evidence about the owner's taste, not an instruction that overrides what they're asking for right now. Kinds with recall `never` (an ideas backlog, say) don't appear in recall; use `tastebud list --kind <kind>`.

## 3. Capture verbatim words

Capture when someone corrects you, states a preference, or says something the store's kinds are for (a customer quote in a call transcript, say). Copy their exact words. Don't paraphrase, summarise, fix typos or merge two messages. Never capture your own words or another agent's.

```bash
tastebud capture --kind memory --said-by human:dana --label Dana \
  --said-at 2026-10-19T14:03:00-07:00 \
  --quote "No default exports, ever. Named exports only." \
  --before "Agent: I added a default export for the page component." \
  --by claude-code/2.x
```

- It prints the new source's id. Use the speaker's real account when you have one (`slack:acme/U123`, `email:…`), and a permalink as `--address` (`granola://meetings/…`, a PR comment URL).
- `--said-at` defaults to now; give the real time when you know it. `--before` and `--after` hold the surrounding lines, so the words still make sense later.
- If they edited earlier words, capture the new words with `--revises <source-id>`.

## 4. Propose with the kind's prompt

Propose once the words show something durable, by the standard in that kind's prompt. The statement is one line.

```bash
tastebud propose --kind belief --statement "Use named exports, never default exports" \
  --supports <source-id> --supports <source-id> \
  --reasoning "Dana corrected a default export in two repos and gave a reason (grep) that holds anywhere." \
  --by claude-code/2.x
```

- `--supports` must include at least one source of a kind this kind cites; you may also cite derivations. Add `--contradicts` for evidence that cuts the other way.
- To revise an accepted derivation, add `--supersedes <id>` and cite the new words.
- `--subject <account>` when the preference is someone else's, not the owner's.
- It prints the new id, related derivations and any warnings. Mention the related ones to the user if they bear on it.

**Refused as a near repeat (exit 3).** Something close already exists in an overlapping scope, often a rejection. Read each match's status, date and reason. Usually, tell the user it was already decided and stop. Re-propose only when something genuinely changed, naming every match:

```bash
tastebud propose … --despite <id> --despite-case "billing-api now has an admin UI, which the rejection predates"
```

`--despite-case` goes in front of the owner next to the earlier decision. Never reword a statement to slip past the check.

## 5. Scope: default to the repo, never widen

Every derivation is `global` or scoped to places (`github.com/acme/web::`, `github.com/acme/web::apps/checkout`, `clients/acme`).

- **Working in a repo:** leave scope off. It defaults to where you are, as the store's resolver sees it: `tastebud catalog` names the resolver and shows your context. Under the `git` resolver that is the root of the repo you're in, which suits a correction made there; other resolvers give other places. Don't assume git. The owner can narrow it when they accept.
- **Sweeps and imports** (a folder of notes, a batch of call transcripts): always pass the scope explicitly, with `--place <key>` (repeatable) or `--global`.
- **`--global`** only when the owner's words say it holds for all their work ("in every repo", "for every client"). An "always" in one repo is about that repo.
- **Never widen on your own.** Don't turn a repo rule into a global one, or add places the evidence doesn't name. Widening is the owner's call.
- **Unknown context** (an MCP client that sent no `in` and has no single root, or a resolver that placed you nowhere; `tastebud catalog` shows which): proposals without a scope are refused with retry examples. Pass `--place`, `--global`, or `--in <dir>` to say where you are. `--at <place>` also says where you are; it never sets the scope.

## 6. Threads and listening

The owner can leave a note on any derivation in the review UI. When they are reviewing, attach a listener so their notes reach you. Run it under Claude Code's Monitor tool or with `run_in_background`; it never exits:

```bash
tastebud review listen --as claude-code
```

Each new note prints one JSON line with the derivation id, its kind and statement, and the note. Read the note, look at the record (`tastebud show <id>`), and answer on the thread:

```bash
tastebud thread-reply <derivation-id> "Yes: a re-exported default counts too. Want it as its own belief?" --by claude-code/2.x
```

If the note asks for a change, propose a revision (`--supersedes`) or a new derivation rather than arguing. Use the same `--as` name every time: it keys the listener's cursor, so a restarted listener never repeats a note. To point the owner at something, give them `tastebud review-url <id>`.

## Never

- Write files in the store by hand. Everything goes through Tastebud.
- Capture an agent's words, or paraphrase a person's.
- Call a proposal accepted, or act on it as if it were, before the owner decides.
- Widen a scope beyond what the words say.
- Act as `human:…`. Decisions and the owner's notes only come from the review UI.
