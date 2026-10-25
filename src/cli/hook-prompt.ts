/**
 * `taste hook prompt`: the Claude Code UserPromptSubmit hook. Reads the event JSON on stdin, resolves
 * the context from its `cwd`, and prints the hook JSON when there is something to inject. It always
 * exits 0 and never writes to stderr: a prompt must never wait on, or be blocked by, Taste.
 * `main.ts` reaches it without loading effect/cli, to keep the cold start inside the budget.
 */
import { Effect, Option, Schema } from "effect";

import {
  buildHookPayload,
  DEFAULT_HOOK_SETTINGS,
  provideTasteStore,
  resolveStoreRoot,
  resolveTasteContext,
  TasteStore,
} from "../core/index.ts";

/** Claude Code sends more fields (session_id, transcript_path, …); only these two matter. */
const UserPromptSubmitEvent = Schema.fromJsonString(
  Schema.Struct({ prompt: Schema.String, cwd: Schema.optionalKey(Schema.String) }),
);

/**
 * Exits silently once `budgetMs` has passed since the process started, startup included. Bun's
 * `performance.now()` counts from process start, so the module loading before this is charged too.
 */
const armHookDeadline = (budgetMs: number) =>
  setTimeout(() => process.exit(0), Math.max(0, budgetMs - performance.now()));

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
    // An event without `cwd` resolves to unknown context, on which the payload builder stays silent.
    const context = yield* resolveTasteContext({ cwd: event.value.cwd });
    // Not via the registry's `hook-preview`: its fresh config read costs ~50 ms of the cold start.
    const payload = yield* buildHookPayload({ prompt: event.value.prompt, context });
    return payload.hookOutput;
  });

/**
 * Every failure is silence, including a missing store (the hook is installed globally and runs in
 * projects with none) and a place that fails to resolve. `taste hook preview` is how to see why.
 */
export const runTasteHookPrompt = async (storeFlag: string | undefined): Promise<never> => {
  const deadline = makeHookDeadline(DEFAULT_HOOK_SETTINGS.budgetMs);
  const stdin = await Bun.stdin.text();
  const root = resolveStoreRoot({ flag: storeFlag, env: process.env.TASTE_STORE });
  const output = await Effect.runPromise(
    provideTasteStore(root)(buildHookOutput(stdin, deadline)).pipe(Effect.catchCause(() => Effect.void)),
  );
  if (output !== undefined) process.stdout.write(output);
  process.exit(0);
};
