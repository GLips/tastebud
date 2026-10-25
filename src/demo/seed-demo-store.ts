/**
 * `taste seed`: a fictional demo store. Dana (`human:dana`) is a developer on Acme's storefront
 * (`github.com/acme/web`) and billing API; the call quotes are Acme's customers, all invented. Every
 * record goes through core's operations, so the repeat check, evidence rules and status rules apply
 * to the seed exactly as to an agent. Decisions and Dana's notes are human operations, run by a
 * `via: "seed"` caller acting as `process:seed`, which each decision records as its `via`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Clock, Effect } from "effect";

import {
  listRecordFiles,
  provideTasteStore,
  runTasteOperation,
  StoreAlreadyExists,
  StoreNotEmpty,
  StoreWriteFailed,
  TASTE_CONFIG_FILE,
  type TasteCaller,
  type TasteOperationInput,
} from "../core/index.ts";
import { UNKNOWN_TASTE_CONTEXT } from "../shared/places.ts";
import { DEMO_CONFIG_TEXT, DEMO_OWNER } from "./demo-config.ts";

const SEED_PROCESS = "process:seed";
/** Dana's coding agent, which captures their corrections and proposes beliefs. */
const CODING_AGENT = "claude-code/2.1";
/** The Granola sweep that captures call quotes, and the agent that proposes insights and ideas from them. */
const CALL_SWEEP = "process:granola-sweep";
const RESEARCH_AGENT = "codex/1.4";

const WEB = "github.com/acme/web::";
const CHECKOUT = "github.com/acme/web::apps/checkout";
const BILLING = "github.com/acme/billing-api::";
const BILLING_WEBHOOKS = "github.com/acme/billing-api::src/webhooks";
/** acme/web's name until October. Beliefs accepted under it are what the scope audit reports unmatched. */
const STOREFRONT = "github.com/acme/storefront::";
const ACME = "clients/acme";

const JORDAN = { said_by: "slack:acme/U04JORDAN", said_by_label: "Jordan (Acme marketing)" } as const;
const PRIYA = { said_by: "email:priya.n@example.com", said_by_label: "Priya N. (subscriber)" } as const;
const TOM = { said_by: "email:tom@harbourcafe.example", said_by_label: "Tom W. (café owner)" } as const;
const LENA = { said_by: "email:lena.k@example.com", said_by_label: "Lena K. (former subscriber)" } as const;

const CALL_PRIYA = "granola://meetings/2026-09-18-subscriber-interview-priya";
const CALL_TOM = "granola://meetings/2026-09-25-wholesale-call-tom";
const CALL_LENA = "granola://meetings/2026-10-08-churn-call-lena";

const callerAs = (actor: string): TasteCaller => ({ via: "seed", actor, context: UNKNOWN_TASTE_CONTEXT });

type CaptureInput = TasteOperationInput<"capture">;
type ProposeInput = TasteOperationInput<"propose">;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** The story runs September to late October 2026; no stamp lands after this. */
const SEED_STORY_END_MS = Date.parse("2026-10-24T17:00:00-07:00");

/**
 * The seed's clock: record stamps follow the story rather than the machine. Each record's time is
 * kept in `seedTimeline`, so a proposal lands after its evidence and a decision after its proposal.
 */
let seedNowMs = 0;
const seedTimeline = new Map<string, number>();

const setSeedNow = (ms: number) => {
  seedNowMs = Math.min(ms, SEED_STORY_END_MS);
};
const latestSeedTimeOf = (refs: ReadonlyArray<string | undefined>) =>
  Math.max(0, ...refs.map((ref) => (ref === undefined ? 0 : (seedTimeline.get(ref) ?? 0))));

/** Runs `effect` with record stamps read from the seed's clock; sleeps and monotonic time stay live. */
const withSeedClock = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.clockWith((live) =>
    Effect.provideService(effect, Clock.Clock, {
      currentTimeMillisUnsafe: () => seedNowMs,
      currentTimeMillis: Effect.sync(() => seedNowMs),
      currentTimeNanosUnsafe: () => BigInt(seedNowMs) * 1_000_000n,
      currentTimeNanos: Effect.sync(() => BigInt(seedNowMs) * 1_000_000n),
      monotonicTimeNanosUnsafe: () => live.monotonicTimeNanosUnsafe(),
      monotonicTimeNanos: live.monotonicTimeNanos,
      sleep: (duration) => live.sleep(duration),
    }),
  );

/** Stamps `effect`'s record `gapMs` after the latest of `refs`, and remembers when that record changed. */
const seedStep = <E, R>(refs: ReadonlyArray<string | undefined>, gapMs: number, effect: Effect.Effect<string, E, R>) =>
  Effect.suspend(() => {
    setSeedNow(latestSeedTimeOf(refs) + gapMs);
    return effect.pipe(Effect.tap((id) => Effect.sync(() => seedTimeline.set(id, seedNowMs))));
  });

const capture = (actor: string, input: CaptureInput) =>
  Effect.suspend(() => {
    // Captured a couple of minutes after it was said; a capture with no said_at happens "now".
    if (input.said_at !== undefined) seedNowMs = Date.parse(input.said_at) + 2 * MINUTE_MS;
    return runTasteOperation("capture", input, callerAs(actor)).pipe(
      Effect.map((result) => result.source.source.id),
      Effect.tap((id) => Effect.sync(() => seedTimeline.set(id, seedNowMs))),
    );
  });

/** Dana's words in a coding session, captured where they said them. */
const dana = (place: string, saidAt: string, quote: string, extra: Partial<CaptureInput> = {}) =>
  capture(CODING_AGENT, {
    kind: "memory",
    said_by: DEMO_OWNER,
    said_by_label: "Dana",
    said_at: saidAt,
    quote,
    at: [place],
    ...extra,
  });

/** A line from a recorded call, captured by the Granola sweep into the client's place. */
const callQuote = (
  speaker: { readonly said_by: string; readonly said_by_label: string },
  address: string,
  saidAt: string,
  quote: string,
  before?: string,
) =>
  capture(CALL_SWEEP, {
    kind: "call-quote",
    ...speaker,
    said_at: saidAt,
    quote,
    address,
    at: [ACME],
    ...(before !== undefined && { before }),
  });

const propose = (actor: string, input: ProposeInput) =>
  seedStep(
    [...input.supports, ...(input.contradicts ?? []), ...(input.despite ?? []), input.supersedes],
    35 * MINUTE_MS,
    runTasteOperation("propose", input, callerAs(actor)).pipe(Effect.map((result) => result.derivation.id)),
  );

/** Dana reviews the inbox about a day after a proposal arrives. */
const REVIEW_GAP_MS = 20 * HOUR_MS;
type DecideInput = TasteOperationInput<"decide">;

const decisionStep = (input: DecideInput, gapMs: number) =>
  seedStep([input.ref], gapMs, runTasteOperation("decide", input, callerAs(SEED_PROCESS)).pipe(Effect.as(input.ref)));

const accept = (ref: string, amended?: ReadonlyArray<string>) =>
  decisionStep(
    { ref, outcome: "accept", ...(amended !== undefined && { scope: "places", places: amended }) },
    REVIEW_GAP_MS,
  );
const reject = (ref: string, reason: string) => decisionStep({ ref, outcome: "reject", reason }, REVIEW_GAP_MS);
/** A retraction follows the incident that prompted it, days after the accept. */
const retract = (ref: string, reason: string) => decisionStep({ ref, outcome: "retract", reason }, 6 * 24 * HOUR_MS);

const danaNote = (ref: string, text: string) =>
  seedStep(
    [ref],
    3 * HOUR_MS,
    runTasteOperation("thread-note", { ref, text }, callerAs(SEED_PROCESS)).pipe(Effect.as(ref)),
  );
const agentReply = (ref: string, text: string, actor = CODING_AGENT) =>
  seedStep(
    [ref],
    25 * MINUTE_MS,
    runTasteOperation("thread-reply", { ref, text }, callerAs(actor)).pipe(Effect.as(ref)),
  );

const seedBeliefs = Effect.gen(function* () {
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

const seedCallsInsightsAndIdeas = Effect.gen(function* () {
  const priyaSkip = yield* callQuote(
    PRIYA,
    CALL_PRIYA,
    "2026-09-18T10:06:00-07:00",
    "I cancelled in July because I was going away for three weeks. I didn't want to cancel. There just wasn't a skip button.",
    "Jordan: What made you cancel?",
  );
  const priyaWouldReturn = yield* callQuote(
    PRIYA,
    CALL_PRIYA,
    "2026-09-18T10:08:00-07:00",
    "Honestly, the coffee's great. I'd come back tomorrow if I could skip a month when I need to.",
  );
  const priyaShipping = yield* callQuote(
    PRIYA,
    CALL_PRIYA,
    "2026-09-18T10:11:00-07:00",
    "I only found out shipping was seven dollars when I got to the last page. At that point I closed the tab, honestly.",
  );
  const priyaGrind = yield* callQuote(
    PRIYA,
    CALL_PRIYA,
    "2026-09-18T10:15:00-07:00",
    "The first bag was way too fine for my French press. I thought the beans were bad.",
  );
  const priyaGuides = yield* callQuote(
    PRIYA,
    CALL_PRIYA,
    "2026-09-18T10:21:00-07:00",
    "I found you through the cold brew guide, not an ad. I read the whole thing.",
  );
  const jordanAds = yield* callQuote(
    JORDAN,
    CALL_PRIYA,
    "2026-09-18T10:23:00-07:00",
    "We spend most of the ad budget on product shots. If people come in through the guides, that's backwards.",
  );
  const tomShipping = yield* callQuote(
    TOM,
    CALL_TOM,
    "2026-09-25T14:04:00-07:00",
    "Shipping is the thing. I'll pay it, I just want to see it before I've typed in my card.",
  );
  const tomPurchaseOrder = yield* callQuote(
    TOM,
    CALL_TOM,
    "2026-09-25T14:09:00-07:00",
    "My accountant needs the PO number on the invoice. Right now I write it on by hand.",
  );
  yield* callQuote(
    TOM,
    CALL_TOM,
    "2026-09-25T14:11:00-07:00",
    "The invoices are fine otherwise. Clear, one page, I don't have to call anyone.",
  );
  const tomReorder = yield* callQuote(
    TOM,
    CALL_TOM,
    "2026-09-25T14:13:00-07:00",
    "I order the same five bags every two weeks. Let me press one button for that.",
  );
  const lenaPause = yield* callQuote(
    LENA,
    CALL_LENA,
    "2026-10-08T09:32:00-07:00",
    "We were moving house. I'd have paused it for a month if I could. Cancelling was the only option, so I cancelled.",
    "Jordan: Was there anything we could have done?",
  );
  const lenaGrind = yield* callQuote(
    LENA,
    CALL_LENA,
    "2026-10-08T09:36:00-07:00",
    "I picked medium grind because it sounded safe. It was wrong for my machine and the coffee tasted thin.",
  );
  const lenaMissedGuide = yield* callQuote(
    LENA,
    CALL_LENA,
    "2026-10-08T09:38:00-07:00",
    "I didn't know there was a grind guide until you just mentioned it.",
  );
  const lenaPrice = yield* callQuote(
    LENA,
    CALL_LENA,
    "2026-10-08T09:40:00-07:00",
    "The other brand's subscription was twelve dollars for the first box. Yours looked expensive next to that.",
  );
  const lenaGuides = yield* callQuote(
    LENA,
    CALL_LENA,
    "2026-10-08T09:44:00-07:00",
    "I came for the brew guides. The ads I've seen are just a bag on a white background; that wouldn't have got me.",
  );
  const lenaCheckout = yield* callQuote(
    LENA,
    CALL_LENA,
    "2026-10-08T09:47:00-07:00",
    "Checkout made me create an account before it told me the total. That was annoying.",
  );

  const grindGuide = yield* dana(
    WEB,
    "2026-10-12T15:30:00-07:00",
    "We should put the grind guide on the product page, right by the grind selector. Nobody finds it in the footer.",
  );
  const pauseEverywhere = yield* dana(
    WEB,
    "2026-10-13T10:05:00-07:00",
    "Anywhere we let someone cancel a subscription, offer a pause first. That goes for every client, not just Acme.",
  );
  const landingQuote = yield* dana(
    WEB,
    "2026-10-17T11:45:00-07:00",
    "Every landing page should open with a real customer saying it in their words, not our copy.",
  );
  const freeShippingAd = yield* capture(CODING_AGENT, {
    kind: "memory",
    ...JORDAN,
    said_at: "2026-10-22T16:20:00-07:00",
    quote: "Can we try a free-shipping-over-$40 banner in the Meta ads? Our average cart is $34.",
    address: "https://acme.slack.com/archives/C05ADS/p1761175200",
    at: [ACME],
  });

  const insight = (input: Omit<ProposeInput, "kind" | "scope" | "places">) =>
    propose(RESEARCH_AGENT, { kind: "insight", scope: "places", places: [ACME], ...input });
  const idea = (input: Omit<ProposeInput, "kind">) => propose(RESEARCH_AGENT, { kind: "idea", ...input });

  const skipInsight = yield* insight({
    statement: "Subscribers cancel when they only wanted to skip or pause a delivery",
    supports: [priyaSkip, priyaWouldReturn, lenaPause],
    reasoning:
      "Priya and Lena both cancelled for a temporary reason and said they'd have skipped or paused instead. Wrong if most churn turns out to be price.",
  });
  yield* accept(skipInsight);
  const shippingInsight = yield* insight({
    statement: "Customers want to see the shipping cost before they reach payment",
    supports: [priyaShipping, tomShipping, lenaCheckout],
    reasoning:
      "Three customers on three calls: Priya left at the last page, Tom wants it before the card form, Lena wanted the total sooner.",
  });
  yield* accept(shippingInsight);
  yield* accept(
    yield* insight({
      statement: "Customers blame the beans when they picked the wrong grind",
      supports: [priyaGrind, lenaGrind],
      reasoning: "Priya and Lena both chose a grind that didn't suit their brewer and concluded the coffee was bad.",
    }),
  );
  yield* insight({
    statement: "Customers find Acme through the brew guides, not through ads",
    supports: [priyaGuides, lenaGuides],
    reasoning: "Both customers named the guides unprompted. Two people is thin; analytics would confirm or kill it.",
  });
  yield* reject(
    yield* insight({
      statement: "Customers think the subscription is too expensive",
      supports: [lenaPrice],
      reasoning: "Lena compared the price unfavourably with a competitor.",
    }),
    "One customer, comparing against a competitor's first-box discount. Not a pattern yet.",
  );

  const skipIdea = yield* idea({
    statement: "Add a 'Skip next delivery' link to the shipping confirmation email",
    supports: [priyaSkip, lenaPause, skipInsight],
    scope: "places",
    places: [ACME],
    reasoning: "Follows from the skip insight. Measure: cancellations in the week after a shipping email.",
  });
  yield* accept(skipIdea);
  yield* accept(
    yield* idea({
      statement: "Show estimated shipping on the product page, before the cart",
      supports: [priyaShipping, tomShipping, shippingInsight],
      scope: "places",
      places: [ACME],
      reasoning: "Follows from the shipping insight. Measure: drop-off between cart and payment.",
    }),
  );
  yield* reject(
    yield* idea({
      statement: "Add a grind-size quiz as a step in checkout",
      supports: [priyaGrind, lenaGrind],
      scope: "places",
      places: [ACME],
      reasoning: "Both grind complaints came from a choice made at purchase, so ask at purchase.",
    }),
    "Another checkout step is the last thing we need. Put the help next to the grind selector instead.",
  );
  yield* accept(
    yield* idea({
      statement: "Put the grind guide next to the grind selector on the product page",
      supports: [grindGuide, lenaGrind, lenaMissedGuide],
      scope: "places",
      places: [ACME],
      reasoning:
        "Dana's suggestion. Lena made the wrong choice at the selector and never found the guide in the footer.",
    }),
  );
  const adsIdea = yield* idea({
    statement: "Run Meta ads that lead with a brew guide instead of a product shot",
    supports: [jordanAds, priyaGuides, lenaGuides],
    scope: "places",
    places: [ACME],
    reasoning:
      "Jordan flagged the mismatch on Priya's call, and Lena said product-shot ads wouldn't have reached them.",
  });
  yield* danaNote(adsIdea, "Do we have a guide that would work as a 15-second video?");
  yield* agentReply(
    adsIdea,
    "The cold brew guide would: four steps, each a single shot, and it's the one Priya named. The pour-over guide has too much text on screen.",
    RESEARCH_AGENT,
  );
  yield* idea({
    statement: "Test a free-shipping-over-$40 banner in Meta ads",
    supports: [freeShippingAd],
    scope: "places",
    places: [ACME],
    reasoning: "Jordan's suggestion: a threshold just above the $34 average cart. Measure: average order value.",
  });
  yield* accept(
    yield* idea({
      statement: "Add a PO number field to wholesale checkout and print it on the invoice",
      supports: [tomPurchaseOrder],
      scope: "places",
      places: [ACME],
      reasoning: "Tom writes PO numbers on invoices by hand for their accountant.",
    }),
  );
  yield* idea({
    statement: "Add a one-click reorder of the last order for wholesale accounts",
    supports: [tomReorder],
    scope: "places",
    places: [ACME],
    reasoning: "Tom places the same order every two weeks.",
  });
  yield* accept(
    yield* idea({
      statement: "Offer a one-month pause anywhere a subscription can be cancelled",
      supports: [pauseEverywhere, lenaPause],
      scope: "global",
      reasoning: "Dana said it goes for every client, which is why it's global.",
    }),
  );
  yield* idea({
    statement: "Open every landing page with a real customer quote, in their words",
    supports: [landingQuote],
    scope: "global",
    reasoning: "Dana's rule of thumb for any landing page, not one client's.",
  });
});

const writeDemoConfig = (root: string) =>
  Effect.try({
    try: () => {
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, TASTE_CONFIG_FILE), DEMO_CONFIG_TEXT, { flag: "wx" });
      writeFileSync(join(root, ".gitignore"), ".index/\n", { flag: "wx" });
    },
    catch: (error) => new StoreWriteFailed({ path: root, problem: String(error) }),
  });

/** Writes the demo store at `root`, which must hold no store yet: no config and no records. */
export const seedTasteDemoStore = Effect.fn("taste.seedTasteDemoStore")(function* (root: string) {
  const recordCount = listRecordFiles(root).length;
  if (recordCount > 0) return yield* new StoreNotEmpty({ root, recordCount });
  if (existsSync(join(root, TASTE_CONFIG_FILE))) return yield* new StoreAlreadyExists({ root });
  yield* writeDemoConfig(root);
  seedNowMs = 0;
  seedTimeline.clear();
  yield* provideTasteStore(root)(withSeedClock(Effect.andThen(seedBeliefs, seedCallsInsightsAndIdeas)));
  return { root, owner: DEMO_OWNER, recordCount: listRecordFiles(root).length };
});
