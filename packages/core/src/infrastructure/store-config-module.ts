/**
 * A store's `taste.config.ts` on disk: importing the module (Bun runs TS natively, so no build step),
 * importing a candidate text the same way, and replacing the file atomically.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { Effect, Predicate, Schema } from "effect";

import { formatSchemaProblems } from "#core/shared/schema-problems.ts";

import { writeFileAtomicSync } from "./record-files.ts";
import { errorCodeOf, InvalidConfig, StoreReadFailed, StoreWriteFailed } from "./store-errors.ts";

const loadedConfigModules = new Map<string, { readonly mtimeMs: number; readonly exported: unknown }>();
let importedCopies = 0;

export const storeConfigModuleExists = (path: string) => existsSync(path);

/** The config file's text, or undefined when there is no file. Any other read failure is `StoreReadFailed`. */
export const readStoreConfigText = (path: string): Effect.Effect<string | undefined, StoreReadFailed> =>
  Effect.suspend(() => {
    try {
      return Effect.succeed(readFileSync(path, "utf8"));
    } catch (cause) {
      return errorCodeOf(cause) === "ENOENT"
        ? Effect.succeed(undefined)
        : Effect.fail(new StoreReadFailed({ path, problem: String(cause) }));
    }
  });

/** A short content hash an agent hands back as `expected_current`. */
export const hashStoreConfigText = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/**
 * `text`'s default export, imported from a uniquely named copy in `directory` and deleted once loaded.
 * Bun caches modules by path and ignores query strings, so every import needs a new name; a sibling
 * of the config keeps its relative imports resolving. Warning: the review's `vite.config.ts` ignores
 * `.taste.config.*.ts` by this naming, or each copy reloads the server.
 */
const importTextAsModule = async (directory: string, text: string) => {
  importedCopies += 1;
  const copy = join(directory, `.taste.config.${process.pid}.${Date.now()}.${importedCopies}.ts`);
  writeFileSync(copy, text);
  try {
    const module: unknown = await import(pathToFileURL(copy).href);
    return Predicate.hasProperty(module, "default") ? module.default : undefined;
  } finally {
    rmSync(copy, { force: true });
  }
};

const loadFailure = (path: string) => (cause: unknown) =>
  new InvalidConfig({ path, problems: [`it failed to load: ${String(cause)}`] });

/** The module's default export, imported fresh whenever the file's mtime changes. */
const importDefaultExport = (path: string) =>
  Effect.tryPromise({
    try: async () => {
      const { mtimeMs } = statSync(path);
      const cached = loadedConfigModules.get(path);
      if (cached?.mtimeMs === mtimeMs) return cached.exported;
      const exported = await importTextAsModule(dirname(path), readFileSync(path, "utf8"));
      loadedConfigModules.set(path, { mtimeMs, exported });
      return exported;
    },
    catch: loadFailure(path),
  });

/** `directory` and each missing ancestor of it, innermost first: what creating it would add. */
const missingDirectoriesOf = (directory: string): Array<string> =>
  existsSync(directory) ? [] : [directory, ...missingDirectoriesOf(dirname(directory))];

/** Removes a directory this module created, unless something else has been put in it since. */
const removeIfEmpty = (directory: string) => {
  try {
    rmdirSync(directory);
  } catch (cause) {
    if (errorCodeOf(cause) !== "ENOTEMPTY" && errorCodeOf(cause) !== "EEXIST") throw cause;
  }
};

/**
 * A candidate text for the config at `path`, imported from its own directory so relative imports
 * resolve as they will once written. A store that doesn't exist yet gets its directories for the
 * import only; they are removed afterwards unless something else was written into them meanwhile.
 */
const importCandidateDefaultExport = (path: string, text: string) =>
  Effect.tryPromise({
    try: async () => {
      const created = missingDirectoriesOf(dirname(path));
      mkdirSync(dirname(path), { recursive: true });
      try {
        return await importTextAsModule(dirname(path), text);
      } finally {
        for (const directory of created) removeIfEmpty(directory);
      }
    },
    catch: loadFailure(path),
  });

/** An imported default export decoded by `configSchema`, with every problem named. */
const decodeConfigExport = <A>(
  path: string,
  imported: ReturnType<typeof importDefaultExport>,
  configSchema: Schema.Decoder<A>,
) =>
  Effect.flatMap(imported, (exported) =>
    Predicate.isObject(exported)
      ? Schema.decodeEffect(configSchema)(exported, { errors: "all", onExcessProperty: "error" }).pipe(
          Effect.mapError((error) => new InvalidConfig({ path, problems: formatSchemaProblems(error) })),
        )
      : Effect.fail(new InvalidConfig({ path, problems: ["it must default-export a plain object"] })),
  );

/** The config module's default export, decoded by `configSchema` with every problem named. */
export const importStoreConfigModule = <A>(path: string, configSchema: Schema.Decoder<A>) =>
  decodeConfigExport(path, importDefaultExport(path), configSchema);

/** `text` decoded exactly as `importStoreConfigModule` would decode it once written to `path`. */
export const importStoreConfigText = <A>(path: string, text: string, configSchema: Schema.Decoder<A>) =>
  decodeConfigExport(path, importCandidateDefaultExport(path, text), configSchema);

/** Replaces the config with `text` by temp file and rename, so a reader never sees half a file. */
export const replaceStoreConfigText = (path: string, text: string): Effect.Effect<void, StoreWriteFailed> =>
  Effect.try({
    try: () => writeFileAtomicSync(path, text),
    catch: (error) => new StoreWriteFailed({ path, problem: String(error) }),
  });
