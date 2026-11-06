/** `tastebud hook prompt`, `tastebud hook preview` and `tastebud mcp`: how agents' harnesses reach Tastebud. */
import { Effect, Option } from "effect";
import { Argument, Command } from "effect/cli";

import { serveTastebudMcp } from "#cli/infrastructure/mcp-server.ts";
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

// `main.ts` runs the hook before this tree loads; this registration is what `tastebud hook --help` lists.
const hookPromptCommand = Command.make("prompt", { store: storeFlag }, ({ store }) =>
  Effect.promise(async () => {
    const { runTastebudHookPrompt } = await import("#cli/features/prompt-hook/index.server.ts");
    return runTastebudHookPrompt(Option.getOrUndefined(store));
  }),
).pipe(
  Command.withDescription(
    'Claude Code UserPromptSubmit hook: reads the event JSON on stdin, prints what to inject, always exits 0. Install: {"type":"command","command":"tastebud hook prompt"}',
  ),
);

export const hookCommand = Command.make("hook").pipe(
  Command.withDescription("Agent hooks: `prompt` to install, `preview` to see what it would inject"),
  Command.withSubcommands([hookPromptCommand, hookPreviewCommand]),
);

export const mcpCommand = Command.make("mcp", { store: storeFlag }, ({ store }) =>
  serveTastebudMcp(Option.getOrUndefined(store)),
).pipe(
  Command.withDescription(
    "Serve Tastebud's MCP tool, capture, over stdio. Install: claude mcp add tastebud -- tastebud mcp",
  ),
);
