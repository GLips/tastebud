/**
 * `tastebud.config.ts`: the store's one editable file. It is a default-exported plain object, so it
 * needs no imports and loads in any store. A `place` function can only be checked to be a function;
 * what it returns is decoded on every call. Importing the module is infrastructure's job.
 */
import { Predicate, Result, Schema } from "effect";

import {
  DEFAULT_DERIVED_KINDS,
  DEFAULT_HOOK_SETTINGS,
  DEFAULT_SOURCE_KINDS,
  type DerivedKindDefinition,
  type HookSettings,
  type SourceKindDefinition,
  type TasteCatalog,
} from "#core/domains/kind-catalog/index.ts";
import type { PlaceKey } from "#core/domains/places/index.ts";
import { HumanAccountSchema, KIND_KEY_PATTERN } from "#core/domains/records/index.ts";
import { RECALL_POLICIES } from "#core/domains/taste-vocabulary/index.ts";

export const TASTEBUD_CONFIG_FILE = "tastebud.config.ts";

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

/** The shape `tastebud.config.ts` default-exports (spec §4.3). Loading checks it with the schema below. */
export type TastebudConfig = Readonly<{
  owner: `human:${string}`;
  ownerName?: string;
  conversationSourceKind?: string;
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
  review?: Readonly<{ port?: number }>;
}>;

/** The config's resolver, with a function's name erased to `custom`. */
export type PlaceResolverSetting =
  | { readonly name: "git" }
  | { readonly name: "directories" }
  | {
      readonly name: "custom";
      /** The config's function, awaited, with its result decoded as place strings or a problem. */
      readonly resolvePlaces: (context: PlaceContext) => Promise<Result.Result<ReadonlyArray<string>, string>>;
    };

export interface LoadedTastebudConfig {
  readonly path: string;
  readonly owner: string;
  /** How the owner's captured words are labelled: `ownerName`, else the id after `human:`. */
  readonly ownerName: string;
  readonly resolver: PlaceResolverSetting;
  readonly catalog: TasteCatalog;
  readonly hook: HookSettings;
  readonly review: ReviewSettings;
}

/** Where `tastebud review` serves the UI, and so where every review link points. */
export interface ReviewSettings {
  readonly port: number;
}

const DEFAULT_REVIEW_SETTINGS: ReviewSettings = { port: 4747 };

const NonEmpty = Schema.String.check(Schema.isMinLength(1));
const KindKey = Schema.String.check(
  Schema.isPattern(KIND_KEY_PATTERN, { message: "kind keys match ^[a-z][a-z0-9-]*$" }),
);
const labelFields = { singular: NonEmpty, plural: NonEmpty, description: Schema.optionalKey(Schema.String) };
const PositiveNumber = Schema.Finite.check(Schema.isGreaterThan(0));

/**
 * Only its being a function is checkable before it runs; the declared contract is what the owner
 * wrote against, and `resolvePlaces` decodes each result rather than trusting it.
 */
const isPlaceResolverFunction = (value: unknown): value is PlaceResolverFunction => Predicate.isFunction(value);

const PlaceSettingSchema = Schema.Union([
  Schema.Literals(["git", "directories"]),
  Schema.declare(isPlaceResolverFunction),
]).annotate({ message: `expected "git", "directories" or a function` });

export const TastebudConfigFileSchema = Schema.Struct({
  owner: HumanAccountSchema,
  ownerName: Schema.optionalKey(NonEmpty),
  conversationSourceKind: Schema.optionalKey(KindKey),
  place: Schema.optionalKey(PlaceSettingSchema),
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
  review: Schema.optionalKey(
    Schema.Struct({ port: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 }))) }),
  ),
});
export type TastebudConfigFile = typeof TastebudConfigFileSchema.Type;

const decodePlaceResolverResult = Schema.decodeUnknownResult(Schema.Array(Schema.String));

const resolverSettingOf = (place: TastebudConfigFile["place"]): PlaceResolverSetting => {
  if (place === undefined || place === "git") return { name: "git" };
  if (place === "directories") return { name: "directories" };
  return {
    name: "custom",
    resolvePlaces: async (context) =>
      Result.mapError(
        decodePlaceResolverResult(await place(context)),
        () => "the place function must return an array of strings",
      ),
  };
};

const buildCatalog = (file: TastebudConfigFile): Result.Result<TasteCatalog, ReadonlyArray<string>> => {
  const sourceKinds: ReadonlyArray<SourceKindDefinition> =
    file.sourceKinds === undefined
      ? DEFAULT_SOURCE_KINDS
      : Object.entries(file.sourceKinds).map(([key, labels]) => Object.assign({ key }, labels));
  const derivedKinds: ReadonlyArray<DerivedKindDefinition> =
    file.derivedKinds === undefined
      ? DEFAULT_DERIVED_KINDS
      : Object.entries(file.derivedKinds).map(([key, kind]) => Object.assign({ key }, kind));
  const sourceKeys = new Set(sourceKinds.map((kind) => kind.key));
  // A store with one source kind has nothing to choose between; with several, only the owner can say
  // which one conversation is, so capture without a kind fails until the config names it.
  const conversationSourceKind =
    file.conversationSourceKind ?? (sourceKinds.length === 1 ? sourceKinds[0]?.key : undefined);
  const problems = [
    ...(conversationSourceKind === undefined || sourceKeys.has(conversationSourceKind)
      ? []
      : [`conversationSourceKind: "${conversationSourceKind}" is not a source kind`]),
    ...derivedKinds.flatMap((kind) =>
      kind.sources
        .filter((source) => !sourceKeys.has(source))
        .map((source) => `derivedKinds.${kind.key}.sources: "${source}" is not a source kind`),
    ),
    ...derivedKinds
      .filter((kind) => sourceKeys.has(kind.key))
      .map((kind) => `derivedKinds.${kind.key}: "${kind.key}" is already a source kind`),
  ];
  return problems.length > 0
    ? Result.fail(problems)
    : Result.succeed({
        sourceKinds,
        derivedKinds,
        ...(conversationSourceKind !== undefined && { conversationSourceKind }),
      });
};

/** A decoded config file as the config every operation reads, or each problem naming its field. */
export const loadedTastebudConfigOf = (
  path: string,
  file: TastebudConfigFile,
): Result.Result<LoadedTastebudConfig, ReadonlyArray<string>> => {
  const catalog = buildCatalog(file);
  if (Result.isFailure(catalog)) return Result.fail(catalog.failure);
  return Result.succeed({
    path,
    owner: file.owner,
    ownerName: file.ownerName ?? file.owner.slice("human:".length),
    resolver: resolverSettingOf(file.place),
    catalog: catalog.success,
    hook: { ...DEFAULT_HOOK_SETTINGS, ...file.hook },
    review: { ...DEFAULT_REVIEW_SETTINGS, ...file.review },
  });
};

/** The commented `tastebud.config.ts` for `owner`: what `tastebud init` writes and `config-show` offers a new store. */
export const starterTastebudConfigText = (
  owner: string,
) => `// Tastebud's config for this store. Plain data: no imports needed. Edit freely; it reloads on save.
// A config may import relative files and \`node:\` builtins only; no packages.
export default {
  // The human whose taste this store holds. Only they ratify derivations.
  owner: ${JSON.stringify(owner)},
  // How the owner's captured words are labelled; without it, the id after "human:".
  // ownerName: "Your Name",

  // The source kind for words an agent hears in conversation, so capture needs no kind.
  conversationSourceKind: "memory",

  // How a working directory becomes a place:
  //   "git"          a repo place from the origin remote (github.com/you/app::sub/dir), else the directory
  //   "directories"  always the directory (~/Notes/clients/acme)
  //   a function     ({ cwd, source, env }) => ["clients/acme"]; must be deterministic, [] means unknown
  place: "git",

  // Kinds replace the defaults whole when given. The defaults are one source kind and one derived kind.
  // A source kind's description says whose words and when to save them; agents are told it as written.
  // sourceKinds: {
  //   memory: { singular: "memory", plural: "memories",
  //             description: "My own words to an agent, when I ask it to remember something or state a rule." },
  // },
  // derivedKinds: {
  //   belief: { singular: "belief", plural: "beliefs", sources: ["memory"], recall: "inject",
  //             acceptLabel: "Believe", proposalPrompt: "…" },
  //   idea:   { singular: "idea", plural: "ideas", sources: ["memory"], recall: "never",
  //             acceptLabel: "Worth doing", proposalPrompt: "Propose an idea when …" },
  // },

  // The prompt hook injects at most \`limit\` items and gives up after \`budgetMs\`.
  hook: { limit: 3, budgetMs: 650 },

  // \`tastebud review\` serves the UI on this port, and links from agents point at it.
  review: { port: 4747 },
};
`;
