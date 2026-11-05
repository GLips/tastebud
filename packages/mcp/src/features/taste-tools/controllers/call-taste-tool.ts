import { Cause, Effect, Exit, Schema } from "effect";

import { writeTasteMcpServerLog } from "#mcp/infrastructure/server-log.ts";
import {
  describeTasteFailure,
  renderTasteOperationText,
  resolveTasteStoreRoot,
  runTasteOperationAtStoreRoot,
  type TasteOperationListing,
  type TasteOperationWireInput,
} from "#mcp/infrastructure/taste-core.ts";

/** A tool call's arguments are JSON-RPC params, so anything else is a malformed request. */
export const isTasteToolArguments = Schema.is(Schema.Record(Schema.String, Schema.Json));

/** Models often send `null` for an optional argument they mean to leave out. */
export const withoutNullArguments = (args: TasteOperationWireInput): TasteOperationWireInput =>
  Object.fromEntries(Object.entries(args).filter(([, value]) => value !== null));

export const textToolResult = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  ...(isError && { isError: true }),
});

/** What a tool call knows about its client, read lazily from the MCP session. */
export interface TasteToolClient {
  readonly actor: string | undefined;
  readonly listRootUris: () => Promise<ReadonlyArray<string>>;
}

/** Runs one tool's operation against the store; failures become an error result with the envelope. */
export const callTasteTool = async (
  client: TasteToolClient,
  storeFlag: string | undefined,
  operation: TasteOperationListing,
  args: TasteOperationWireInput,
) => {
  const { name } = operation;
  const program = Effect.gen(function* () {
    // Never the server's own cwd: it says where the client launched it, not where the agent works.
    const origin = {
      via: "mcp" as const,
      actor: client.actor,
      roots: Effect.promise(client.listRootUris),
    };
    const output = yield* runTasteOperationAtStoreRoot(resolveTasteStoreRoot(storeFlag), name, args, origin);
    return { text: renderTasteOperationText(name, output), output };
  });
  const exit = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(exit)) return { ...textToolResult(exit.value.text), structuredContent: exit.value.output };
  const failed = exit.cause.reasons.find(Cause.isFailReason);
  if (failed !== undefined) {
    const { envelope } = describeTasteFailure(failed.error, "mcp");
    return { ...textToolResult(envelope.sentence, true), structuredContent: { error: envelope } };
  }
  // A defect is a bug in Taste: the log gets the stack, the agent a sentence it can act on.
  writeTasteMcpServerLog(`taste mcp: ${name} failed unexpectedly\n${Cause.pretty(exit.cause)}\n`);
  return textToolResult(`Taste failed unexpectedly running ${name}; the server's stderr has the details.`, true);
};
