import { Effect } from "effect";

import { type CaptureGuidanceCatalog, renderTastebudMcpInstructions } from "#mcp/domains/capture-guidance/index.ts";
import { resolveTasteStoreRoot, runTasteOperationAtStoreRoot } from "#mcp/infrastructure/tastebud-core.ts";

/**
 * The server's instructions and the source kinds capture's description lists, read as it starts.
 * Read once: a config edit reaches agents when the host reconnects the server. A missing store, or a
 * config that doesn't load, gives no kinds, and capture's own errors say why.
 */
export const readTastebudCaptureGuidance = async (storeFlag: string | undefined) => {
  const shown = runTasteOperationAtStoreRoot(
    resolveTasteStoreRoot(storeFlag),
    "config-show",
    {},
    {
      via: "mcp",
      actor: undefined,
    },
  );
  const catalog: CaptureGuidanceCatalog | undefined = await Effect.runPromise(
    Effect.match(shown, { onFailure: () => undefined, onSuccess: (result) => result.loaded?.catalog }),
  );
  return { catalog, instructions: renderTastebudMcpInstructions(catalog) };
};
