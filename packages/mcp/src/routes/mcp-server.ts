/**
 * `tastebud mcp`: the stdio MCP server. It serves only the tools the MCP package exposes (just
 * `capture`), named as their operations. Recall reaches agents through the prompt hook, and setup and
 * curation run through the CLI, so an everyday session carries one Tastebud tool.
 */
import {
  callTastebudTool,
  findTastebudToolOperation,
  isTastebudToolArguments,
  listTastebudMcpTools,
  textToolResult,
  withoutNullArguments,
} from "#mcp/features/tastebud-tools/index.server.ts";
import {
  connectMcpServerOverStdio,
  createTastebudMcpSdkServer,
  listMcpClientRootUris,
  mcpClientActorOf,
} from "#mcp/infrastructure/mcp-sdk.ts";

const TASTEBUD_MCP_INSTRUCTIONS = [
  "Tastebud saves the owner's preferences and corrections for later review.",
  "When the owner states a durable preference, corrects your approach, or asks you to remember something, call capture with their exact words and enough surrounding context to preserve their meaning.",
  "Attribute other people's words explicitly.",
  "A saved source is evidence, not an accepted belief.",
  "Pass a working directory only when you actually know it.",
  "Setup and curation use the Tastebud CLI.",
].join(" ");

/** Serves the store named by `--store` / `TASTEBUD_STORE` / `~/.tastebud` on stdin and stdout until the client leaves. */
export const serveTastebudMcpOverStdio = async (storeFlag: string | undefined) => {
  const server = createTastebudMcpSdkServer(TASTEBUD_MCP_INSTRUCTIONS);
  const tools = listTastebudMcpTools();
  server.setRequestHandler("tools/list", () => ({ tools }));
  server.setRequestHandler("tools/call", async (request) => {
    const operation = findTastebudToolOperation(request.params.name);
    if (operation === undefined)
      return textToolResult(
        `No tool named ${request.params.name}. Tastebud's tools: ${tools.map((tool) => tool.name).join(", ")}.`,
        true,
      );
    const args = request.params.arguments ?? {};
    if (!isTastebudToolArguments(args)) return textToolResult("Tool arguments must be a JSON object.", true);
    // The client's name is known only after it initialises, so it is read per call.
    return callTastebudTool(
      { actor: mcpClientActorOf(server), listRootUris: () => listMcpClientRootUris(server) },
      storeFlag,
      operation,
      withoutNullArguments(args),
    );
  });
  await connectMcpServerOverStdio(server);
};
