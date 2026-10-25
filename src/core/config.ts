/**
 * `taste.config.ts`: the store's one editable file. It is a default-exported plain object, so it
 * needs no imports and loads in any store. Loading decodes everything but `place` with Schema;
 * `place` may be a function, checked only as `string | function`.
 */
import { copyFileSync, existsSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Effect, Result, Schema, SchemaIssue } from "effect";

import type { HookSettings } from "../shared/catalog-view.ts";
import type { PlaceKey } from "../shared/places.ts";
import { RECALL_POLICIES } from "../shared/vocabulary.ts";
import {
  DEFAULT_DERIVED_KINDS,
  DEFAULT_HOOK_SETTINGS,
  DEFAULT_SOURCE_KINDS,
  type DerivedKindDefinition,
  type SourceKindDefinition,
  type TasteCatalog,
} from "./catalog.ts";
import { InvalidConfig, InvalidTasteInput, StoreAlreadyExists, StoreNotInitialised } from "./errors.ts";
import { HumanAccountSchema, KIND_KEY_PATTERN } from "./records.ts";
import { INDEX_DIR, writeFileExclusive } from "./store-files.ts";

export const TASTE_CONFIG_FILE = "taste.config.ts";

/** What a custom resolver is told. Capture-time calls carry `source`; recall-time calls don't. */
export type PlaceContext = Readonly<{
  cwd?: string;
  source?: Readonly<{ kind: string; address?: string; saidBy?: string }>;
  env: Readonly<Record<string, string | undefined>>;
}>;

/** Must be deterministic. An empty result means unknown context. */
export type PlaceResolverFunction = (
  context: PlaceContext,
) => ReadonlyArray<PlaceKey> | Promise<ReadonlyArray<PlaceKey>>;

type KindLabels = Readonly<{ singular: string; plural: string; description?: string }>;

/** The shape `taste.config.ts` default-exports (spec §4.3). Loading checks it with the schema below. */
export type TasteConfig = Readonly<{
  owner: `human:${string}`;
  place?: "git" | "directories" | PlaceResolverFunction;
  sourceKinds?: Readonly<Record<string, KindLabels>>;
  derivedKinds?: Readonly<
    Record<
      string,
      KindLabels &
        Readonly<{
          sources: readonly [string, ...Array<string>];
          proposalPrompt: string;
          recall: "inject" | "pull" | "never";
          acceptLabel: string;
        }>
    >
  >;
  hook?: Readonly<{ limit?: number; budgetMs?: number }>;
}>;

/** The config's resolver, with a function's name erased to `custom`. */
export type PlaceResolverSetting =
  | { readonly name: "git" }
  | { readonly name: "directories" }
  | {
      readonly name: "custom";
      /** The config's function, awaited. Its result is unchecked until the resolver validates it. */
      readonly resolvePlaces: (context: PlaceContext) => Promise<unknown>;
    };

export interface LoadedTasteConfig {
  readonly path: string;
  readonly owner: string;
  readonly resolver: PlaceResolverSetting;
  readonly catalog: TasteCatalog;
  readonly hook: HookSettings;
}

const NonEmpty = Schema.String.check(Schema.isMinLength(1));
const KindKey = Schema.String.check(
  Schema.isPattern(KIND_KEY_PATTERN, { message: "kind keys match ^[a-z][a-z0-9-]*$" }),
);
const labelFields = { singular: NonEmpty, plural: NonEmpty, description: Schema.optionalKey(Schema.String) };
const PositiveNumber = Schema.Finite.check(Schema.isGreaterThan(0));

const TasteConfigFileSchema = Schema.Struct({
  owner: HumanAccountSchema,
  place: Schema.optionalKey(Schema.Unknown),
  sourceKinds: Schema.optionalKey(Schema.Record(KindKey, Schema.Struct(labelFields))),
  derivedKinds: Schema.optionalKey(
    Schema.Record(
      KindKey,
      Schema.Struct({
        ...labelFields,
        sources: Schema.Array(KindKey).check(Schema.isMinLength(1)),
        proposalPrompt: NonEmpty,
        recall: Schema.Literals(RECALL_POLICIES),
        acceptLabel: NonEmpty,
      }),
    ),
  ),
  hook: Schema.optionalKey(
    Schema.Struct({
      limit: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
      budgetMs: Schema.optionalKey(PositiveNumber),
    }),
  ),
});
type TasteConfigFile = typeof TasteConfigFileSchema.Type;

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

/** `derivedKinds.idea.sources: …`, so a problem names its field. */
export const formatSchemaProblems = (error: Schema.SchemaError): Array<string> =>
  formatIssues(error.issue).issues.map(({ path, message }) =>
    path === undefined || path.length === 0 ? message : `${path.map(String).join(".")}: ${message}`,
  );

const readResolverSetting = (place: unknown): Result.Result<PlaceResolverSetting, string> => {
  if (place === undefined || place === "git") return Result.succeed({ name: "git" });
  if (place === "directories") return Result.succeed({ name: "directories" });
  if (typeof place === "function")
    return Result.succeed({
      name: "custom",
      resolvePlaces: async (context): Promise<unknown> => {
        const returned: unknown = await place(context);
        return returned;
      },
    });
  return Result.fail(`place: expected "git", "directories" or a function`);
};

const buildCatalog = (file: TasteConfigFile): Result.Result<TasteCatalog, ReadonlyArray<string>> => {
  const sourceKinds: ReadonlyArray<SourceKindDefinition> =
    file.sourceKinds === undefined
      ? DEFAULT_SOURCE_KINDS
      : Object.entries(file.sourceKinds).map(([key, labels]) => Object.assign({ key }, labels));
  const derivedKinds: ReadonlyArray<DerivedKindDefinition> =
    file.derivedKinds === undefined
      ? DEFAULT_DERIVED_KINDS
      : Object.entries(file.derivedKinds).map(([key, kind]) => Object.assign({ key }, kind));
  const sourceKeys = new Set(sourceKinds.map((kind) => kind.key));
  const problems = [
    ...derivedKinds.flatMap((kind) =>
      kind.sources
        .filter((source) => !sourceKeys.has(source))
        .map((source) => `derivedKinds.${kind.key}.sources: "${source}" is not a source kind`),
    ),
    ...derivedKinds
      .filter((kind) => sourceKeys.has(kind.key))
      .map((kind) => `derivedKinds.${kind.key}: "${kind.key}" is already a source kind`),
  ];
  return problems.length > 0 ? Result.fail(problems) : Result.succeed({ sourceKinds, derivedKinds });
};

const decodeConfigFile = Schema.decodeUnknownEffect(TasteConfigFileSchema);

const loadedConfigModules = new Map<string, { readonly mtimeMs: number; readonly exported: unknown }>();

/**
 * The config module's default export, imported fresh whenever the file's mtime changes. Bun caches
 * modules by path and ignores query strings, so each edit is imported from a uniquely named sibling
 * copy (a sibling, so the config's relative imports still resolve), deleted once loaded.
 */
const importConfigModule = (path: string) =>
  Effect.tryPromise({
    try: async (): Promise<unknown> => {
      const { mtimeMs } = statSync(path);
      const cached = loadedConfigModules.get(path);
      if (cached?.mtimeMs === mtimeMs) return cached.exported;
      const copy = join(dirname(path), `.taste.config.${process.pid}.${Date.now()}.${loadedConfigModules.size}.ts`);
      copyFileSync(path, copy);
      try {
        const module: unknown = await import(pathToFileURL(copy).href);
        const exported =
          typeof module === "object" && module !== null && "default" in module ? module.default : undefined;
        loadedConfigModules.set(path, { mtimeMs, exported });
        return exported;
      } finally {
        rmSync(copy, { force: true });
      }
    },
    catch: (error) => new InvalidConfig({ path, problems: [`it failed to load: ${String(error)}`] }),
  });

/**
 * Loads and validates `<root>/taste.config.ts`. Bun runs TS natively; a long-running review server
 * sees edits without restarting.
 */
export const loadTasteConfig = Effect.fn("taste.loadTasteConfig")(function* (root: string) {
  const path = join(root, TASTE_CONFIG_FILE);
  if (!existsSync(path)) return yield* new StoreNotInitialised({ root });
  const exported = yield* importConfigModule(path);
  if (typeof exported !== "object" || exported === null)
    return yield* new InvalidConfig({ path, problems: ["it must default-export a plain object"] });
  const file = yield* decodeConfigFile(exported, { errors: "all", onExcessProperty: "error" }).pipe(
    Effect.mapError((error) => new InvalidConfig({ path, problems: formatSchemaProblems(error) })),
  );
  const resolver = readResolverSetting(file.place);
  const catalog = buildCatalog(file);
  if (Result.isFailure(resolver) || Result.isFailure(catalog)) {
    const problems = [
      ...(Result.isFailure(resolver) ? [resolver.failure] : []),
      ...(Result.isFailure(catalog) ? catalog.failure : []),
    ];
    return yield* new InvalidConfig({ path, problems });
  }
  const config: LoadedTasteConfig = {
    path,
    owner: file.owner,
    resolver: resolver.success,
    catalog: catalog.success,
    hook: { ...DEFAULT_HOOK_SETTINGS, ...file.hook },
  };
  return config;
});

/** `--store`, then `TASTE_STORE`, then `~/.taste`. Empty strings count as unset; `~/` expands. */
export const resolveStoreRoot = (options: {
  readonly flag?: string | undefined;
  readonly env?: string | undefined;
}) => {
  const chosen = options.flag || options.env || "~/.taste";
  return chosen === "~" || chosen.startsWith("~/") ? join(homedir(), chosen.slice(1)) : resolve(chosen);
};

const starterConfigText = (
  owner: string,
) => `// Taste's config for this store. Plain data: no imports needed. Edit freely; it reloads on save.
export default {
  // The human whose taste this store holds. Only they ratify derivations.
  owner: ${JSON.stringify(owner)},

  // How a working directory becomes a place:
  //   "git"          a repo place from the origin remote (github.com/you/app::sub/dir), else the directory
  //   "directories"  always the directory (~/Notes/clients/acme)
  //   a function     ({ cwd, source, env }) => ["clients/acme"]; must be deterministic, [] means unknown
  place: "git",

  // Kinds replace the defaults whole when given. The defaults are one source kind and one derived kind:
  // sourceKinds: { memory: { singular: "memory", plural: "memories" } },
  // derivedKinds: {
  //   belief: { singular: "belief", plural: "beliefs", sources: ["memory"], recall: "inject",
  //             acceptLabel: "Believe", proposalPrompt: "…" },
  //   idea:   { singular: "idea", plural: "ideas", sources: ["memory"], recall: "never",
  //             acceptLabel: "Worth doing", proposalPrompt: "Propose an idea when …" },
  // },

  // The prompt hook injects at most \`limit\` items and gives up after \`budgetMs\`.
  hook: { limit: 3, budgetMs: 650 },
};
`;

/** Writes a commented starter `taste.config.ts` and a `.gitignore` for the index. Folders appear on first write. */
export const initStore = Effect.fn("taste.initStore")(function* (root: string, owner: string) {
  const path = join(root, TASTE_CONFIG_FILE);
  if (existsSync(path)) return yield* new StoreAlreadyExists({ root });
  if (!/^human:\S+$/.test(owner))
    return yield* new InvalidTasteInput({ problems: [`owner must be human:<id>, not "${owner}"`] });
  yield* writeFileExclusive(path, starterConfigText(owner));
  if (!existsSync(join(root, ".gitignore"))) yield* writeFileExclusive(join(root, ".gitignore"), `${INDEX_DIR}/\n`);
  return yield* loadTasteConfig(root);
});
