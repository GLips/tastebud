import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runTasteOperation } from "@taste/core/operations";
import { Effect } from "effect";

import {
  callerFor,
  captureOwnerWords,
  demoConfigText,
  failOperation,
  inStore,
  makeTemporaryDirectory,
  makeTestStore,
  OWNER,
  runOperation,
  unknownCaller,
} from "./support.ts";

describe("taste.config.ts", () => {
  test("a custom resolver and custom kinds load; capture-time calls see the source", async () => {
    const resolver = `({ cwd, source }) =>
      source?.kind === "call-quote" ? ["clients/acme"] : cwd?.endsWith("/acme-ads") ? ["clients/acme/ads/"] : []`;
    const root = await makeTestStore(demoConfigText(resolver));
    const adsDirectory = join(makeTemporaryDirectory("work"), "acme-ads");
    mkdirSync(adsDirectory);

    const caller = await callerFor(root, { cwd: adsDirectory });
    expect(caller.context).toEqual({ places: ["clients/acme/ads"], origin: "cwd", cwd: adsDirectory });
    const { catalog } = await runOperation(root, "catalog", {}, caller);
    expect(catalog.resolver).toBe("custom");
    expect(catalog.derivedKinds.map((kind) => [kind.key, kind.recall])).toEqual([
      ["belief", "inject"],
      ["insight", "pull"],
      ["idea", "never"],
    ]);

    const { source } = await runOperation(
      root,
      "capture",
      { kind: "call-quote", said_by: "zoom:acme/jo", said_by_label: "Jo", quote: "Our buyers hate long forms." },
      caller,
    );
    expect(source.source.captured_in).toEqual(["clients/acme"]);
    // An explicit `at` is the caller's word; the resolver doesn't re-place the source.
    const atCaller = await callerFor(root, { at: ["clients/globex"] });
    const placed = await runOperation(
      root,
      "capture",
      { kind: "call-quote", said_by: "zoom:globex/al", said_by_label: "Al", quote: "Fewer steps." },
      atCaller,
    );
    expect(placed.source.source.captured_in).toEqual(["clients/globex"]);
    // An empty result is unknown context, so a proposal from there must name its scope.
    const nowhere = await callerFor(root, { cwd: makeTemporaryDirectory("nowhere") });
    expect(nowhere.context.origin).toBe("unknown");
    const memory = await captureOwnerWords(root, caller, "Keep forms short.");
    const refused = await failOperation(
      root,
      "propose",
      { kind: "belief", statement: "Keep forms short", supports: [memory] },
      nowhere,
    );
    expect(refused._tag).toBe("ScopeRequired");
    expect(refused.message).toContain("--global");
  });

  test("a bad config fails naming the field, and fixing it takes effect in the same process", async () => {
    const root = await makeTestStore(
      `export default { owner: "${OWNER}", derivedKinds: { insight: { singular: "insight", plural: "insights", sources: ["transcript"], recall: "pull", acceptLabel: "Keep", proposalPrompt: "…" } } };`,
    );
    const error = await failOperation(root, "catalog", {}, { via: "cli", context: { places: [], origin: "unknown" } });
    expect(error._tag).toBe("InvalidConfig");
    expect(error.message).toContain(`derivedKinds.insight.sources: "transcript" is not a source kind`);

    // A long-lived store (the review server, MCP) sees each edit on its next operation.
    writeFileSync(join(root, "taste.config.ts"), demoConfigText("() => []"));
    const catalogKeys = runTasteOperation("catalog", {}, unknownCaller).pipe(
      Effect.map(({ catalog }) => catalog.derivedKinds.map((kind) => kind.key)),
    );
    const seen = await inStore(
      root,
      Effect.gen(function* () {
        const first = yield* catalogKeys;
        writeFileSync(join(root, "taste.config.ts"), demoConfigText("() => []").replace(/\n    idea: .*\n/, "\n"));
        return [first, yield* catalogKeys];
      }),
    );
    expect(seen).toEqual([
      ["belief", "insight", "idea"],
      ["belief", "insight"],
    ]);
  });
});
