import { buildTasteToolInputSchema } from "#mcp/domains/tool-input-schema/index.ts";
import { listTasteOperations, mcpToolNameOf, type TasteOperationListing } from "#mcp/infrastructure/taste-core.ts";

/** Every `agent` operation as a tool named `taste_<name>`. Human operations are never listed. */
export const listTasteMcpTools = () =>
  listTasteOperations("agent").map((operation) => ({
    name: mcpToolNameOf(operation.name),
    description: operation.description,
    inputSchema: buildTasteToolInputSchema(operation),
    annotations: {
      readOnlyHint: operation.kind === "query",
      // Every write appends; nothing an agent can call overwrites or deletes a record.
      destructiveHint: false,
    },
  }));

const OPERATION_BY_TOOL_NAME = new Map(
  listTasteOperations("agent").map((operation) => [mcpToolNameOf(operation.name), operation] as const),
);

/** The agent operation behind an MCP tool name; undefined for any other name. */
export const findTasteToolOperation = (toolName: string): TasteOperationListing | undefined =>
  OPERATION_BY_TOOL_NAME.get(toolName);
