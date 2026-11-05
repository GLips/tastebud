/**
 * `tastebud mcp`: the stdio MCP server. Every `agent` operation is a tool named `tastebud_<name>`, with the
 * operation's description and a JSON schema generated from its encoded input. Human operations
 * (inbox, decide, thread notes) are never listed: deciding happens only in the review UI. The one
 * prompt, `setup`, is the interview that writes the store's config.
 */
import { getTastebudMcpPrompt, listTastebudMcpPrompts } from "#mcp/features/tastebud-prompts/index.server.ts";
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
  "Tastebud holds how its owner works: beliefs and other kinds they ratified, the ones they rejected, and their own words as sources.",
  "Call tastebud_catalog first to learn the kinds and how to propose each.",
  "If there is no store yet, or the owner wants to change what Tastebud keeps, run the `setup` prompt (it starts with tastebud_config_show).",
  "Pass your working directory as `in` on every tool that takes it, so Tastebud knows which project you are in.",
  "tastebud_recall before a judgment call; tastebud_capture the owner's exact words; tastebud_propose a derivation citing them.",
  "You can't accept or reject anything: hand the owner tastebud_review_url instead.",
].join(" ");

/** Serves the store named by `--store` / `TASTEBUD_STORE` / `~/.tastebud` on stdin and stdout until the client leaves. */
export const serveTastebudMcpOverStdio = async (storeFlag: string | undefined) => {
  const server = createTastebudMcpSdkServer(TASTEBUD_MCP_INSTRUCTIONS);
  const tools = listTastebudMcpTools();
  server.setRequestHandler("tools/list", () => ({ tools }));
  server.setRequestHandler("prompts/list", listTastebudMcpPrompts);
  server.setRequestHandler("prompts/get", (request) => getTastebudMcpPrompt(request.params.name));
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
