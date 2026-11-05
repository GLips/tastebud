/** The `@modelcontextprotocol/server` owner: building the server, its transport, and what the client says. */
import { ProtocolError, ProtocolErrorCode, Server } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { TASTEBUD_VERSION } from "@tastebud/core/taste-vocabulary";

export type TastebudMcpSdkServer = Server;

export const createTastebudMcpSdkServer = (instructions: string): TastebudMcpSdkServer =>
  new Server(
    { name: "tastebud", version: TASTEBUD_VERSION },
    { capabilities: { tools: {}, prompts: {} }, instructions },
  );

/** The JSON-RPC error for a request naming something the server doesn't have, like an unknown prompt. */
export const invalidMcpParams = (message: string) => new ProtocolError(ProtocolErrorCode.InvalidParams, message);

/** Serves `server` on stdin and stdout until the client leaves. */
export const connectMcpServerOverStdio = (server: TastebudMcpSdkServer) => server.connect(new StdioServerTransport());

/** The client's `file://` roots, when it offers them. A client without roots, or one that fails, has none. */
export const listMcpClientRootUris = async (server: TastebudMcpSdkServer): Promise<ReadonlyArray<string>> => {
  if (server.getClientCapabilities()?.roots === undefined) return [];
  try {
    // Roots are deprecated in newer protocol eras and may throw there; `in` is the primary path.
    const { roots } = await server.listRoots();
    return roots.map((root) => root.uri);
  } catch {
    return [];
  }
};

/** The client's own name, as the actor its writes record; spaces aren't allowed in an actor. */
export const mcpClientActorOf = (server: TastebudMcpSdkServer): string | undefined => {
  const client = server.getClientVersion();
  return client === undefined ? undefined : `${client.name}/${client.version}`.replaceAll(/\s+/g, "-");
};
