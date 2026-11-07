/**
 * What the MCP server tells agents about capturing, written from the owner's source kinds so a kind
 * the owner adds (a `call-quote` from client calls) changes what agents listen for. Each kind's
 * `description` is the owner's own line for whose words it holds and when to save them.
 */
import type { CatalogView } from "@tastebud/core/kind-catalog";

/** The part of a store's catalog that capture guidance reads; absent when there is no store yet. */
export type CaptureGuidanceCatalog = Pick<CatalogView, "sourceKinds" | "conversationSourceKind">;

// In-session capture is for explicit asks only: a later pass over the owner's transcripts finds the
// rest, and an agent nudged to save will save things that aren't there.
const WHEN_TO_CAPTURE =
  "Call capture only when the owner asks you to remember something or plainly states a lasting rule for how they want work done. Don't go looking for things to save: the rest is found by mining their past sessions, on their request.";

const kindLine = (catalog: CaptureGuidanceCatalog, kind: CaptureGuidanceCatalog["sourceKinds"][number]) => {
  const conversation = kind.key === catalog.conversationSourceKind ? " (words said to you; leave `kind` out)" : "";
  return `- ${kind.key}${conversation}${kind.description === undefined ? "" : `: ${kind.description}`}`;
};

/** The store's source kinds as capture's `kind` values, each with the owner's line on when to use it. */
export const renderCaptureKindLines = (catalog: CaptureGuidanceCatalog) =>
  ["Kinds this store keeps:", ...catalog.sourceKinds.map((kind) => kindLine(catalog, kind))].join("\n");

/** The server's instructions: when to capture, and what this store keeps. */
export const renderTastebudMcpInstructions = (catalog: CaptureGuidanceCatalog | undefined) =>
  [
    "Tastebud keeps the owner's exact words so they can later accept rules their agents follow.",
    catalog === undefined
      ? "There is no store yet. If the owner asks to set Tastebud up, or states a preference they want kept, offer setup: it runs from a shell with `tastebud config-show --guide`."
      : WHEN_TO_CAPTURE,
    'Save words verbatim, never your own: said_by "owner" for the owner, and an explicit account and label for anyone else. A saved source is evidence, not an accepted belief.',
    ...(catalog === undefined ? [] : [renderCaptureKindLines(catalog)]),
    "Pass a working directory only when you actually know it. Setup and curation use the Tastebud CLI.",
  ].join("\n");
