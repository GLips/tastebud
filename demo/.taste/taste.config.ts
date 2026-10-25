// The demo store's config: Dana, a developer working on Acme's storefront and billing API, plus
// Acme's customer calls. Plain data, no imports. Edit freely; it reloads on save.
export default {
  owner: "human:dana",

  // github.com/acme/web::apps/checkout from a checkout of acme/web, else the directory.
  place: "git",

  sourceKinds: {
    memory: { singular: "memory", plural: "memories", description: "A person's exact words, verbatim and attributed." },
    "call-quote": {
      singular: "call quote",
      plural: "call quotes",
      description: "A customer's exact words from a recorded call, with the meeting's address.",
    },
  },

  derivedKinds: {
    belief: {
      singular: "belief",
      plural: "beliefs",
      description: "How Dana works or what is true about their world, ratified by them.",
      sources: ["memory"],
      recall: "inject",
      acceptLabel: "Believe",
      proposalPrompt: `Propose a belief when the owner's own words show a durable preference or judgment: how they like work done, or what they hold true about their world. A belief is one line a future agent can act on. It counts only once the owner accepts it in the review UI; you never decide.

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
- Call a proposal a belief before the owner accepts it.`,
    },
    insight: {
      singular: "insight",
      plural: "insights",
      description: "What customers keep telling us.",
      sources: ["call-quote"],
      recall: "pull",
      acceptLabel: "Accept",
      proposalPrompt: `Propose an insight when different customers, in their own words, keep telling Acme the same thing: a need, a frustration, a habit. An insight is one line saying what customers experience, plain enough that someone who missed the calls can act on it. It counts only once Dana accepts it.

When to propose
- Two or more customers say it, on different calls. One customer is an anecdote; leave it as quotes.
- A new call contradicts an accepted insight. Propose a revision with --supersedes <insight-id> that cites the new quote.

Before proposing
- Recall first: taste recall "<topic>" --kind insight. If an accepted insight covers it, don't propose.
- If a rejected insight matches, read its reason. The default is to drop it.

The statement
- Say what customers experience, not what Acme should do: "Subscribers cancel when they only wanted to skip a delivery", not "Add a skip button". A change to try is an idea.
- Stay inside the evidence. Three subscribers are not "all customers".
- --reasoning: who said it, on which calls, and what would make it wrong.

Evidence
- --supports: every call quote it rests on, from at least two speakers.
- --contradicts: quotes that cut the other way. Leaving them out hides them from Dana.
- Leave --subject off. An insight is about customers, not anyone's belief.

Scope
- --place clients/<client> for the client whose customers said it. Sweeps always pass the scope.

When refused as a near repeat
- Usually the insight already exists or was turned down; stop. Re-propose only with --despite <id> for every match and --why saying what changed.`,
    },
    idea: {
      singular: "idea",
      plural: "ideas",
      description: "Things to try on the website and ads.",
      sources: ["call-quote", "memory"],
      recall: "never",
      acceptLabel: "Worth doing",
      proposalPrompt: `Propose an idea when a customer call, or Dana's own words, point at something concrete to try on the website or in ads. An idea is a backlog item: accepting it means "worth doing", not "true". Ideas are never recalled into an agent's context; they live in taste list and the review UI.

When to propose
- A quote names a problem, and there is a specific change that would address it.
- Dana says "we should try…".
- An accepted insight implies a change. Cite the insight and the quotes under it.

Before proposing
- List what's there: taste list --kind idea --text "<topic>". Don't propose an idea that is already pending, accepted or rejected.

The statement
- Start with a verb and name the surface: "Add a 'Skip next delivery' link to the shipping confirmation email". One change per idea.
- --reasoning: the problem it addresses, who raised it, and what you would measure to know it worked.

Evidence
- --supports: at least one call quote or memory directly, plus any insight it follows from.
- Leave --subject off. A customer inspiring an idea is not the customer endorsing it.

Scope
- --place clients/<client> for one client's site or ads. --global only for ideas Dana means for every site they work on.

When refused as a near repeat
- Someone already had this idea. Stop, unless something changed: then --despite <id> for every match and --why saying what.`,
    },
  },

  hook: { limit: 3, budgetMs: 650 },
};
