import { buildTastebudToolInputSchema } from "#mcp/domains/tool-input-schema/index.ts";
import {
  type AgentTasteOperationName,
  listTasteOperations,
  type TasteOperationListing,
} from "#mcp/infrastructure/tastebud-core.ts";

/**
 * The operations MCP serves, each as a tool of the same name. Every listed tool costs context in every
 * agent session, so only what an agent needs mid-conversation is here; the rest stays on the CLI.
 * Listing and dispatch both read this, so an unlisted name is refused rather than run.
 */
const MCP_EXPOSED_OPERATIONS = ["capture"] as const satisfies ReadonlyArray<AgentTasteOperationName>;
const EXPOSED_OPERATION_NAMES: ReadonlySet<string> = new Set(MCP_EXPOSED_OPERATIONS);

const EXPOSED_OPERATION_BY_TOOL_NAME: ReadonlyMap<string, TasteOperationListing> = new Map(
  listTasteOperations("agent")
    .filter((operation) => EXPOSED_OPERATION_NAMES.has(operation.name))
    .map((operation) => [operation.name, operation] as const),
);

/** The exposed operations as MCP tools, in registry order. */
export const listTastebudMcpTools = () =>
  [...EXPOSED_OPERATION_BY_TOOL_NAME].map(([name, operation]) => ({
    name,
    description: operation.description,
    inputSchema: buildTastebudToolInputSchema(operation),
    annotations: {
      readOnlyHint: operation.kind === "query",
      destructiveHint: operation.kind === "overwrite",
    },
  }));

/** The exposed operation behind an MCP tool name; undefined for any other name. */
export const findTastebudToolOperation = (toolName: string): TasteOperationListing | undefined =>
  EXPOSED_OPERATION_BY_TOOL_NAME.get(toolName);
