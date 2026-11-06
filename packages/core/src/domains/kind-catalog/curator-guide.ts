/**
 * The curator procedure: how an agent turns the owner's saved words into proposals. `catalog` returns it
 * with `guide`. It is CLI-only text because proposing, listing and linking run only through the CLI;
 * the MCP server serves capture alone.
 */
export const TASTEBUD_CURATOR_GUIDE = `# Review the owner's saved words

The owner asked you to look through what Tastebud has saved and propose what follows from it. You propose; only the owner accepts or rejects, in the review UI. Nothing you propose reaches an agent until they accept it.

The rest of this output is the catalog: the store's kinds, which source kinds each derived kind cites, and each derived kind's proposal prompt. Follow the prompt of the kind you propose; kinds differ. On every write, \`--by\` is your own name as an agent (\`claude-code/2.x\`), never \`human:…\`.

## 1. Read the saved words

\`tastebud list --sources --kind <source-kind>\` lists sources of one kind, newest first; add \`--text "<words>"\` to narrow it. \`tastebud show <id>\` gives one in full, with the lines around it and who said it. Group them by topic. One remark is weak evidence unless the owner stated it outright; the same point twice, or from two speakers, is stronger.

## 2. Check what already exists, rejections included

For each topic, before proposing:
- \`tastebud recall "<topic>"\` shows accepted and rejected derivations that apply where you are, with matching sources.
- \`tastebud list --kind <derived-kind> --text "<topic>"\` finds them in every place and status. Add \`--status rejected\` to see only rejections, and \`tastebud show <id>\` for the owner's reason.

An accepted one that already covers it means don't propose. A matching rejection means read its reason; usually drop the topic. A rejection isn't its opposite: "rejected: use Tailwind everywhere" doesn't mean "never use Tailwind". A pending one means the owner hasn't decided yet; don't add a second.

## 3. Propose, citing the words

\`\`\`bash
tastebud propose --kind belief --statement "Use named exports, never default exports" \\
  --supports <source-id> --supports <source-id> \\
  --reasoning "Dana corrected a default export in two repos and gave a reason (grep) that holds anywhere." \\
  --by claude-code/2.x
\`\`\`

- One line per statement, one idea each, in the owner's terms.
- \`--supports\` every source it rests on; \`--contradicts\` the ones that cut the other way.
- To revise an accepted derivation, \`--supersedes <id>\` and cite the new words.

Scope from where the words were said, not from where you are. A store-wide review reads words captured all over, so check each cited source's \`captured in\` line (\`tastebud show <id>\`, its \`captured_in\`) and pass \`--place <key>\` for those places (\`tastebud places\` lists the ones in use). With no scope a proposal defaults to your current checkout, which is right only when every cited source was captured there. \`--global\` only when the owner's words say it holds for all their work. Never widen a scope beyond what the words say; the owner can widen it when they accept.

Refused as a near repeat (exit 3): something close exists in an overlapping scope. Usually stop. Re-propose only when something genuinely changed: \`--despite <id>\` for every match and \`--despite-case\` saying what changed. Never reword a statement to slip past the check.

## 4. Hand it to the owner

When you're done, tell the owner what you proposed and what you skipped and why, then give them \`tastebud review-url\` (the inbox). They accept in the review UI: \`/tastebud:review\` in Claude Code, or \`tastebud review --open\`. Never say a proposal is accepted before they decide.

If they leave notes while reviewing, \`tastebud review listen --as <your-name>\` (in the background; it never exits) prints each note as a JSON line. Answer with \`tastebud thread-reply <id> "<text>" --by <you>\`, and propose a revision rather than argue when a note asks for a change.

## Mine recent sessions, only when the owner asks

Words the owner typed to Claude Code but nobody captured are still in its session transcripts. Read them only when the owner asks (setup offers it), and treat what you find as candidates for them to pick from, not as captures.

1. **Ask first.** Agree which projects (place keys: \`tastebud places --in <dir>\` gives a directory's) or all of them, and how many days back (default 7), and say plainly that the messages they typed there will enter your context, and your subagents'. Mine only what they agreed to.
2. **List.** \`tastebud transcript-candidates --days <n> --project <place> --json\`, one \`--project\` per place, none for all. Each candidate is one message the owner typed: its \`reference\`, \`said_at\`, \`cwd\`, \`places\`, \`because\` (why it counts as theirs) and its exact \`parts\`, the text left once Claude Code's wrappers are cut out. Nothing is summarised. When candidates are few, the counts say why: \`excluded\` and \`unknown\` with \`left_out\` reasons, \`unresolved\` (a cwd that resolves to no place) and \`other_projects\`. Tell the owner; don't widen the window or the projects on your own.
3. **Read in batches.** Group candidates by place and give each subagent a batch budgeted by tokens, not by message count: about 4 characters a token, roughly 30k tokens of \`parts\` each. Sonnet is recommended for this reading; nothing enforces it. A short list you can read yourself. Look for:
   - corrections of an agent ("no, don't…", "that's wrong because…"), which rank highest;
   - positive preferences stated outright ("I like it when…", "keep doing…"), which count too;
   - contradictions of something the owner said elsewhere, or of an accepted derivation.

   Each subagent returns references only, as JSON lines: \`{"reference": <copied exactly as transcript-candidates --json printed it>, "quote": "<a contiguous run of one part, verbatim>", "why": "<one line>"}\`. No paraphrase, no statements: a reference is what \`capture\` takes as \`transcript\`.
4. **Merge.** Combine the returns, and drop anything an accepted, pending or rejected derivation already covers (step 2 above). Group the quotes that point at one conclusion. Scope each candidate to the places its evidence came from: the \`places\` of the messages it rests on. Global only when the owner's words say it holds for all their work.
5. **The owner picks.** Show the strongest few, corrections first: each quote, where and when it was said, and the conclusion you'd propose with its scope. Capture only what they pick.
6. **Capture by reference.** Over MCP: \`capture\` with \`transcript: {"session": …, "message": …}\` and \`quote\`. On the CLI: \`tastebud capture --transcript-session <session> --transcript-message <message> --quote "<exact words>" --by <you>\`. Give no speaker, time or place: the transcript supplies them, and a value that contradicts it is refused. A quote that isn't an exact run of one part is refused; copy it again rather than adjust it. A message captured before returns that earlier source (\`already_captured\`).
7. **Propose and hand over** as in steps 3 and 4, citing the captured sources with \`--place\` for the places from the merge.

## Never

- Read the owner's transcripts unasked, or beyond the projects and days they agreed to.
- Write files in the store by hand.
- Capture or cite your own words or another agent's, or paraphrase a person's.
- Act as \`human:…\`.`;
