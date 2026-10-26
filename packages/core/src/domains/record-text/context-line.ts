import type { TasteContext } from "#core/domains/places/index.ts";

/** The first line of every context-bearing text: where the caller is, and how that was decided. */
export const formatContextLine = (context: TasteContext) =>
  context.origin === "unknown"
    ? "Context: unknown (only global derivations apply)"
    : `Context (${context.origin}${context.cwd === undefined ? "" : ` ${context.cwd}`}): ${context.places.join(", ")}`;
