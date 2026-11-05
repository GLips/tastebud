/**
 * `tastebud hook prompt`: the Claude Code UserPromptSubmit hook. Reads the event JSON on stdin, resolves
 * the context from its `cwd`, and prints the hook JSON when there is something to inject. It always
 * exits 0 and never writes to stderr: a prompt must never wait on, or be blocked by, Tastebud.
 * The feature barrel holds nothing else, so `main.ts` can load it without effect/cli and keep
 * the cold start inside the budget.
 */
import { DEFAULT_HOOK_SETTINGS } from "@tastebud/core/kind-catalog";
import { Effect, Exit, Option, Schema } from "effect";

import { exitProcess, millisSinceProcessStart } from "#cli/infrastructure/process-lifecycle.ts";
import {
  buildHookPayload,
  provideTasteStore,
  resolveTasteContext,
  resolveTasteStoreRoot,
  TasteStore,
} from "#cli/infrastructure/tastebud-core.ts";
import { readStdinText, writeStdout } from "#cli/infrastructure/terminal.ts";

/** Claude Code sends more fields (session_id, transcript_path, …); only these two matter. */
const UserPromptSubmitEvent = Schema.fromJsonString(
  Schema.Struct({ prompt: Schema.String, cwd: Schema.optionalKey(Schema.String) }),
);

/** Exits silently once `budgetMs` has passed since the process started, startup included. */
const armHookDeadline = (budgetMs: number) =>
  setTimeout(() => exitProcess(0), Math.max(0, budgetMs - millisSinceProcessStart()));

const makeHookDeadline = (budgetMs: number) => {
  let timer = armHookDeadline(budgetMs);
  return {
    rearm: (ms: number) => {
      clearTimeout(timer);
      timer = armHookDeadline(ms);
    },
  };
};

const buildHookOutput = (stdin: string, deadline: ReturnType<typeof makeHookDeadline>) =>
  Effect.gen(function* () {
    const event = Schema.decodeOption(UserPromptSubmitEvent)(stdin);
    if (Option.isNone(event)) return undefined;
    const store = yield* TasteStore;
    // The default deadline was armed before the config could be read; the config's own budget wins.
    deadline.rearm(store.config.hook.budgetMs);
    // The hook ships on, so a store with nothing to inject stops before resolving where the session is.
    if (!store.config.catalog.derivedKinds.some((kind) => kind.recall === "inject")) return undefined;
    // An event without `cwd` resolves to unknown context, on which the payload builder stays silent.
    const context = yield* resolveTasteContext({ cwd: event.value.cwd });
    // Not via the registry's `hook-preview`: its fresh config read costs ~50 ms of the cold start.
    const payload = yield* buildHookPayload({ prompt: event.value.prompt, context });
    return payload.hookOutput;
  });

/**
 * Every failure is silence, including a missing store (the hook is installed globally and runs in
 * projects with none) and a place that fails to resolve. `tastebud hook preview` is how to see why.
 */
export const runTastebudHookPrompt = async (storeFlag: string | undefined): Promise<never> => {
  const deadline = makeHookDeadline(DEFAULT_HOOK_SETTINGS.budgetMs);
  const stdin = await readStdinText();
  const root = resolveTasteStoreRoot(storeFlag);
  // Defects are silenced too, deliberately: this is the runtime boundary, and a bug in Tastebud must
  // not block the prompt.
  const exit = await Effect.runPromiseExit(provideTasteStore(root)(buildHookOutput(stdin, deadline)));
  if (Exit.isSuccess(exit) && exit.value !== undefined) writeStdout(exit.value);
  return exitProcess(0);
};
