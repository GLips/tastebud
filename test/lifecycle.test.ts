import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";

import { Effect } from "effect";

import { pollListenerEvents, runTasteOperation, type TasteCaller, threadReplyInstruction } from "../src/core/index.ts";
import {
  callerFor,
  captureOwnerWords,
  demoConfigText,
  failOperation,
  inStore,
  makeGitRepo,
  makeTestStore,
  runOperation,
  unknownCaller,
} from "./support.ts";

const WEB = "github.com/acme/web::";
const CHECKOUT = "github.com/acme/web::apps/checkout";

/** A demo-kind store, the two acme repos, and callers standing in each. */
const makeAcmeWorld = async (hook?: string) => {
  const root = await makeTestStore(demoConfigText(`"git"`, hook));
  const web = makeGitRepo("git@github.com:acme/web.git", ["apps/checkout"]);
  const billing = makeGitRepo("https://github.com/acme/billing-api.git");
  return {
    root,
    web,
    inWeb: await callerFor(root, { cwd: web }),
    inCheckout: await callerFor(root, { cwd: join(web, "apps/checkout") }),
    inBilling: await callerFor(root, { cwd: billing }),
  };
};

const reviewer: TasteCaller = { via: "review", context: { places: [], origin: "unknown" } };

const propose = (root: string, caller: TasteCaller, input: Record<string, unknown>) =>
  runOperation(root, "propose", { kind: "belief", ...input }, caller).then((result) => result.derivation);

const decide = (root: string, input: Record<string, unknown>) => runOperation(root, "decide", input, reviewer);

describe("lifecycle", () => {
  test("a defaulted scope, amended at accept, governs where recall finds it", async () => {
    const { root, inWeb, inCheckout } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inCheckout, "No default exports, ever. Named exports only.");
    const belief = await propose(root, inCheckout, {
      statement: "Use named exports, never default exports",
      supports: [memory],
    });
    // From a subdirectory, a git context defaults to the repo root, and says nobody chose it.
    expect(belief.proposedScope).toEqual({ scope: "places", places: [WEB] });
    expect(belief.scopeSource).toBe("defaulted");

    await decide(root, { target: belief.id, outcome: "accept", scope: "places", places: [CHECKOUT] });
    const shown = await runOperation(root, "show", { ref: belief.id }, inWeb);
    expect(shown.derivation?.proposedScope).toEqual({ scope: "places", places: [WEB] });
    expect(shown.derivation?.effectiveScope).toEqual({ scope: "places", places: [CHECKOUT] });

    const query = { query: "default exports" };
    const atCheckout = await runOperation(root, "recall", query, inCheckout);
    expect(atCheckout.accepted.map((hit) => [hit.id, hit.explanation.matchedPlace, hit.explanation.policy])).toEqual([
      [belief.id, CHECKOUT, "inject"],
    ]);
    expect(atCheckout.accepted[0]?.sources[0]?.source.quote).toBe("No default exports, ever. Named exports only.");
    const atRoot = await runOperation(root, "recall", query, inWeb);
    expect(atRoot.accepted).toEqual([]);
    expect(atRoot.excluded.map((hit) => [hit.id, hit.exclusion])).toEqual([[belief.id, "out-of-scope"]]);
    // An MCP caller with no roots names its place with `in`.
    const viaIn = await runOperation(
      root,
      "recall",
      { ...query, in: join(inCheckout.context.cwd ?? "", ".") },
      unknownCaller,
    );
    expect(viaIn.accepted.map((hit) => hit.id)).toEqual([belief.id]);
  });

  test("a never kind is listed but not recalled, and only inject kinds reach the hook", async () => {
    const { root, inWeb } = await makeAcmeWorld("{ limit: 2, budgetMs: 650 }");
    const memory = await captureOwnerWords(root, inWeb, "Checkout forms must stay short.");
    const quote = await captureOwnerWords(root, inWeb, "Our buyers abandon long checkout forms.", "call-quote");
    const derive = async (kind: string, statement: string, supports: string) => {
      const derivation = await propose(root, inWeb, { kind, statement, supports: [supports] });
      await decide(root, { target: derivation.id, outcome: "accept" });
      return derivation.id;
    };
    const belief = await derive("belief", "Keep checkout forms short", memory);
    const second = await derive("belief", "Checkout forms ask for email first", memory);
    const insight = await derive("insight", "Buyers abandon long checkout forms", quote);
    const idea = await derive("idea", "Try a one-field checkout form", quote);
    const rejected = await propose(root, inWeb, {
      statement: "Checkout forms need a coupon field",
      supports: [memory],
    });
    await decide(root, { target: rejected.id, outcome: "reject", reason: "coupons hurt conversion" });

    const recall = await runOperation(root, "recall", { query: "checkout forms" }, inWeb);
    expect(new Set(recall.accepted.map((hit) => hit.id))).toEqual(new Set([belief, second, insight]));
    expect(recall.excluded.find((hit) => hit.id === idea)?.exclusion).toBe("never-policy");
    expect((await failOperation(root, "recall", { query: "checkout", kind: ["idea"] }, inWeb))._tag).toBe(
      "KindNotRecallable",
    );
    const ideas = await runOperation(root, "list", { kind: ["idea"] }, inWeb);
    expect(ideas.derivations.map((row) => row.id)).toEqual([idea]);

    const payload = await runOperation(root, "hook-preview", { prompt: "make the checkout forms shorter" }, inWeb);
    expect(payload.items).toHaveLength(2);
    expect(payload.items.every((item) => item.kind === "belief")).toBe(true);
    expect(payload.additionalContext).toContain("Accepted belief");
    const unknown = await runOperation(root, "hook-preview", { prompt: "checkout forms" }, unknownCaller);
    expect([unknown.silence, unknown.hookOutput]).toEqual(["unknown-context", undefined]);
  });

  test("the repeat check blocks within a kind where scopes overlap, and despite lets it through", async () => {
    const { root, inWeb, inBilling } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Only use Tailwind in acme-web.");
    const original = await propose(root, inWeb, {
      statement: "Use Tailwind for styling everywhere",
      supports: [memory],
    });
    await decide(root, { target: original.id, outcome: "reject", reason: "only acme-web" });

    const repeat = { statement: "Use Tailwind everywhere for styling.", supports: [memory] };
    const refusal = await failOperation(root, "propose", { kind: "belief", ...repeat }, inWeb);
    if (refusal._tag !== "NearRepeat") throw refusal;
    expect(refusal.matches.map((match) => [match.id, match.status, match.reason])).toEqual([
      [original.id, "rejected", "only acme-web"],
    ]);
    expect(refusal.message).toContain(`--despite ${original.id}`);

    // A disjoint scope makes the same words only related; another kind never matches at all.
    const { related } = await runOperation(root, "propose", { kind: "belief", ...repeat }, inBilling);
    expect(related.map((match) => match.id)).toEqual([original.id]);
    const idea = await runOperation(root, "propose", { kind: "idea", ...repeat }, inWeb);
    expect(idea.related).toEqual([]);

    const despite = await propose(root, inWeb, {
      ...repeat,
      despite: [original.id],
      despite_case: "acme-web's admin moved into this repo.",
    });
    expect(despite.despite.map((summary) => summary.id)).toEqual([original.id]);
    expect(despite.derivation.despite_case).toBe("acme-web's admin moved into this repo.");
  });

  test("repoint keeps the other places; two accepted revisions of one target can't both land", async () => {
    const { root, inWeb } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Prefer integration tests over mocks.");
    const original = await propose(root, inWeb, {
      statement: "Prefer integration tests",
      supports: [memory],
      places: [WEB, "clients/acme"],
    });
    await decide(root, { target: original.id, outcome: "accept" });

    const STOREFRONT = "github.com/acme/storefront::";
    const repointed = await runOperation(root, "repoint", { from: WEB, to: STOREFRONT }, inWeb);
    const revision = repointed.proposals[0]?.revision;
    expect(revision?.proposedScope).toEqual({ scope: "places", places: [STOREFRONT, "clients/acme"] });
    expect([revision?.status, revision?.statement]).toEqual(["pending", "Prefer integration tests"]);
    // Running it again proposes nothing new while the revision is pending.
    expect((await runOperation(root, "repoint", { from: WEB, to: STOREFRONT }, inWeb)).proposals).toEqual([]);

    const crossKind = await failOperation(
      root,
      "propose",
      { kind: "idea", statement: "Integration tests only", supports: [memory], supersedes: original.id },
      inWeb,
    );
    expect(crossKind._tag).toBe("InvalidTasteInput");
    const rival = await propose(root, inWeb, {
      statement: "Prefer integration tests with real temp dirs",
      supports: [memory],
      supersedes: original.id,
    });
    await decide(root, { target: revision?.id, outcome: "accept" });
    expect((await runOperation(root, "show", { ref: original.id }, inWeb)).derivation?.status).toBe("superseded");
    expect((await failOperation(root, "decide", { target: rival.id, outcome: "accept" }, reviewer))._tag).toBe(
      "DecisionNotAllowed",
    );
  });

  test("widening at accept needs every newly overlapping near repeat acknowledged", async () => {
    const { root, inWeb, inBilling } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Mock nothing but the network.");
    const billingOnly = await propose(root, inBilling, {
      statement: "Mock only the network in tests",
      supports: [memory],
    });
    await decide(root, { target: billingOnly.id, outcome: "reject", reason: "billing mocks its queue too" });
    const narrow = await propose(root, inWeb, { statement: "Mock only the network in tests.", supports: [memory] });

    const preview = await runOperation(root, "accept-preview", { target: narrow.id, scope: "global" }, reviewer);
    expect(preview.needsAcknowledgement.map((match) => match.id)).toEqual([billingOnly.id]);
    const widened = await failOperation(
      root,
      "decide",
      { target: narrow.id, outcome: "accept", scope: "global" },
      reviewer,
    );
    expect(widened._tag).toBe("WideningNeedsAcknowledgement");

    await decide(root, { target: narrow.id, outcome: "accept", scope: "global", acknowledges: [billingOnly.id] });
    const shown = await runOperation(root, "show", { ref: billingOnly.id }, inWeb);
    expect(shown.acknowledgedBy.map((summary) => summary.id)).toEqual([narrow.id]);
  });

  test("deleting .index/ and reindexing gives identical recall, even under a long-lived process", async () => {
    const { root, inWeb } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Use Effect for errors in acme-web.");
    const belief = await propose(root, inWeb, { statement: "Use Effect for error handling", supports: [memory] });
    await decide(root, { target: belief.id, outcome: "accept" });
    const recall = runTasteOperation("recall", { query: "effect errors", history: true }, inWeb);
    const before = await inStore(root, recall);
    expect([before.accepted.length, before.sources.length]).toEqual([1, 1]);

    rmSync(join(root, ".index"), { recursive: true, force: true });
    await runOperation(root, "reindex", {}, inWeb);
    expect(await inStore(root, recall)).toEqual(before);
    const survivedDeletion = await inStore(
      root,
      Effect.gen(function* () {
        yield* recall;
        rmSync(join(root, ".index"), { recursive: true, force: true });
        return yield* recall;
      }),
    );
    expect(survivedDeletion).toEqual(before);
  });

  test("listen: one event per owner note, naming the derivation and kind; a restart doesn't repeat it", async () => {
    const { root, inWeb } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Keep PRs small.");
    const belief = await propose(root, inWeb, { statement: "Keep pull requests small", supports: [memory] });
    const listener = "agent-1";
    expect(await inStore(root, pollListenerEvents(listener))).toEqual([]);

    await runOperation(root, "thread-note", { derivation: belief.id, text: "How small?" }, reviewer);
    await runOperation(root, "thread-reply", { derivation: belief.id, text: "Under 400 lines." }, inWeb);
    // An agent can never post as the owner, however it pads the name: that would wake listeners.
    const impostor = await failOperation(
      root,
      "thread-reply",
      { derivation: belief.id, text: "Me again." },
      { ...inWeb, actor: " human:tester" },
    );
    expect(impostor._tag).toBe("InvalidTasteInput");

    const events = await inStore(root, pollListenerEvents(listener));
    expect(events.map((event) => [event.derivation, event.kind, event.note])).toEqual([
      [belief.id, "belief", "How small?"],
    ]);
    expect(events[0]?.reply).toBe(threadReplyInstruction(belief.id, listener));
    expect(await inStore(root, pollListenerEvents(listener))).toEqual([]);
  });
});
