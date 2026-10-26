/**
 * `taste mcp`: the stdio MCP server. Every `agent` operation is a tool named `taste_<name>`, with the
 * operation's description and a JSON schema generated from its encoded input. Human operations
 * (inbox, decide, thread notes) are never listed: deciding happens only in the review UI.
 */
import {
  callTasteTool,
  findTasteToolOperation,
  isTasteToolArguments,
  listTasteMcpTools,
  textToolResult,
  withoutNullArguments,
} from "#mcp/features/taste-tools/index.server.ts";
import {
  connectMcpServerOverStdio,
  createTasteMcpSdkServer,
  listMcpClientRootUris,
  mcpClientActorOf,
} from "#mcp/infrastructure/mcp-sdk.ts";

const TASTE_MCP_INSTRUCTIONS = [
  "Taste holds how its owner works: beliefs and other kinds they ratified, the ones they rejected, and their own words as sources.",
  "Call taste_catalog first to learn the kinds and how to propose each.",
  "Pass your working directory as `in` on every tool that takes it, so Taste knows which project you are in.",
  "taste_recall before a judgment call; taste_capture the owner's exact words; taste_propose a derivation citing them.",
  "You can't accept or reject anything: hand the owner taste_review_url instead.",
].join(" ");

/** Serves the store named by `--store` / `TASTE_STORE` / `~/.taste` on stdin and stdout until the client leaves. */
export const serveTasteMcpOverStdio = async (storeFlag: string | undefined) => {
  const server = createTasteMcpSdkServer(TASTE_MCP_INSTRUCTIONS);
  const tools = listTasteMcpTools();
  server.setRequestHandler("tools/list", () => ({ tools }));
  server.setRequestHandler("tools/call", async (request) => {
    const operation = findTasteToolOperation(request.params.name);
    if (operation === undefined)
      return textToolResult(
        `No tool named ${request.params.name}. Taste's tools: ${tools.map((tool) => tool.name).join(", ")}.`,
        true,
      );
    const args = request.params.arguments ?? {};
    if (!isTasteToolArguments(args)) return textToolResult("Tool arguments must be a JSON object.", true);
    // The client's name is known only after it initialises, so it is read per call.
    return callTasteTool(
      { actor: mcpClientActorOf(server), listRootUris: () => listMcpClientRootUris(server) },
      storeFlag,
      operation,
      withoutNullArguments(args),
    );
  });
  await connectMcpServerOverStdio(server);
};
