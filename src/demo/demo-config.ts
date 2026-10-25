/**
 * The demo store's `taste.config.ts`, as text. People copy it as the example of custom kinds, so
 * each proposal prompt is a real one an agent can follow as written.
 */
import { BELIEF_PROPOSAL_PROMPT } from "../core/index.ts";

export const DEMO_OWNER = "human:dana";

const INSIGHT_PROPOSAL_PROMPT = `Propose an insight when different customers, in their own words, keep telling Acme the same thing: a need, a frustration, a habit. An insight is one line saying what customers experience, plain enough that someone who missed the calls can act on it. It counts only once Dana accepts it.

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
- Usually the insight already exists or was turned down; stop. Re-propose only with --despite <id> for every match and --why saying what changed.`;

const IDEA_PROPOSAL_PROMPT = `Propose an idea when a customer call, or Dana's own words, point at something concrete to try on the website or in ads. An idea is a backlog item: accepting it means "worth doing", not "true". Ideas are never recalled into an agent's context; they live in taste list and the review UI.

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
- Someone already had this idea. Stop, unless something changed: then --despite <id> for every match and --why saying what.`;

/** Backticks and `${` would end or interpolate the template literal the config writes each prompt into. */
const templateLiteral = (text: string) =>
  `\`${text.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${")}\``;

export const DEMO_CONFIG_TEXT = `// The demo store's config: Dana, a developer working on Acme's storefront and billing API, plus
// Acme's customer calls. Plain data, no imports. Edit freely; it reloads on save.
export default {
  owner: ${JSON.stringify(DEMO_OWNER)},

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
      proposalPrompt: ${templateLiteral(BELIEF_PROPOSAL_PROMPT)},
    },
    insight: {
      singular: "insight",
      plural: "insights",
      description: "What customers keep telling us.",
      sources: ["call-quote"],
      recall: "pull",
      acceptLabel: "Accept",
      proposalPrompt: ${templateLiteral(INSIGHT_PROPOSAL_PROMPT)},
    },
    idea: {
      singular: "idea",
      plural: "ideas",
      description: "Things to try on the website and ads.",
      sources: ["call-quote", "memory"],
      recall: "never",
      acceptLabel: "Worth doing",
      proposalPrompt: ${templateLiteral(IDEA_PROPOSAL_PROMPT)},
    },
  },

  hook: { limit: 3, budgetMs: 650 },
};
`;
