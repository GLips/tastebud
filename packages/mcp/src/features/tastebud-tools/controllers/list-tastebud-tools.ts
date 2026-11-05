import { buildTastebudToolInputSchema } from "#mcp/domains/tool-input-schema/index.ts";
import { listTasteOperations, mcpToolNameOf, type TasteOperationListing } from "#mcp/infrastructure/tastebud-core.ts";

/** Every `agent` operation as a tool named `tastebud_<name>`. Human operations are never listed. */
export const listTastebudMcpTools = () =>
  listTasteOperations("agent").map((operation) => ({
    name: mcpToolNameOf(operation.name),
    description: operation.description,
    inputSchema: buildTastebudToolInputSchema(operation),
    annotations: {
      readOnlyHint: operation.kind === "query",
      // Record writes only append; the one overwrite is config-write replacing tastebud.config.ts.
      destructiveHint: operation.kind === "overwrite",
    },
  }));

const OPERATION_BY_TOOL_NAME = new Map(
  listTasteOperations("agent").map((operation) => [mcpToolNameOf(operation.name), operation] as const),
);

/** The agent operation behind an MCP tool name; undefined for any other name. */
export const findTastebudToolOperation = (toolName: string): TasteOperationListing | undefined =>
  OPERATION_BY_TOOL_NAME.get(toolName);
