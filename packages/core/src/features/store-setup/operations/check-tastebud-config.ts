/**
 * `config-check`: a candidate `tastebud.config.ts` validated exactly as loading would, the diff it
 * would make, and where probe directories resolve under it. Leaves nothing behind.
 */
import { Effect, Result, Schema } from "effect";

import {
  type LoadedTastebudConfig,
  TASTEBUD_CONFIG_FILE,
  unifiedConfigTextDiff,
} from "#core/domains/store-config/index.ts";
import type { TasteCaller } from "#core/domains/taste-caller/index.ts";
import { expandInputDirectory, resolvePlacesForDirectory } from "#core/features/place-context/index.server.ts";
import { loadTastebudConfigText } from "#core/features/record-store/index.server.ts";
import { OptionalTrimmedTextList } from "#core/shared/input-text.ts";

import {
  readOperationTastebudConfigFile,
  TastebudConfigTextField,
  TastebudConfigViewSchema,
  tastebudConfigViewOf,
} from "./tastebud-config-files.ts";

export const CheckTastebudConfigInput = Schema.Struct({
  text: TastebudConfigTextField,
  probes: OptionalTrimmedTextList.annotate({
    description:
      "Directories to resolve under the candidate's place setting: absolute, ~/…, or relative to the caller's cwd",
  }),
});
export type CheckTastebudConfigInput = typeof CheckTastebudConfigInput.Type;

const ConfigProbeSchema = Schema.Struct({
  probe: Schema.String,
  places: Schema.Array(Schema.String),
  /** Why this probe couldn't be resolved; the candidate is still valid. */
  problem: Schema.optionalKey(Schema.String),
});

export const CheckTastebudConfigResultSchema = Schema.Struct({
  path: Schema.String,
  valid: Schema.Boolean,
  /** Every reason it would not load, each naming its field. Empty when valid. */
  problems: Schema.Array(Schema.String),
  /** Whether writing it would create the store. */
  createsStore: Schema.Boolean,
  /** A unified diff against the current file; empty when nothing would change. */
  diff: Schema.String,
  loaded: Schema.optionalKey(TastebudConfigViewSchema),
  probes: Schema.Array(ConfigProbeSchema),
});
export type CheckTastebudConfigResult = typeof CheckTastebudConfigResultSchema.Type;

const resolveConfigProbe = (config: LoadedTastebudConfig, probe: string, cwd: string | undefined) =>
  Effect.gen(function* () {
    const resolved = yield* Effect.result(
      Effect.flatMap(expandInputDirectory("probes", probe, cwd), (directory) =>
        resolvePlacesForDirectory(config, directory),
      ),
    );
    return Result.isSuccess(resolved)
      ? { probe, places: [...resolved.success] }
      : { probe, places: [], problem: resolved.failure.message };
  });

export const checkTastebudConfigText = Effect.fn("store-setup.checkTastebudConfigText")(function* (
  input: CheckTastebudConfigInput,
  caller: TasteCaller,
) {
  const { path, current } = yield* readOperationTastebudConfigFile;
  const loaded = yield* Effect.result(loadTastebudConfigText(path, input.text));
  const probes = Result.isSuccess(loaded)
    ? yield* Effect.forEach(input.probes ?? [], (probe) => resolveConfigProbe(loaded.success, probe, caller.cwd))
    : [];
  const result: CheckTastebudConfigResult = {
    path,
    valid: Result.isSuccess(loaded),
    problems: Result.isFailure(loaded) ? loaded.failure.problems : [],
    createsStore: current === undefined,
    diff: unifiedConfigTextDiff(TASTEBUD_CONFIG_FILE, current?.text, input.text),
    ...(Result.isSuccess(loaded) && { loaded: tastebudConfigViewOf(loaded.success) }),
    probes,
  };
  return result;
});
