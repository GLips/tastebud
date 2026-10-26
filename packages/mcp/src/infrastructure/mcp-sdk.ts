/** The `@modelcontextprotocol/server` owner: building the server, its transport, and what the client says. */
import { Server } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

export type TasteMcpSdkServer = Server;

export const createTasteMcpSdkServer = (instructions: string): TasteMcpSdkServer =>
  new Server({ name: "taste", version: "0.1.0" }, { capabilities: { tools: {} }, instructions });

/** Serves `server` on stdin and stdout until the client leaves. */
export const connectMcpServerOverStdio = (server: TasteMcpSdkServer) => server.connect(new StdioServerTransport());

/** The client's `file://` roots, when it offers them. A client without roots, or one that fails, has none. */
export const listMcpClientRootUris = async (server: TasteMcpSdkServer): Promise<ReadonlyArray<string>> => {
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
export const mcpClientActorOf = (server: TasteMcpSdkServer): string | undefined => {
  const client = server.getClientVersion();
  return client === undefined ? undefined : `${client.name}/${client.version}`.replaceAll(/\s+/g, "-");
};
