/**
 * A store's `taste.config.ts` on disk: importing the module bundled with its relative imports, importing a
 * candidate text the same way, and replacing the file atomically.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Effect, Predicate, Schema } from "effect";

import { formatSchemaProblems } from "#core/shared/schema-problems.ts";

import { writeFileAtomicSync } from "./record-files.ts";
import { errorCodeOf, InvalidConfig, StoreReadFailed, StoreWriteFailed } from "./store-errors.ts";

/** A loaded config's default export and every file bundled into it, with the mtime each had when read. */
interface LoadedConfigModule {
  readonly inputs: ReadonlyArray<{ readonly path: string; readonly mtimeMs: number | undefined }>;
  readonly exported: unknown;
}

const loadedConfigModules = new Map<string, LoadedConfigModule>();
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

const loadFailure = (path: string) => (cause: unknown) =>
  new InvalidConfig({ path, problems: [`it failed to load: ${String(cause)}`] });

/** A fresh sibling name for a config copy. Warning: the review's `vite.config.ts` ignores `.taste.config.*.ts`. */
const configCopyPath = (directory: string) => {
  importedCopies += 1;
  return join(directory, `.taste.config.${process.pid}.${Date.now()}.${importedCopies}.ts`);
};

const mtimeOf = (path: string) => statSync(path, { throwIfNoEntry: false })?.mtimeMs;

/** A build log as one problem line, naming the store's config rather than the copy that was bundled. */
const describeBundleLog = (configPath: string, entry: string) => (log: BuildMessage | ResolveMessage) => {
  const position = log.position;
  if (position === null) return log.message;
  const file = position.file === entry ? configPath : position.file;
  return `${log.message} (${file}:${position.line}:${position.column})`;
};

/**
 * `entry` with every relative import inlined, plus the files that went in. Bun caches imported modules by
 * path for the life of the process, so importing the config unbundled would keep its helpers from ever
 * reloading. Packages stay imports; a config may not use them, and their failure names the package.
 */
const bundleConfigModule = (configPath: string, entry: string) =>
  Effect.gen(function* () {
    const built = yield* Effect.tryPromise({
      try: () => Bun.build({ entrypoints: [entry], target: "bun", packages: "external", metafile: true, throw: false }),
      catch: loadFailure(configPath),
    });
    const [output] = built.outputs;
    if (!built.success || output === undefined)
      return yield* new InvalidConfig({
        path: configPath,
        problems: built.logs.map((log) => `it failed to load: ${describeBundleLog(configPath, entry)(log)}`),
      });
    const text = yield* Effect.promise(() => output.text());
    // The metafile names inputs relative to the working directory.
    const inputs = Object.keys(built.metafile?.inputs ?? {}).map((input) => resolve(input));
    return { text, inputs };
  });

/**
 * The bundled `text`'s default export, imported from a uniquely named copy in `directory` and deleted once
 * loaded. Every import needs a new name because Bun ignores query strings when caching.
 */
const importBundledText = (configPath: string, directory: string, text: string) =>
  Effect.tryPromise({
    try: async () => {
      const copy = configCopyPath(directory);
      writeFileSync(copy, text);
      try {
        const module: unknown = await import(pathToFileURL(copy).href);
        return Predicate.hasProperty(module, "default") ? module.default : undefined;
      } finally {
        rmSync(copy, { force: true });
      }
    },
    catch: loadFailure(configPath),
  });

const isLoadedConfigCurrent = (loaded: LoadedConfigModule) =>
  loaded.inputs.every((input) => mtimeOf(input.path) === input.mtimeMs);

/** The config's default export, bundled and imported fresh whenever it or any file it imports changes. */
const importDefaultExport = (path: string) =>
  Effect.gen(function* () {
    const cached = loadedConfigModules.get(path);
    if (cached !== undefined && isLoadedConfigCurrent(cached)) return cached.exported;
    const bundled = yield* bundleConfigModule(path, path);
    const inputs = bundled.inputs.map((input) => ({ path: input, mtimeMs: mtimeOf(input) }));
    const exported = yield* importBundledText(path, dirname(path), bundled.text);
    loadedConfigModules.set(path, { inputs, exported });
    return exported;
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
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const created = missingDirectoriesOf(dirname(path));
      mkdirSync(dirname(path), { recursive: true });
      const entry = configCopyPath(dirname(path));
      writeFileSync(entry, text);
      return { created, entry };
    }),
    ({ entry }) =>
      Effect.flatMap(bundleConfigModule(path, entry), (bundled) =>
        importBundledText(path, dirname(path), bundled.text),
      ),
    ({ created, entry }) =>
      Effect.sync(() => {
        rmSync(entry, { force: true });
        for (const directory of created) removeIfEmpty(directory);
      }),
  );

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
