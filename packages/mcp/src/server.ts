/**
 * `taste mcp`: the stdio MCP server. Every `agent` operation is a tool named `taste_<name>`, with the
 * operation's description and a JSON schema generated from its encoded input. Human operations
 * (inbox, decide, thread notes) are never listed: deciding happens only in the review UI.
 */
import { Server } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import {
  buildTasteOperationCaller,
  describeTasteFailure,
  listTasteOperations,
  mcpToolNameOf,
  provideTasteStore,
  renderTasteOperationText,
  resolveStoreRoot,
  runTasteOperation,
  type TasteOperationListing,
} from "@taste/core";
import { Cause, Effect, Exit, type JsonSchema, Schema, SchemaAST } from "effect";

const TASTE_MCP_INSTRUCTIONS = [
  "Taste holds how its owner works: beliefs and other kinds they ratified, the ones they rejected, and their own words as sources.",
  "Call taste_catalog first to learn the kinds and how to propose each.",
  "Pass your working directory as `in` on every tool that takes it, so Taste knows which project you are in.",
  "taste_recall before a judgment call; taste_capture the owner's exact words; taste_propose a derivation citing them.",
  "You can't accept or reject anything: hand the owner taste_review_url instead.",
].join(" ");

/** Agents read these on every tool that takes them, so they say what to pass, not how it works. */
const CONTEXT_FIELD_DESCRIPTIONS: Record<string, string> = {
  in: "Your working directory, as an absolute path. Pass it on every call: Taste resolves it to the project you are in (repo and subdirectory). Without it, only global entries apply.",
  at: "Place keys to take as where you are, instead of `in` (e.g. github.com/acme/web::apps/checkout). Rarely needed; never combine with `in`.",
};

const isJsonSchema = (value: unknown): value is JsonSchema.JsonSchema =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Optional fields decode from `undefined`, which the generated schema spells as `null`. The decoder
 * refuses `null`, so the schema must not offer it.
 */
const withoutNullAlternatives = (schema: JsonSchema.JsonSchema): JsonSchema.JsonSchema => {
  const alternatives = schema.anyOf;
  if (!Array.isArray(alternatives)) return schema;
  const kept = alternatives.filter(isJsonSchema).filter((alternative) => alternative.type !== "null");
  const { anyOf: _anyOf, ...rest } = schema;
  return kept.length === 1 ? { ...kept[0], ...rest } : { ...rest, anyOf: kept };
};

/**
 * The MCP `inputSchema` for an operation. Field descriptions are annotated on the decoded side, so
 * the encoded schema loses them; they are copied back from each field's AST.
 */
const buildTasteToolInputSchema = (operation: TasteOperationListing): JsonSchema.JsonSchema & { type: "object" } => {
  const fields = Object.entries(operation.input.fields);
  if (fields.length === 0) return { type: "object", properties: {}, additionalProperties: false };
  const document = Schema.toJsonSchemaDocument(operation.input, { onExcessProperty: "error" });
  const generated = document.schema;
  const generatedProperties = isJsonSchema(generated.properties) ? generated.properties : {};
  const properties = Object.fromEntries(
    fields.map(([key, field]) => {
      const description = CONTEXT_FIELD_DESCRIPTIONS[key] ?? SchemaAST.resolveDescription(field.ast);
      const property = withoutNullAlternatives(isJsonSchema(generatedProperties[key]) ? generatedProperties[key] : {});
      return [key, description === undefined ? property : { ...property, description }];
    }),
  );
  const { definitions } = document;
  return {
    ...generated,
    type: "object",
    properties,
    ...(Object.keys(definitions).length > 0 && { $defs: definitions }),
  };
};

const listTasteMcpTools = () =>
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

/** Models often send `null` for an optional argument they mean to leave out. */
const withoutNullArguments = (args: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(args).filter(([, value]) => value !== null));

/** The client's `file://` roots, when it offers them. A client without roots, or one that fails, has none. */
const listClientRootUris = async (server: Server): Promise<ReadonlyArray<string>> => {
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
const clientActorOf = (server: Server): string | undefined => {
  const client = server.getClientVersion();
  return client === undefined ? undefined : `${client.name}/${client.version}`.replaceAll(/\s+/g, "-");
};

const textResult = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  ...(isError && { isError: true }),
});

const callTasteTool = async (
  server: Server,
  storeRoot: string,
  operation: TasteOperationListing,
  args: Record<string, unknown>,
) => {
  const { name } = operation;
  const program = Effect.gen(function* () {
    // Never the server's own cwd: it says where the client launched it, not where the agent works.
    const origin = {
      via: "mcp" as const,
      actor: clientActorOf(server),
      roots: Effect.promise(() => listClientRootUris(server)),
    };
    const caller = yield* buildTasteOperationCaller(name, origin, args);
    const output = yield* runTasteOperation(name, args, caller);
    return { text: renderTasteOperationText(name, output), output };
  });
  const exit = await Effect.runPromiseExit(provideTasteStore(storeRoot)(program));
  if (Exit.isSuccess(exit))
    return { ...textResult(exit.value.text), structuredContent: exit.value.output as Record<string, unknown> };
  const failed = exit.cause.reasons.find(Cause.isFailReason);
  if (failed !== undefined) {
    const { envelope } = describeTasteFailure(failed.error, "mcp");
    return { ...textResult(envelope.sentence, true), structuredContent: { error: envelope } };
  }
  // A defect is a bug in Taste: the log gets the stack, the agent a sentence it can act on.
  process.stderr.write(`taste mcp: ${name} failed unexpectedly\n${Cause.pretty(exit.cause)}\n`);
  return textResult(`Taste failed unexpectedly running ${name}; the server's stderr has the details.`, true);
};

/** The server for one store, before it is connected to a transport. */
const makeTasteMcpServer = (storeRoot: string) => {
  const server = new Server(
    { name: "taste", version: "0.1.0" },
    { capabilities: { tools: {} }, instructions: TASTE_MCP_INSTRUCTIONS },
  );
  const tools = listTasteMcpTools();
  server.setRequestHandler("tools/list", () => ({ tools }));
  server.setRequestHandler("tools/call", async (request) => {
    const operation = OPERATION_BY_TOOL_NAME.get(request.params.name);
    if (operation === undefined)
      return textResult(
        `No tool named ${request.params.name}. Taste's tools: ${tools.map((tool) => tool.name).join(", ")}.`,
        true,
      );
    return callTasteTool(server, storeRoot, operation, withoutNullArguments(request.params.arguments ?? {}));
  });
  return server;
};

/** Serves the store named by `--store` / `TASTE_STORE` / `~/.taste` on stdin and stdout until the client leaves. */
export const serveTasteMcpOverStdio = async (storeFlag: string | undefined) => {
  const root = resolveStoreRoot({ flag: storeFlag, env: process.env.TASTE_STORE });
  const server = makeTasteMcpServer(root);
  await server.connect(new StdioServerTransport());
};
