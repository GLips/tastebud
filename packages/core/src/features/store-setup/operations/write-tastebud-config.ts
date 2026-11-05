/**
 * `config-write`: the one way a store's config is written, and so the one way a store is created.
 * The text is validated as `config-check` does, then replaces the file atomically.
 */
import { join } from "node:path";

import { Effect, Schema } from "effect";

import { TASTEBUD_CONFIG_FILE, unifiedConfigTextDiff } from "#core/domains/store-config/index.ts";
import { loadTastebudConfigText, TasteStoreRoot } from "#core/features/record-store/index.server.ts";
import { INDEX_DIR, storeFileExists, writeFileExclusive } from "#core/infrastructure/record-files.ts";
import { hashStoreConfigText, replaceStoreConfigText } from "#core/infrastructure/store-config-module.ts";
import { withStoreLock } from "#core/infrastructure/store-lock.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

import { StaleTastebudConfig } from "../errors.ts";
import {
  type CurrentTastebudConfigFile,
  readCurrentTastebudConfigFile,
  TastebudConfigTextField,
  TastebudConfigViewSchema,
  tastebudConfigViewOf,
} from "./tastebud-config-files.ts";

export const WriteTastebudConfigInput = Schema.Struct({
  text: TastebudConfigTextField,
  expected_current: Schema.String.annotate({
    description:
      'The file you last read, so a concurrent edit is never overwritten: config-show\'s hash (or its full text), or "" to create a new store',
  }),
});
export type WriteTastebudConfigInput = typeof WriteTastebudConfigInput.Type;

export const WriteTastebudConfigResultSchema = Schema.Struct({
  root: Schema.String,
  path: Schema.String,
  /** Whether this write created the store. */
  created: Schema.Boolean,
  /** The new file's hash, to pass as `expected_current` next time. */
  hash: Schema.String,
  /** The unified diff that was applied; empty when the text was unchanged. */
  diff: Schema.String,
  loaded: TastebudConfigViewSchema,
});
export type WriteTastebudConfigResult = typeof WriteTastebudConfigResultSchema.Type;

const isExpectedConfigFile = (file: CurrentTastebudConfigFile, expectedCurrent: string) =>
  file.current === undefined
    ? expectedCurrent === ""
    : expectedCurrent === file.current.hash || expectedCurrent === file.current.text;

const requireExpectedConfigFile = (file: CurrentTastebudConfigFile, expectedCurrent: string) =>
  isExpectedConfigFile(file, expectedCurrent)
    ? Effect.void
    : Effect.fail(
        new StaleTastebudConfig({
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
export const writeTastebudConfigText = Effect.fn("store-setup.writeTastebudConfigText")(function* (
  root: string,
  text: string,
  expectedCurrent: string,
) {
  // Fails a stale write before evaluating it, so the caller hears the conflict first.
  const seen = yield* readCurrentTastebudConfigFile(root);
  yield* requireExpectedConfigFile(seen, expectedCurrent);
  // The candidate is the caller's input, so its problems are input problems, not a broken store.
  const config = yield* loadTastebudConfigText(seen.path, text).pipe(
    Effect.catchTag("InvalidConfig", (invalid) => Effect.fail(new InvalidTasteInput({ problems: invalid.problems }))),
  );
  return yield* withStoreLock(
    root,
    "config",
    Effect.gen(function* () {
      const file = yield* readCurrentTastebudConfigFile(root);
      yield* requireExpectedConfigFile(file, expectedCurrent);
      yield* replaceStoreConfigText(file.path, text);
      if (file.current === undefined && !storeFileExists(root, ".gitignore"))
        yield* writeFileExclusive(join(root, ".gitignore"), `${INDEX_DIR}/\n`);
      const result: WriteTastebudConfigResult = {
        root,
        path: file.path,
        created: file.current === undefined,
        hash: hashStoreConfigText(text),
        diff: unifiedConfigTextDiff(TASTEBUD_CONFIG_FILE, file.current?.text, text),
        loaded: tastebudConfigViewOf(config),
      };
      return result;
    }),
  );
});

/** `config-write` for the store this operation runs for. */
export const writeOperationTastebudConfigText = Effect.fn("store-setup.writeOperationTastebudConfigText")(function* (
  input: WriteTastebudConfigInput,
) {
  const { root } = yield* TasteStoreRoot;
  return yield* writeTastebudConfigText(root, input.text, input.expected_current);
});
