/** `tastebud hook prompt`, `tastebud hook preview` and `tastebud mcp`: how agents' harnesses reach Tastebud. */
import { Effect, Option } from "effect";
import { Argument, Command } from "effect/cli";

import { readClaudeCodeTranscript, runTastebudHookPrompt } from "#cli/features/prompt-hook/index.server.ts";
import { serveTastebudMcp } from "#cli/infrastructure/mcp-server.ts";
import { contextFlags, definedFields, jsonFlag, optionalTextFlag, storeFlag } from "#cli/shared/cli-flags.ts";

import { describedAs, runCliOperation } from "./run-cli-operation.ts";

const hookPreviewCommand = Command.make(
  "preview",
  {
    prompt: Argument.String("prompt").pipe(Argument.withDescription("The prompt the hook would see")),
    ...contextFlags,
    transcript: optionalTextFlag(
      "transcript",
      "A Claude Code transcript (.jsonl) to read the previous turn and recent hook output from, as the hook does",
    ),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ json, store, transcript, ...flags }) =>
    Effect.gen(function* () {
      const reading = Option.isSome(transcript)
        ? yield* readClaudeCodeTranscript(transcript.value, flags.prompt)
        : undefined;
      const input = { ...definedFields(flags), ...(reading !== undefined && { transcript: reading }) };
      return yield* runCliOperation("hook-preview", input, { store, json });
    }),
).pipe(describedAs("hook-preview"));

// `main.ts` runs the hook before this tree loads; this registration is what `tastebud hook --help` lists.
const hookPromptCommand = Command.make("prompt", { store: storeFlag }, ({ store }) =>
  Effect.promise(() => runTastebudHookPrompt(Option.getOrUndefined(store))),
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
