/**
 * `config-write`: the one way a store's config is written, and so the one way a store is created.
 * The text is validated as `config-check` does, then replaces the file atomically.
 */
import { join } from "node:path";

import { Effect, Schema } from "effect";

import { TASTE_CONFIG_FILE, unifiedConfigTextDiff } from "#core/domains/store-config/index.ts";
import { loadTasteConfigText, TasteStoreRoot } from "#core/features/record-store/index.server.ts";
import { INDEX_DIR, storeFileExists, writeFileExclusive } from "#core/infrastructure/record-files.ts";
import { hashStoreConfigText, replaceStoreConfigText } from "#core/infrastructure/store-config-module.ts";
import { withStoreLock } from "#core/infrastructure/store-lock.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

import { StaleTasteConfig } from "../errors.ts";
import {
  type CurrentTasteConfigFile,
  readCurrentTasteConfigFile,
  TasteConfigTextField,
  TasteConfigViewSchema,
  tasteConfigViewOf,
} from "./taste-config-files.ts";

export const WriteTasteConfigInput = Schema.Struct({
  text: TasteConfigTextField,
  expected_current: Schema.String.annotate({
    description:
      'The file you last read, so a concurrent edit is never overwritten: config-show\'s hash (or its full text), or "" to create a new store',
  }),
});
export type WriteTasteConfigInput = typeof WriteTasteConfigInput.Type;

export const WriteTasteConfigResultSchema = Schema.Struct({
  root: Schema.String,
  path: Schema.String,
  /** Whether this write created the store. */
  created: Schema.Boolean,
  /** The new file's hash, to pass as `expected_current` next time. */
  hash: Schema.String,
  /** The unified diff that was applied; empty when the text was unchanged. */
  diff: Schema.String,
  loaded: TasteConfigViewSchema,
});
export type WriteTasteConfigResult = typeof WriteTasteConfigResultSchema.Type;

const isExpectedConfigFile = (file: CurrentTasteConfigFile, expectedCurrent: string) =>
  file.current === undefined
    ? expectedCurrent === ""
    : expectedCurrent === file.current.hash || expectedCurrent === file.current.text;

const requireExpectedConfigFile = (file: CurrentTasteConfigFile, expectedCurrent: string) =>
  isExpectedConfigFile(file, expectedCurrent)
    ? Effect.void
    : Effect.fail(
        new StaleTasteConfig({
          path: file.path,
          currentHash: file.current?.hash,
          expectedNoFile: expectedCurrent === "",
        }),
      );

/**
 * Writes `text` as the config of the store at `root`, creating the store when `expectedCurrent` is "".
 * The candidate is evaluated first, which is slow and async; the file is then re-read and compared
 * under `config.lock`, held through the rename, so two writers from the same text can't both land.
 */
export const writeTasteConfigText = Effect.fn("store-setup.writeTasteConfigText")(function* (
  root: string,
  text: string,
  expectedCurrent: string,
) {
  // Fails a stale write before evaluating it, so the caller hears the conflict first.
  const seen = yield* readCurrentTasteConfigFile(root);
  yield* requireExpectedConfigFile(seen, expectedCurrent);
  // The candidate is the caller's input, so its problems are input problems, not a broken store.
  const config = yield* loadTasteConfigText(seen.path, text).pipe(
    Effect.catchTag("InvalidConfig", (invalid) => Effect.fail(new InvalidTasteInput({ problems: invalid.problems }))),
  );
  return yield* withStoreLock(
    root,
    "config",
    Effect.gen(function* () {
      const file = yield* readCurrentTasteConfigFile(root);
      yield* requireExpectedConfigFile(file, expectedCurrent);
      yield* replaceStoreConfigText(file.path, text);
      if (file.current === undefined && !storeFileExists(root, ".gitignore"))
        yield* writeFileExclusive(join(root, ".gitignore"), `${INDEX_DIR}/\n`);
      const result: WriteTasteConfigResult = {
        root,
        path: file.path,
        created: file.current === undefined,
        hash: hashStoreConfigText(text),
        diff: unifiedConfigTextDiff(TASTE_CONFIG_FILE, file.current?.text, text),
        loaded: tasteConfigViewOf(config),
      };
      return result;
    }),
  );
});

/** `config-write` for the store this operation runs for. */
export const writeOperationTasteConfigText = Effect.fn("store-setup.writeOperationTasteConfigText")(function* (
  input: WriteTasteConfigInput,
) {
  const { root } = yield* TasteStoreRoot;
  return yield* writeTasteConfigText(root, input.text, input.expected_current);
});
