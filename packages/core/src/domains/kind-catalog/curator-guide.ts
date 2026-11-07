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

Scope from where the words were said, not from where you are. A store-wide review reads words captured all over, so check each cited source's \`captured in\` line (\`tastebud show <id>\`, its \`captured_in\`) and pass \`--place <key>\` for those places (\`tastebud places\` lists the ones in use). With no scope a proposal defaults to your current checkout, which is right only when every cited source was captured there. \`--global\` only when the owner's words say it holds for all their work. Never widen a scope beyond what the words say; the owner can widen it when they accept, or move an accepted one in the review UI. Don't propose a revision just to change where something applies: hand the owner its review page.

Refused as a near repeat (exit 3): something close exists in an overlapping scope. Usually stop. Re-propose only when something genuinely changed: \`--despite <id>\` for every match and \`--despite-case\` saying what changed. Never reword a statement to slip past the check.

## 4. Hand it to the owner

When you're done, tell the owner what you proposed and what you skipped and why, then give them \`tastebud review-url\` (the inbox). They accept in the review UI: \`/tastebud:review\` in Claude Code, or \`tastebud review --open\`. Never say a proposal is accepted before they decide.

As you hand it over, start \`tastebud review listen --as <your-name>\`, not after a first note: it prints each note they leave, and any still unanswered, as a JSON line, and never exits. In Claude Code run it under the Monitor tool with its longest timeout (30 minutes) and no \`2>&1\`, so each note is an event and the startup line on stderr isn't; re-arm it on every expiry until the owner says they're done, since a note left between runs arrives when it restarts; a \`run_in_background\` shell reports only on exit and would miss every note. Answer with \`tastebud thread-reply <id> "<text>" --by <you>\`, and propose a revision rather than argue when a note asks for a change.

## Catch up: what the owner said since last time

\`/tastebud:review\` runs this before handing over the review UI, and the owner may ask for one any time. It needs a shell: \`catch-up\` and \`transcript-candidates\` are CLI commands. The owner agreed to it running without asking first; you still never accept anything, and you save only words a proposal cites.

1. **See what waits.** \`tastebud catch-up\`. Each source kind is an origin with its own last reading (\`read_through\`) and where that catch-up ran. Claude Code sessions are the origin Tastebud reads itself: it gives how many of the owner's messages wait in every project, \`read_until\`, cut to what subagents read in one catch-up (about 300k tokens), and that stretch as batches of up to about 150k tokens, each a ready-to-run \`transcript-candidates\` command. A normal week is one batch, so one reader sees every session at once. It also lists, per derived kind, sources captured earlier that no catch-up has weighed under that kind's current prompt. On a first catch-up, tell the owner as you start that you're reading what they typed to Claude Code in the last 7 days, in every project, and that later catch-ups read only what's new.
2. **Other origins.** A source kind's description says whose words it holds and where they come from. If you can reach that place from here (an MCP connector, a folder), read what was said there after its \`read_through\`, up to a time you choose, and that time is what you record. If you can't, leave it and say so plainly: "I couldn't reach the meeting notes from here; they were last read from <last place>, so run the catch-up there to include them." Never record an origin you didn't read in full.
3. **Read the sessions through subagents.** Don't run the batch commands yourself: their text would fill your context. Start one subagent per batch, on Sonnet (the Agent tool's \`model: "sonnet"\`), in parallel when there are two, giving it its command and this step. The reader sees every session in its batch together, which is the point: a remark that looks like a throwaway in one session matters once it shows up in three. Each candidate it reads is one message the owner typed: its \`reference\`, \`said_at\`, \`places\`, exact \`parts\`, and \`replying_to\`, the end of what the agent said just before, which a "yes, do that" needs. It looks for:
   - corrections of an agent ("no, don't…", "that's wrong because…"), which rank highest;
   - preferences stated outright ("I like it when…", "keep doing…");
   - contradictions of something said elsewhere, or of an accepted derivation;
   - requests the owner keeps making ("where did we land?"), which may be skill ideas (step 5);
   - the same point, request or instruction in separate sessions, however differently worded.

   Tools type into sessions too: a launcher's first prompt and text sent with tmux send-keys are recorded exactly like the owner's typing. Skip text written to brief an agent (a ticket launch, a dispatched task). Subagents return references only, as JSON lines, and you merge them: \`{"reference": <copied exactly>, "quote": "<a contiguous run of one part, verbatim>", "why": "<one line>"}\` for a single remark, and \`{"repeat": "<the point or task, one line>", "quotes": [<one {"reference", "quote"} per separate session>]}\` for the same thing said in separate sessions. With two batches, a point only one reader saw once may repeat in the other's stretch: check it with \`--similar-to\` (step 4) before dropping it.
4. **Weigh it against what exists**, the due sources from step 1 included, as in "Check what already exists, rejections included". Read every matching rejection's reason before proposing again. A rejection saying the words weren't the owner's means never citing that quote as theirs again. One remark is weak evidence; the same point in two sessions is stronger, and a throwaway comment can matter once you see it repeated: \`tastebud transcript-candidates --similar-to "<the point>" --json\` finds where else they said it, 30 days back.
5. **Skill ideas.** A task the owner asks for in at least two separate sessions is a skill idea. Check the skills they already have (\`~/.claude/skills\`, their plugins' skills, the repo's \`.claude/skills\`) and existing derivations of every status first: when a skill covers it, the idea is the step that skill is missing ("has the progress doc been updated?" after every ui-climb run points at ui-climb). Propose it as the store's skill-idea kind, citing each time they asked; a reader's grouped repeats are where these come from. With no such kind, tell the owner what you found and offer to add one, showing the config change before writing it (\`tastebud config-show --guide\`):

   \`\`\`ts
   "skill-idea": { singular: "skill idea", plural: "skill ideas", sources: ["memory"], recall: "never", acceptLabel: "Worth building",
     proposalPrompt: "Propose a skill when the owner asks for the same task in at least two separate sessions, or says they ask for it often. One line naming the skill and what it does; cite each time they asked. When an existing skill covers it, propose the step it is missing instead." }
   \`\`\`
6. **Capture what you cite, then propose.** At most 5 new proposals a catch-up, strongest first, unless the owner asks for more. Capture only the quotes a proposal will cite. From a session, by reference: \`tastebud capture --transcript-session <session> --transcript-message <message> --quote "<exact words>" --by <you>\`; the transcript supplies speaker, time and place, and the source keeps what the agent said just before. A quote that isn't an exact run of one part is refused; copy it again rather than adjust it. From another origin, an ordinary capture: \`--kind <kind>\`, the speaker (\`--said-by\` and \`--label\`), \`--said-at\` when they said it, \`--address\` a link to it, and \`--before\` what they were reacting to. Then propose as in "Propose, citing the words", scoped to the places the evidence came from.
7. **Record what you finished**, once its proposals are in:
   - \`tastebud catch-up-done --origin <kind> --read-through <time> --note "<what you proposed, or why nothing>" --by <you>\`, one call per origin, only when everything worth proposing up to that time is proposed or already exists. For sessions the time is \`read_until\`. If the cap of 5 left worthwhile proposals unmade, or a batch's subagent failed and you didn't rerun it, don't record the origin: the next catch-up reads the same stretch again and skips what's already proposed.
   - \`--considered <id>\` for each source you finished weighing (due ones and ones you captured), with \`--considered-for <tag>\` for each kind you weighed them for, copied from \`catch-up\`'s "Sources due" (\`belief@f415f659\`). Weighed with nothing to propose counts; deferred doesn't. A changed prompt since \`catch-up\` refuses the receipt: run it again.
   If the catch-up stops partway, record nothing. The next one reads it again: capture returns the sources it already made, but check pending proposals before proposing, since a reworded one can slip past the near-repeat check.
8. **Hand it over** as in "Hand it to the owner": what you proposed, what you skipped and why, any origin you couldn't reach and where to run the catch-up to include it, and what's left past the budget for next time.

## Never

- Read the owner's transcripts outside a catch-up or their request, or record an origin you didn't read in full.
- Write files in the store by hand.
- Capture or cite your own words or another agent's, or paraphrase a person's.
- Act as \`human:…\`.`;
