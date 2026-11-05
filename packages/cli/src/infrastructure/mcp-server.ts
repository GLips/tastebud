import { Effect } from "effect";

/** Serves the MCP tools on stdio. Loaded on demand, so other commands never load the MCP SDK. */
export const serveTastebudMcp = (storeFlag: string | undefined) =>
  Effect.promise(async () => {
    const { serveTastebudMcpOverStdio } = await import("@tastebud/mcp");
    // Returns once connected; the open stdin keeps the process alive until the client closes it.
    await serveTastebudMcpOverStdio(storeFlag);
  });
