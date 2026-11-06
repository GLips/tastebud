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

Scope conservatively. With no scope it defaults to where you are, which suits words said there. For words from elsewhere, pass \`--place <key>\` for the places they name (\`tastebud places\` lists the ones in use). \`--global\` only when the owner's words say it holds for all their work. Never widen a scope beyond what the words say; the owner can widen it when they accept.

Refused as a near repeat (exit 3): something close exists in an overlapping scope. Usually stop. Re-propose only when something genuinely changed: \`--despite <id>\` for every match and \`--despite-case\` saying what changed. Never reword a statement to slip past the check.

## 4. Hand it to the owner

When you're done, tell the owner what you proposed and what you skipped and why, then give them \`tastebud review-url\` (the inbox). They accept in the review UI: \`/tastebud:review\` in Claude Code, or \`tastebud review --open\`. Never say a proposal is accepted before they decide.

If they leave notes while reviewing, \`tastebud review listen --as <your-name>\` (in the background; it never exits) prints each note as a JSON line. Answer with \`tastebud thread-reply <id> "<text>" --by <you>\`, and propose a revision rather than argue when a note asks for a change.

## Never

- Write files in the store by hand.
- Capture or cite your own words or another agent's, or paraphrase a person's.
- Act as \`human:…\`.`;
