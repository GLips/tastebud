import { Schema } from "effect";

/** How the caller's context was found: `--in`, `--at`, the cwd, an MCP root, or not at all. */
const CONTEXT_ORIGINS = ["in", "at", "cwd", "mcp-root", "unknown"] as const;
export type ContextOrigin = (typeof CONTEXT_ORIGINS)[number];

/** The places the caller is in now. Unknown context has no places: only global derivations apply. */
export const TasteContextSchema = Schema.Struct({
  places: Schema.Array(Schema.String),
  origin: Schema.Literals(CONTEXT_ORIGINS),
  cwd: Schema.optionalKey(Schema.String),
});
export type TasteContext = typeof TasteContextSchema.Type;

export const UNKNOWN_TASTE_CONTEXT: TasteContext = { places: [], origin: "unknown" };
