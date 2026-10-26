import { Effect } from "effect";

/** Serves the MCP tools on stdio. Loaded on demand, so other commands never load the MCP SDK. */
export const serveTasteMcp = (storeFlag: string | undefined) =>
  Effect.promise(async () => {
    const { serveTasteMcpOverStdio } = await import("@taste/mcp");
    // Returns once connected; the open stdin keeps the process alive until the client closes it.
    await serveTasteMcpOverStdio(storeFlag);
  });
