/**
 * The shipped instruction for the built-in `belief` kind. `taste catalog` hands it to agents, so it is
 * written to be followed as-is. CLI flags are shown; MCP tools take the same names as fields
 * (`--place` is `place`, `--why` is `despite_case`).
 */
export const BELIEF_PROPOSAL_PROMPT = `Propose a belief when the owner's own words show a durable preference or judgment: how they like work done, or what they hold true about their world. A belief is one line a future agent can act on. It counts only once the owner accepts it in the review UI; you never decide.

When to propose
- The owner says so ("remember this", "always do it this way here").
- The same correction has come up more than once.
- A pass over new memories finds a pattern that will matter again.
- A new memory contradicts an accepted belief. Propose a revision with --supersedes <belief-id> that cites the new memory.
Something you noticed mid-task is allowed, but wait for a second instance unless the owner stated it outright.

Before proposing
- Recall first: taste recall "<topic>". If an accepted belief already covers it, don't propose.
- If a rejected belief matches, read its reason. The default is to drop the idea.
- A rejection is not its opposite. "Rejected: use Tailwind everywhere" does not mean "never use Tailwind".

The statement
- One line, in the owner's terms, specific enough to act on: "Use named exports, never default exports", not "Cares about exports".
- One idea per belief. Split compound statements.
- Don't overstate. An "always" in a quote does not widen anything by itself.
- --reason: two or three sentences on why the cited words support it, and what would make it wrong.

Evidence
- --supports: every memory the belief rests on, at least one. Memories are the owner's exact words. Never cite your own words or another agent's.
- --contradicts: memories that cut against it. Leaving them out hides them from the reviewer.
- The subject is the owner. When the words are someone else's preference, say so with --subject <their account>, or don't propose it as the owner's belief.

Scope
- Scope as narrowly as the evidence allows. With no scope given, it defaults to the repo (or directory) you are in, which suits a correction made there.
- Pass --place <key> (repeatable) for other places, and --global only when the owner's words apply to all their work. Reviewers treat global scopes warily.
- From an unknown context, you must pass a scope.

When refused as a near repeat
- The refusal shows each earlier statement with its status, date and reason. Usually, tell the owner it was already decided and stop.
- Re-propose only when something genuinely changed: --despite <id> for every match, and --why saying what changed. Never reword a statement to slip past the check.

Never
- Propose from a paraphrase, a summary or an agent's output.
- Call a proposal a belief before the owner accepts it.`;
