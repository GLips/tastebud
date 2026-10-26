/** `taste hook prompt`, `taste hook preview` and `taste mcp`: how agents' harnesses reach Taste. */
import { Effect, Option } from "effect";
import { Argument, Command } from "effect/cli";

import { serveTasteMcp } from "#cli/infrastructure/mcp-server.ts";
import { contextFlags, definedFields, jsonFlag, storeFlag } from "#cli/shared/cli-flags.ts";

import { describedAs, runCliOperation } from "./run-cli-operation.ts";

const hookPreviewCommand = Command.make(
  "preview",
  {
    prompt: Argument.String("prompt").pipe(Argument.withDescription("The prompt the hook would see")),
    ...contextFlags,
    json: jsonFlag,
    store: storeFlag,
  },
  ({ json, store, ...flags }) => runCliOperation("hook-preview", definedFields(flags), { store, json }),
).pipe(describedAs("hook-preview"));

// `main.ts` runs the hook before this tree loads; this registration is what `taste hook --help` lists.
const hookPromptCommand = Command.make("prompt", { store: storeFlag }, ({ store }) =>
  Effect.promise(async () => {
    const { runTasteHookPrompt } = await import("#cli/features/prompt-hook/index.server.ts");
    return runTasteHookPrompt(Option.getOrUndefined(store));
  }),
).pipe(
  Command.withDescription(
    'Claude Code UserPromptSubmit hook: reads the event JSON on stdin, prints what to inject, always exits 0. Install: {"type":"command","command":"taste hook prompt"}',
  ),
);

export const hookCommand = Command.make("hook").pipe(
  Command.withDescription("Agent hooks: `prompt` to install, `preview` to see what it would inject"),
  Command.withSubcommands([hookPromptCommand, hookPreviewCommand]),
);

export const mcpCommand = Command.make("mcp", { store: storeFlag }, ({ store }) =>
  serveTasteMcp(Option.getOrUndefined(store)),
).pipe(
  Command.withDescription(
    "Serve the agent operations as MCP tools over stdio (taste_recall, taste_propose, …). Install: claude mcp add taste -- taste mcp",
  ),
);
