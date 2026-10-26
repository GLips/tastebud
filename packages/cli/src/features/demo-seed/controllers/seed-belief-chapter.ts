/** Chapter one: Dana's coding sessions, the beliefs they ratify, reject and retract, and a repo rename. */
import { Effect } from "effect";

import {
  ACME,
  BILLING,
  BILLING_WEBHOOKS,
  CHECKOUT,
  CODING_AGENT,
  JORDAN,
  STOREFRONT,
  WEB,
} from "#cli/domains/acme-demo-story/index.ts";

import { accept, agentReply, capture, dana, danaNote, propose, reject, retract } from "./seed-story-steps.ts";

export const seedBeliefs = Effect.gen(function* () {
  const effectErrors = yield* dana(
    WEB,
    "2026-09-02T10:14:00-07:00",
    "In web, errors go through Effect. No more try/catch soup: if it can fail, the type says so.",
    {
      address: "https://github.com/acme/web/pull/412#discussion_r1",
      before: "Agent: I wrapped the fetch in try/catch and logged the error.",
    },
  );
  const lighthouse = yield* dana(
    STOREFRONT,
    "2026-09-03T16:30:00-07:00",
    "Storefront's Lighthouse performance stays above 90. If a PR drops it, the PR waits.",
  );
  const lazyImages = yield* dana(
    STOREFRONT,
    "2026-09-03T16:34:00-07:00",
    "Anything below the fold lazy-loads. The hero image doesn't, it's the first thing people see.",
  );
  const namedExports = yield* dana(
    WEB,
    "2026-09-05T15:40:00-07:00",
    "No default exports, ever. Named exports only, so grep finds the thing by its name.",
    { address: "https://github.com/acme/web/pull/430#discussion_r7" },
  );
  const commentsWhy = yield* dana(
    WEB,
    "2026-09-08T11:02:00-07:00",
    "Comments say why. If the comment just repeats the code, delete it.",
  );
  const integrationTests = yield* dana(
    BILLING,
    "2026-09-11T09:02:00-07:00",
    "For billing-api I'd rather have a few integration tests against a real Postgres than a pile of mocks that pass while prod breaks.",
  );
  const migrationsOnDeploy = yield* dana(
    BILLING,
    "2026-09-12T13:45:00-07:00",
    "Just run the migrations on deploy. I don't want a manual step anyone can forget.",
  );
  const tailwindFirst = yield* dana(WEB, "2026-09-15T11:20:00-07:00", "Use Tailwind for the styling.");
  const tailwindRevised = yield* dana(
    WEB,
    "2026-09-15T11:26:00-07:00",
    "Only use Tailwind in web, not billing-api. billing-api has no UI worth a CSS framework.",
    { revises: tailwindFirst, after: "Agent: Got it, leaving billing-api's admin pages on plain CSS." },
  );
  const testNames = yield* dana(
    WEB,
    "2026-09-17T14:12:00-07:00",
    "Name the test after what the user sees. 'shows a skip button for active subscriptions', not 'SubscriptionCard test'.",
  );
  const cents = yield* dana(
    BILLING,
    "2026-09-19T10:40:00-07:00",
    "Money is integer cents. If I see a float anywhere near a price again I'm reverting the PR.",
    { address: "https://github.com/acme/billing-api/pull/102#discussion_r3" },
  );
  const namedExportsAgain = yield* dana(
    BILLING,
    "2026-09-22T09:15:00-07:00",
    "Again: named export. I shouldn't have to say this in every repo.",
    { address: "https://github.com/acme/billing-api/pull/108#discussion_r2" },
  );
  const cdnImages = yield* dana(
    WEB,
    "2026-09-24T17:05:00-07:00",
    "Product photos live on the CDN. Never commit a JPEG to this repo again; the clone is 2 GB.",
  );
  const taggedErrors = yield* dana(
    WEB,
    "2026-10-01T14:05:00-07:00",
    "And make them Data.TaggedError classes, one per failure. I want to catchTag on them, not string-match messages.",
  );
  const migrationsByHand = yield* dana(
    BILLING,
    "2026-10-03T08:50:00-07:00",
    "After Friday's lock on the subscriptions table, migrations go back to being run by hand, with someone watching.",
  );
  const serverPrice = yield* dana(
    CHECKOUT,
    "2026-10-06T15:22:00-07:00",
    "Checkout never shows a price the server hasn't confirmed. Client-side math is how we showed free shipping to half of Germany.",
    { address: "https://github.com/acme/web/pull/518#discussion_r4" },
  );
  const blurValidation = yield* dana(
    CHECKOUT,
    "2026-10-09T10:31:00-07:00",
    "Validate on blur. Shouting 'invalid email' while I'm still typing the email is hostile.",
  );
  const abbreviations = yield* dana(
    BILLING,
    "2026-10-10T16:48:00-07:00",
    "Spell it out. config, not cfg; user, not usr. We're not paying per character.",
  );
  const adminDashboard = yield* dana(
    BILLING,
    "2026-10-14T11:10:00-07:00",
    "billing-api has a real admin dashboard now and it reuses the web components. Those need Tailwind, so give it Tailwind.",
  );
  const webhooksTwice = yield* dana(
    BILLING_WEBHOOKS,
    "2026-10-16T13:20:00-07:00",
    "Stripe will send the same webhook twice. Every handler has to be safe to run twice, keyed on the event id.",
  );
  const serverRenderedPrices = yield* dana(
    WEB,
    "2026-10-20T09:40:00-07:00",
    "Prices render on the server. I don't want a spinner where the price should be.",
  );
  // Captured but not yet proposed from: raw sources recall still finds.
  yield* dana(
    BILLING,
    "2026-09-26T10:20:00-07:00",
    "Don't mock Stripe in tests. Use test mode, and forward webhooks with the Stripe CLI.",
  );
  yield* dana(
    WEB,
    "2026-10-02T17:12:00-07:00",
    "Keep PRs under 400 lines. Nobody reviews the bottom half of a 1,200-line diff.",
  );
  yield* dana(
    WEB,
    "2026-10-15T09:55:00-07:00",
    "Please stop adding index.ts barrel files. Import from the file that has the thing.",
  );
  const sentenceCase = yield* capture(CODING_AGENT, {
    kind: "memory",
    ...JORDAN,
    said_at: "2026-10-21T12:05:00-07:00",
    quote: "Ad headlines are sentence case. Title Case Reads Like A Spam Email.",
    address: "https://acme.slack.com/archives/C05ADS/p1761073500",
    at: [ACME],
  });

  // Accepted while acme/web was still called storefront; the audit reports these until repointed.
  yield* accept(
    yield* propose(CODING_AGENT, {
      kind: "belief",
      statement: "Keep the storefront's Lighthouse performance score above 90",
      supports: [lighthouse],
      scope: "places",
      places: [STOREFRONT],
      reasoning: "Dana set it as a merge bar: a PR that drops the score waits.",
    }),
  );
  yield* accept(
    yield* propose(CODING_AGENT, {
      kind: "belief",
      statement: "Lazy-load images below the fold, but never the hero image",
      supports: [lazyImages],
      scope: "places",
      places: [STOREFRONT],
      reasoning: "Stated as a rule for the storefront, with the hero image as the explicit exception.",
    }),
  );

  const effectBelief = yield* propose(CODING_AGENT, {
    kind: "belief",
    statement: "Model failures in acme/web with Effect instead of try/catch",
    supports: [effectErrors],
    scope: "places",
    places: [WEB],
    reasoning: "Dana rejected a try/catch around a fetch and asked for failures to show up in the type.",
  });
  yield* accept(effectBelief);

  const namedExportsBelief = yield* propose(CODING_AGENT, {
    kind: "belief",
    statement: "Use named exports, never default exports",
    supports: [namedExports, namedExportsAgain],
    scope: "global",
    reasoning:
      "Said in acme/web and again in billing-api, with a reason (grep) that holds in any repo, and 'every repo' in their own words.",
  });
  yield* accept(namedExportsBelief);
  yield* danaNote(namedExportsBelief, "Does this cover `export { default } from './x'` re-exports in index files?");
  yield* agentReply(
    namedExportsBelief,
    "I'd treat a re-exported default as a default export too: rename it to a named export at the source, then re-export that name. Want me to propose that as its own belief?",
  );

  yield* accept(
    yield* propose(CODING_AGENT, {
      kind: "belief",
      statement: "Comments explain why, never restate what the code does",
      supports: [commentsWhy],
      scope: "global",
      reasoning: "A general rule about comments, not tied to acme/web's code.",
    }),
  );

  yield* accept(
    yield* propose(CODING_AGENT, {
      kind: "belief",
      statement: "Test billing-api against a real Postgres, not mocks",
      supports: [integrationTests],
      scope: "places",
      places: [BILLING],
      reasoning: "Dana's stated preference for billing-api, with the failure mode they want to avoid.",
    }),
  );
  yield* reject(
    yield* propose(CODING_AGENT, {
      kind: "belief",
      statement: "Prefer a few integration tests over many mocked unit tests",
      supports: [integrationTests],
      scope: "global",
      reasoning: "The billing-api preference reads like a general testing philosophy.",
    }),
    "I said that about billing-api. The web UI has plenty of good unit tests.",
  );

  const migrationsBelief = yield* propose(CODING_AGENT, {
    kind: "belief",
    statement: "Run database migrations automatically on deploy",
    supports: [migrationsOnDeploy],
    scope: "places",
    places: [BILLING],
    reasoning: "Dana wants no manual step in billing-api deploys.",
  });
  yield* accept(migrationsBelief);

  const tailwindEverywhere = yield* propose(CODING_AGENT, {
    kind: "belief",
    statement: "Use Tailwind for styling in every repo",
    supports: [tailwindFirst],
    scope: "global",
    reasoning: "Dana asked for Tailwind without naming a project.",
  });
  yield* reject(tailwindEverywhere, "Only acme/web. billing-api has no UI worth a CSS framework.");
  yield* accept(
    yield* propose(CODING_AGENT, {
      kind: "belief",
      statement: "Use Tailwind for styling in acme/web",
      supports: [tailwindFirst, tailwindRevised],
      scope: "places",
      places: [WEB],
      reasoning: "Dana narrowed their first request to acme/web the same morning.",
    }),
  );

  yield* accept(
    yield* propose(CODING_AGENT, {
      kind: "belief",
      statement: "Name tests after the behaviour a user sees, not the function under test",
      supports: [testNames],
      scope: "global",
      reasoning: "Dana gave a before-and-after example; nothing in it is specific to acme/web.",
    }),
  );
  yield* accept(
    yield* propose(CODING_AGENT, {
      kind: "belief",
      statement: "Store money as integer cents, never floats",
      supports: [cents],
      scope: "places",
      places: [BILLING],
      reasoning: "Stated as a revert-worthy rule in a billing-api review.",
    }),
  );
  yield* accept(
    yield* propose(CODING_AGENT, {
      kind: "belief",
      statement: "Keep product photos on the CDN, never in the repo",
      supports: [cdnImages],
      scope: "places",
      places: [WEB],
      reasoning: "Dana gave the cost (a 2 GB clone) and said 'never again'.",
    }),
  );

  // The more specific revision: the same idea, sharpened by a later correction.
  yield* accept(
    yield* propose(CODING_AGENT, {
      kind: "belief",
      statement: "In acme/web, model each failure as its own Data.TaggedError and handle it with catchTag",
      supports: [effectErrors, taggedErrors],
      scope: "places",
      places: [WEB],
      supersedes: effectBelief,
      reasoning: "Sharpens the accepted Effect belief with Dana's follow-up about one tagged error per failure.",
    }),
  );

  yield* retract(migrationsBelief, "After the subscriptions table locked on deploy, migrations run by hand again.");
  yield* propose(CODING_AGENT, {
    kind: "belief",
    statement: "Run billing-api migrations by hand, with someone watching",
    supports: [migrationsByHand],
    contradicts: [migrationsOnDeploy],
    scope: "places",
    places: [BILLING],
    reasoning: "Dana reversed the automatic-migrations rule after the lock incident.",
  });

  // Proposed from apps/checkout, so the scope defaulted to the repo root; Dana narrowed it on accept.
  yield* accept(
    yield* propose(CODING_AGENT, {
      kind: "belief",
      statement: "In checkout, never show a price the server hasn't confirmed",
      supports: [serverPrice],
      at: [CHECKOUT],
      reasoning: "Dana tied it to a real incident in checkout: client-side shipping math showed the wrong total.",
    }),
    [CHECKOUT],
  );
  const blurBelief = yield* propose(CODING_AGENT, {
    kind: "belief",
    statement: "Validate form fields on blur, not on every keystroke",
    supports: [blurValidation],
    at: [CHECKOUT],
    reasoning: "Said while reviewing the checkout email field; the scope defaulted to acme/web.",
  });
  yield* danaNote(blurBelief, "Does this include the address autocomplete? That one has to react as I type.");

  yield* propose(CODING_AGENT, {
    kind: "belief",
    statement: "Make every Stripe webhook handler idempotent, keyed on the event id",
    supports: [webhooksTwice],
    at: [BILLING_WEBHOOKS],
    reasoning: "Stated as a requirement for every handler, with the reason (Stripe retries).",
  });
  yield* propose(CODING_AGENT, {
    kind: "belief",
    statement: "Spell names out in full; no abbreviations like cfg or usr",
    supports: [abbreviations],
    scope: "global",
    reasoning: "Said in billing-api, but about naming in general, and none of it is billing-specific.",
  });
  yield* propose(CODING_AGENT, {
    kind: "belief",
    statement: "Render prices on the server; no loading spinner where a price goes",
    supports: [serverRenderedPrices],
    scope: "places",
    places: [WEB],
    reasoning: "Dana's rule for acme/web's product pages.",
  });
  yield* propose(CODING_AGENT, {
    kind: "belief",
    statement: "Use Tailwind for styling in every repo with a UI",
    supports: [tailwindRevised, adminDashboard],
    scope: "places",
    places: [WEB, BILLING],
    despite: [tailwindEverywhere],
    despite_case:
      "The rejection said billing-api had no UI. It now has an admin dashboard built from acme/web's components, which depend on Tailwind.",
    reasoning: "Dana asked for Tailwind in billing-api once its dashboard started reusing acme/web components.",
  });
  yield* propose(CODING_AGENT, {
    kind: "belief",
    statement: "Write ad headlines in sentence case",
    supports: [sentenceCase],
    subject: JORDAN.said_by,
    scope: "places",
    places: [ACME],
    reasoning: "Jordan's rule for Acme's ads, so the subject is Jordan, not Dana.",
  });
});
