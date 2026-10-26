/** Chapter two: customer calls, the insights and ideas proposed from them, and Dana's calls on each. */
import { Effect } from "effect";

import {
  ACME,
  CALL_LENA,
  CALL_PRIYA,
  CALL_TOM,
  CODING_AGENT,
  JORDAN,
  LENA,
  PRIYA,
  RESEARCH_AGENT,
  TOM,
  WEB,
} from "#cli/domains/acme-demo-story/index.ts";

import {
  accept,
  agentReply,
  callQuote,
  capture,
  dana,
  danaNote,
  propose,
  type ProposeInput,
  reject,
} from "./seed-story-steps.ts";

const insight = (input: Omit<ProposeInput, "kind" | "scope" | "places">) =>
  propose(RESEARCH_AGENT, { kind: "insight", scope: "places", places: [ACME], ...input });
const idea = (input: Omit<ProposeInput, "kind">) => propose(RESEARCH_AGENT, { kind: "idea", ...input });

export const seedCallsInsightsAndIdeas = Effect.gen(function* () {
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
