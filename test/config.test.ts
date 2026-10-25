import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  callerFor,
  captureOwnerWords,
  demoConfigText,
  failOperation,
  makeTemporaryDirectory,
  makeTestStore,
  OWNER,
  runOperation,
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

    // A long-running review server must see the edit without restarting.
    writeFileSync(join(root, "taste.config.ts"), demoConfigText("() => []"));
    const { catalog } = await runOperation(
      root,
      "catalog",
      {},
      { via: "cli", context: { places: [], origin: "unknown" } },
    );
    expect(catalog.derivedKinds.map((kind) => kind.key)).toEqual(["belief", "insight", "idea"]);
  });
});
