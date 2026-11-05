/** `config-show`: where setup starts. A missing store is a result, not a failure. */
import { Effect, Result, Schema } from "effect";

import { starterTastebudConfigText } from "#core/domains/store-config/index.ts";
import { loadTastebudConfigText } from "#core/features/record-store/index.server.ts";

import {
  readOperationTastebudConfigFile,
  TastebudConfigViewSchema,
  tastebudConfigViewOf,
} from "./tastebud-config-files.ts";

export const ShowTastebudConfigResultSchema = Schema.Struct({
  root: Schema.String,
  path: Schema.String,
  exists: Schema.Boolean,
  /** The file as it is, and the hash `config-write` takes as `expected_current`. */
  text: Schema.optionalKey(Schema.String),
  hash: Schema.optionalKey(Schema.String),
  /** For a store that doesn't exist yet: the commented starter to edit. Its blank owner must be filled in. */
  starter: Schema.optionalKey(Schema.String),
  /** What the store loads from the file, when it loads. */
  loaded: Schema.optionalKey(TastebudConfigViewSchema),
  /** Why the file doesn't load, each naming its field. */
  problems: Schema.Array(Schema.String),
});
export type ShowTastebudConfigResult = typeof ShowTastebudConfigResultSchema.Type;

/** The store's config text, hash and loaded view; for a missing store, where it would go and a starter. */
export const showTastebudConfigText = Effect.fn("store-setup.showTastebudConfigText")(function* () {
  const { root, path, current } = yield* readOperationTastebudConfigFile;
  if (current === undefined) {
    const missing: ShowTastebudConfigResult = {
      root,
      path,
      exists: false,
      starter: starterTastebudConfigText("human:"),
      problems: [],
    };
    return missing;
  }
  const loaded = yield* Effect.result(loadTastebudConfigText(path, current.text));
  const shown: ShowTastebudConfigResult = {
    root,
    path,
    exists: true,
    text: current.text,
    hash: current.hash,
    ...(Result.isSuccess(loaded) && { loaded: tastebudConfigViewOf(loaded.success) }),
    problems: Result.isFailure(loaded) ? loaded.failure.problems : [],
  };
  return shown;
});
