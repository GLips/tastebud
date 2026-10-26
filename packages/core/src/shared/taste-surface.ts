/**
 * Where a failure is shown. Retry hints name inputs the way that surface spells them: CLI flags
 * (`--despite`) for the CLI, argument names (`despite`) for MCP tools.
 */
export type TasteSurface = "cli" | "mcp" | "review" | "hook";

/** Whether the surface spells inputs as argument names rather than flags. */
export const isArgumentSurface = (surface: TasteSurface) => surface === "mcp";
