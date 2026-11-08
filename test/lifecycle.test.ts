import { describe, expect, test } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describeTasteFailure, runTasteOperation, type TasteOperationWireInput } from "@tastebud/core/operations";
import { pollListenerEvents, threadReplyInstruction } from "@tastebud/core/review-threads";
import type { TasteCaller } from "@tastebud/core/taste-caller";
import { Effect } from "effect";

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

const propose = (root: string, caller: TasteCaller, input: TasteOperationWireInput) =>
  runOperation(root, "propose", { kind: "belief", ...input }, caller).then((result) => result.derivation);

const decide = (root: string, input: TasteOperationWireInput) => runOperation(root, "decide", input, reviewer);

/** Proposes as `caller` and accepts it as the reviewer; returns the derivation id. */
const proposeAccepted = async (root: string, caller: TasteCaller, input: TasteOperationWireInput) => {
  const derivation = await propose(root, caller, input);
  await decide(root, { ref: derivation.id, outcome: "accept" });
  return derivation.id;
};

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

    await decide(root, { ref: belief.id, outcome: "accept", scope: "places", places: [CHECKOUT] });
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
    const derive = (kind: string, statement: string, supports: string) =>
      proposeAccepted(root, inWeb, { kind, statement, supports: [supports] });
    const belief = await derive("belief", "Keep checkout forms short", memory);
    const second = await derive("belief", "Checkout forms ask for email first", memory);
    const insight = await derive("insight", "Buyers abandon long checkout forms", quote);
    const idea = await derive("idea", "Try a one-field checkout form", quote);
    const rejected = await propose(root, inWeb, {
      statement: "Checkout forms need a coupon field",
      supports: [memory],
    });
    await decide(root, { ref: rejected.id, outcome: "reject", reason: "coupons hurt conversion" });

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
    expect(payload.additionalContext).toContain("Keep checkout forms short (belief");
    // Rejected derivations stay out of the hook; recall still shows them on request.
    expect(payload.additionalContext).not.toContain("coupon");
    const unknown = await runOperation(root, "hook-preview", { prompt: "checkout forms" }, unknownCaller);
    expect([unknown.silence, unknown.hookOutput]).toEqual(["unknown-context", undefined]);
  });

  test("recall-explain agrees with recall and the hook on every item, wherever it is asked", async () => {
    const { root, inWeb, inBilling } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Checkout forms must stay short.");
    const quote = await captureOwnerWords(root, inWeb, "Our buyers abandon long checkout forms.", "call-quote");
    const derive = (kind: string, statement: string, supports: string) =>
      proposeAccepted(root, inWeb, { kind, statement, supports: [supports] });
    const belief = await derive("belief", "Keep checkout forms short", memory);
    const insight = await derive("insight", "Buyers abandon long checkout forms", quote);
    const idea = await derive("idea", "Try a one-field checkout form", quote);
    const pending = (
      await propose(root, inWeb, { statement: "Checkout forms ask for email first", supports: [memory] })
    ).id;

    const explain = async (ref: string, caller: TasteCaller) => {
      const [item] = (await runOperation(root, "recall-explain", { ref }, caller)).items;
      return item?.outcome === "excluded" ? item.exclusion : item?.outcome;
    };
    expect(await explain(belief, inWeb)).toBe("injected");
    expect(await explain(insight, inWeb)).toBe("recalled");
    expect(await explain(idea, inWeb)).toBe("never-policy");
    expect(await explain(pending, inWeb)).toBe("pending");
    expect(await explain(belief, inBilling)).toBe("out-of-scope");

    // Whatever recall returns or leaves out for a prompt, explain says the same of it.
    const recall = await runOperation(root, "recall", { query: "checkout forms" }, inWeb);
    const hook = await runOperation(root, "hook-preview", { prompt: "checkout forms" }, inWeb);
    expect([recall.accepted.length, recall.excluded.length, hook.items.length]).toEqual([2, 2, 1]);
    const explainAll = (ids: ReadonlyArray<string>) => Promise.all(ids.map((id) => explain(id, inWeb)));
    expect(await explainAll(recall.accepted.map((hit) => hit.id))).toEqual(
      recall.accepted.map((hit) => (hit.kind === "belief" ? "injected" : "recalled")),
    );
    expect(await explainAll(recall.excluded.map((hit) => hit.id))).toEqual(recall.excluded.map((hit) => hit.exclusion));
    expect(await explainAll(hook.items.map((item) => item.id))).toEqual(hook.items.map(() => "injected"));

    // Found by text, matches come best first, in the order `list` ranks the same words.
    const byText = await runOperation(root, "recall-explain", { text: "abandon long checkout forms" }, inWeb);
    const listed = await runOperation(root, "list", { text: "abandon long checkout forms" }, inWeb);
    expect(byText.items[0]?.id).toBe(insight);
    expect(listed.derivations.map((row) => row.id)).toEqual(byText.items.map((item) => item.id));
  });

  test("the repeat check blocks within a kind where scopes overlap, and despite lets it through", async () => {
    const { root, inWeb, inBilling } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Only use Tailwind in acme-web.");
    const original = await propose(root, inWeb, {
      statement: "Use Tailwind for styling everywhere",
      supports: [memory],
    });
    await decide(root, { ref: original.id, outcome: "reject", reason: "only acme-web" });

    const repeat = { statement: "Use Tailwind everywhere for styling.", supports: [memory] };
    const refusal = await failOperation(root, "propose", { kind: "belief", ...repeat }, inWeb);
    if (refusal._tag !== "NearRepeat") throw refusal;
    expect(refusal.matches.map((match) => [match.id, match.status, match.reason])).toEqual([
      [original.id, "rejected", "only acme-web"],
    ]);
    expect(describeTasteFailure(refusal, "cli").envelope.sentence).toContain(`--despite ${original.id}`);

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
      scope: "places",
      places: [WEB, "clients/acme"],
    });
    await decide(root, { ref: original.id, outcome: "accept" });

    // Repoint never revises pending proposals, so the preview names the ones left at the old place.
    const stillPending = await propose(root, inWeb, {
      statement: "Name branches after their ticket",
      supports: [memory],
      scope: "places",
      places: [WEB],
    });
    const STOREFRONT = "github.com/acme/storefront::";
    const recordCount = async () => (await runOperation(root, "list", {}, inWeb)).derivations.length;
    const before = await recordCount();
    const preview = await runOperation(root, "repoint-preview", { from: WEB, to: STOREFRONT }, inWeb);
    expect(preview.revisions.map((entry) => [entry.supersedes.id, entry.keptPlaces])).toEqual([
      [original.id, ["clients/acme"]],
    ]);
    expect(preview.pendingAtFrom.map((summary) => summary.id)).toEqual([stillPending.id]);
    expect(await recordCount()).toBe(before);
    const repointed = await runOperation(root, "repoint", { from: WEB, to: STOREFRONT }, inWeb);
    expect(repointed.proposals.map((proposal) => proposal.supersedes.id)).toEqual([original.id]);
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
    await decide(root, { ref: revision?.id, outcome: "accept" });
    expect((await runOperation(root, "show", { ref: original.id }, inWeb)).derivation?.status).toBe("superseded");
    expect((await failOperation(root, "decide", { ref: rival.id, outcome: "accept" }, reviewer))._tag).toBe(
      "DecisionNotAllowed",
    );

    // A revision meets propose's rules: repointing onto a near repeat's place is reported, not written.
    const MOBILE = "github.com/acme/mobile::";
    const twin = await propose(root, inWeb, {
      statement: "Prefer integration tests.",
      supports: [memory],
      scope: "places",
      places: [MOBILE],
    });
    await decide(root, { ref: twin.id, outcome: "accept" });
    const blocked = await runOperation(root, "repoint", { from: STOREFRONT, to: MOBILE }, inWeb);
    expect(blocked.proposals).toEqual([]);
    expect(blocked.blocked.map((entry) => entry.derivation.id)).toEqual([revision?.id ?? "missing"]);
    expect(blocked.blocked[0]?.matches.map((match) => match.id)).toEqual([twin.id]);
  });

  test("the owner moves an accepted derivation to a new scope in place, with one decision", async () => {
    const { root, inWeb } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "No default exports, ever.");
    const original = await propose(root, inWeb, { statement: "Use named exports only", supports: [memory] });
    await decide(root, { ref: original.id, outcome: "accept" });

    const CLIENTS = "clients/acme";
    const before = (await runOperation(root, "list", {}, inWeb)).derivations.length;
    const { derivation } = await decide(root, {
      ref: original.id,
      outcome: "accept",
      scope: "places",
      places: [WEB, CLIENTS],
    });
    expect([derivation.status, derivation.effectiveScope]).toEqual([
      "accepted",
      { scope: "places", places: [WEB, CLIENTS] },
    ]);
    expect((await runOperation(root, "list", {}, inWeb)).derivations.length).toBe(before);
    const again = await failOperation(
      root,
      "decide",
      { ref: original.id, outcome: "accept", scope: "places", places: [CLIENTS, WEB] },
      reviewer,
    );
    expect(again._tag).toBe("DecisionNotAllowed");
  });

  test("the owner changes their mind from any status but superseded; the latest decision sets it", async () => {
    const { root, inWeb } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Prefer small pull requests.");
    const belief = await propose(root, inWeb, { statement: "Keep pull requests small", supports: [memory] });
    const statusAfter = async (input: TasteOperationWireInput) =>
      (await decide(root, { ref: belief.id, ...input })).derivation.status;

    expect(await statusAfter({ outcome: "reject", reason: "size isn't the point" })).toBe("rejected");
    expect((await failOperation(root, "decide", { ref: belief.id, outcome: "retract" }, reviewer))._tag).toBe(
      "DecisionNotAllowed",
    );
    expect(await statusAfter({ outcome: "accept" })).toBe("accepted");
    expect(await statusAfter({ outcome: "retract" })).toBe("retracted");
    expect(await statusAfter({ outcome: "accept" })).toBe("accepted");
    expect(await statusAfter({ outcome: "reject", reason: "changed my mind again" })).toBe("rejected");
    const shown = (await runOperation(root, "show", { ref: belief.id }, inWeb)).derivation;
    expect([shown?.decisions.length, shown?.reason]).toEqual([5, "changed my mind again"]);

    // A superseded one is decided through its revision, which can itself be undone.
    await decide(root, { ref: belief.id, outcome: "accept" });
    const revision = await propose(root, inWeb, {
      statement: "Keep pull requests small and focused",
      supports: [memory],
      supersedes: belief.id,
    });
    await decide(root, { ref: revision.id, outcome: "accept" });
    expect((await failOperation(root, "decide", { ref: belief.id, outcome: "retract" }, reviewer))._tag).toBe(
      "DecisionNotAllowed",
    );
    await decide(root, { ref: revision.id, outcome: "reject", reason: "the original said it" });
    expect((await runOperation(root, "show", { ref: belief.id }, inWeb)).derivation?.status).toBe("accepted");
  });

  test("reopen puts a decided derivation back in the inbox, deciding afresh against the proposed scope", async () => {
    const { root, inWeb } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Squash merge everything.");
    const belief = await propose(root, inWeb, { statement: "Squash merge pull requests", supports: [memory] });
    await decide(root, { ref: belief.id, outcome: "accept", scope: "global" });
    await decide(root, { ref: belief.id, outcome: "reject", reason: "only for acme/web" });
    const reopened = (await decide(root, { ref: belief.id, outcome: "reopen" })).derivation;
    expect([reopened.status, reopened.effectiveScope]).toEqual(["pending", reopened.proposedScope]);
    expect((await failOperation(root, "decide", { ref: belief.id, outcome: "reopen" }, reviewer))._tag).toBe(
      "DecisionNotAllowed",
    );
    expect((await decide(root, { ref: belief.id, outcome: "accept" })).derivation.status).toBe("accepted");
  });

  test("a revision of a derivation retracted after it was proposed can still be accepted", async () => {
    const { root, inWeb } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Merge duplicate code paths.");
    const original = await propose(root, inWeb, { statement: "Merge duplicate code paths", supports: [memory] });
    await decide(root, { ref: original.id, outcome: "accept" });
    const revision = await propose(root, inWeb, {
      statement: "Merge duplicate code paths into one",
      supports: [memory],
      supersedes: original.id,
    });
    await decide(root, { ref: original.id, outcome: "retract" });
    const { derivation } = await decide(root, { ref: revision.id, outcome: "accept" });
    expect(derivation.status).toBe("accepted");
    expect((await runOperation(root, "show", { ref: original.id }, inWeb)).derivation?.status).toBe("retracted");
  });

  test("widening at accept needs every newly overlapping near repeat acknowledged", async () => {
    const { root, inWeb, inBilling } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Mock nothing but the network.");
    const billingOnly = await propose(root, inBilling, {
      statement: "Mock only the network in tests",
      supports: [memory],
    });
    await decide(root, { ref: billingOnly.id, outcome: "reject", reason: "billing mocks its queue too" });
    const narrow = await propose(root, inWeb, { statement: "Mock only the network in tests.", supports: [memory] });

    const preview = await runOperation(root, "accept-preview", { ref: narrow.id, scope: "global" }, reviewer);
    expect(preview.needsAcknowledgement.map((match) => match.id)).toEqual([billingOnly.id]);
    const widened = await failOperation(
      root,
      "decide",
      { ref: narrow.id, outcome: "accept", scope: "global" },
      reviewer,
    );
    expect(widened._tag).toBe("WideningNeedsAcknowledgement");
    // Under its own scope nothing needs acknowledging, so naming billing's rejection is refused.
    const stray = await failOperation(
      root,
      "decide",
      { ref: narrow.id, outcome: "accept", acknowledges: [billingOnly.id] },
      reviewer,
    );
    expect(stray).toMatchObject({ _tag: "InvalidTasteInput", problems: [expect.stringContaining(billingOnly.id)] });
    // Human operations run only behind the review server, whatever an agent surface sends.
    const forged = { ref: narrow.id, outcome: "accept", scope: "global", acknowledges: [billingOnly.id] };
    const refusals = await Promise.all(
      (["mcp", "cli"] as const).map((via) => failOperation(root, "decide", forged, { ...inWeb, via })),
    );
    expect(refusals.map((error) => error._tag)).toEqual(["OperationNotAllowed", "OperationNotAllowed"]);

    await decide(root, { ref: narrow.id, outcome: "accept", scope: "global", acknowledges: [billingOnly.id] });
    const shown = await runOperation(root, "show", { ref: billingOnly.id }, inWeb);
    expect(shown.acknowledgedBy.map((summary) => summary.id)).toEqual([narrow.id]);
  });

  test("deleting .index/ and reindexing gives identical recall, even under a long-lived process", async () => {
    const { root, inWeb } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Use Effect for errors in acme-web.");
    const belief = await propose(root, inWeb, { statement: "Use Effect for error handling", supports: [memory] });
    await decide(root, { ref: belief.id, outcome: "accept" });
    // Words that look like the file's own section headings, escapes and edge whitespace survive exactly.
    const tricky = { quote: "  first\n## After\n\\second\n\n", before: "## Quote\n\\\\x", after: "\nlast " };
    const { source } = await runOperation(
      root,
      "capture",
      { kind: "memory", said_by: "human:tester", said_by_label: "Tess", ...tricky },
      inWeb,
    );
    const reasoning = "Because:\n## Despite\n\\ the words above.";
    const reasoned = await propose(root, inWeb, {
      statement: "Never mock the database",
      supports: [source.source.id],
      reasoning,
    });
    const recall = runTasteOperation("recall", { query: "effect errors", history: true }, inWeb);
    const before = await inStore(root, recall);
    expect([before.accepted.length, before.sources.length]).toEqual([1, 1]);

    rmSync(join(root, ".index"), { recursive: true, force: true });
    await runOperation(root, "reindex", {}, inWeb);
    expect(await inStore(root, recall)).toEqual(before);
    const reread = await runOperation(root, "show", { ref: source.source.id }, inWeb);
    expect(reread.source?.source).toMatchObject(tricky);
    expect((await runOperation(root, "show", { ref: reasoned.id }, inWeb)).record).toMatchObject({ reasoning });
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

  test("decide.lock: a dead holder's lock is taken over, and a deleted .index/ is recreated", async () => {
    const { root, inWeb } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Ship small PRs.");
    const first = await propose(root, inWeb, { statement: "Ship small pull requests", supports: [memory] });
    const second = await propose(root, inWeb, { statement: "Name branches after tickets", supports: [memory] });
    const exited = Bun.spawnSync(["true"]);
    const lockPath = join(root, ".index", "decide.lock");
    writeFileSync(lockPath, `${exited.pid} stale-token\n`);
    await decide(root, { ref: first.id, outcome: "accept" });
    expect(existsSync(lockPath)).toBe(false);

    rmSync(join(root, ".index"), { recursive: true, force: true });
    await decide(root, { ref: second.id, outcome: "accept" });
    expect((await runOperation(root, "show", { ref: second.id }, inWeb)).derivation?.status).toBe("accepted");
  });

  test("listen: one event per owner note, naming the derivation and kind; a restart doesn't repeat it", async () => {
    const { root, inWeb } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Keep PRs small.");
    const belief = await propose(root, inWeb, { statement: "Keep pull requests small", supports: [memory] });
    const listener = "agent-1";
    expect(await inStore(root, pollListenerEvents(listener))).toEqual([]);

    await runOperation(root, "thread-note", { ref: belief.id, text: "How small?" }, reviewer);
    await runOperation(root, "thread-reply", { ref: belief.id, text: "Under 400 lines." }, inWeb);
    // An agent can never post as the owner, however it pads the name: that would wake listeners.
    const impostor = await failOperation(
      root,
      "thread-reply",
      { ref: belief.id, text: "Me again." },
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

  test("listen: a note left while no agent listened reaches the first listener; answered ones stay history", async () => {
    const { root, inWeb } = await makeAcmeWorld();
    const memory = await captureOwnerWords(root, inWeb, "Keep PRs small.");
    const belief = await propose(root, inWeb, { statement: "Keep pull requests small", supports: [memory] });
    await runOperation(root, "thread-note", { ref: belief.id, text: "How small?" }, reviewer);
    await runOperation(root, "thread-reply", { ref: belief.id, text: "Under 400 lines." }, inWeb);
    await runOperation(root, "thread-note", { ref: belief.id, text: "And tests?" }, reviewer);

    const events = await inStore(root, pollListenerEvents("late-agent"));
    expect(events.map((event) => event.note)).toEqual(["And tests?"]);
    expect(await inStore(root, pollListenerEvents("late-agent"))).toEqual([]);
  });
});
