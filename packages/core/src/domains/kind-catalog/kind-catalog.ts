/**
 * The catalog: the kinds in effect once the config has loaded. Defaults ship here; a config's
 * `sourceKinds` or `derivedKinds` map replaces the matching default map whole. Records whose kind is
 * missing from the catalog are retired: list and show only.
 */
import { Effect } from "effect";

import type { PlaceResolverName, RecallPolicy } from "#core/domains/taste-vocabulary/index.ts";

import type { CatalogView, HookSettings } from "./catalog-view.ts";
import { KindNotRecallable, RetiredKind, UnknownKind } from "./errors.ts";
import { BELIEF_PROPOSAL_PROMPT } from "./kind-prompts.ts";

export interface SourceKindDefinition {
  readonly key: string;
  readonly singular: string;
  readonly plural: string;
  readonly description?: string;
}

export interface DerivedKindDefinition extends SourceKindDefinition {
  /** Source kinds a derivation of this kind may cite; it must cite at least one such source. */
  readonly sources: ReadonlyArray<string>;
  readonly proposalPrompt: string;
  readonly recall: RecallPolicy;
  /** Wording on the accept button only; the decision is always `accept`. */
  readonly acceptLabel: string;
}

export interface TasteCatalog {
  readonly sourceKinds: ReadonlyArray<SourceKindDefinition>;
  readonly derivedKinds: ReadonlyArray<DerivedKindDefinition>;
}

/** The kind key whose derivations default their subject to the owner. */
export const BUILT_IN_BELIEF_KIND = "belief";

export const DEFAULT_SOURCE_KINDS: ReadonlyArray<SourceKindDefinition> = [
  {
    key: "memory",
    singular: "memory",
    plural: "memories",
    description: "A person's exact words, verbatim and attributed.",
  },
];

export const DEFAULT_DERIVED_KINDS: ReadonlyArray<DerivedKindDefinition> = [
  {
    key: BUILT_IN_BELIEF_KIND,
    singular: "belief",
    plural: "beliefs",
    description: "How the owner works or what is true about their world, ratified by them.",
    sources: ["memory"],
    recall: "inject",
    acceptLabel: "Believe",
    proposalPrompt: BELIEF_PROPOSAL_PROMPT,
  },
];

export const DEFAULT_HOOK_SETTINGS: HookSettings = { limit: 3, budgetMs: 650 };

export const findSourceKind = (catalog: TasteCatalog, key: string): SourceKindDefinition | undefined =>
  catalog.sourceKinds.find((kind) => kind.key === key);

export const findDerivedKind = (catalog: TasteCatalog, key: string): DerivedKindDefinition | undefined =>
  catalog.derivedKinds.find((kind) => kind.key === key);

/** A source kind named by a caller, for capture. */
export const requireSourceKind = (
  catalog: TasteCatalog,
  key: string,
): Effect.Effect<SourceKindDefinition, UnknownKind> => {
  const kind = findSourceKind(catalog, key);
  return kind === undefined
    ? Effect.fail(
        new UnknownKind({ kind: key, family: "source", known: catalog.sourceKinds.map((known) => known.key) }),
      )
    : Effect.succeed(kind);
};

/** A derived kind named by a caller, for propose, recall, context and list filters. */
export const requireDerivedKind = (
  catalog: TasteCatalog,
  key: string,
): Effect.Effect<DerivedKindDefinition, UnknownKind> => {
  const kind = findDerivedKind(catalog, key);
  return kind === undefined
    ? Effect.fail(
        new UnknownKind({ kind: key, family: "derived", known: catalog.derivedKinds.map((known) => known.key) }),
      )
    : Effect.succeed(kind);
};

/** The derived kind of an existing record; its absence means the record is retired. */
export const requireLiveDerivedKind = (
  catalog: TasteCatalog,
  record: { readonly id: string; readonly kind: string },
): Effect.Effect<DerivedKindDefinition, RetiredKind> => {
  const kind = findDerivedKind(catalog, record.kind);
  return kind === undefined
    ? Effect.fail(new RetiredKind({ kind: record.kind, recordId: record.id }))
    : Effect.succeed(kind);
};

/**
 * The kinds recall-style reads cover. Named kinds must exist and not be `never`; with none named,
 * `defaultPolicies` picks them (`inject` for context and the hook, `inject` and `pull` for recall).
 */
export const selectRecallKinds = (
  catalog: TasteCatalog,
  named: ReadonlyArray<string> | undefined,
  defaultPolicies: ReadonlyArray<RecallPolicy>,
): Effect.Effect<ReadonlyArray<DerivedKindDefinition>, UnknownKind | KindNotRecallable> => {
  if (named === undefined || named.length === 0)
    return Effect.succeed(catalog.derivedKinds.filter((kind) => defaultPolicies.includes(kind.recall)));
  return Effect.forEach([...new Set(named)], (key) =>
    requireDerivedKind(catalog, key).pipe(
      Effect.filterOrFail(
        (kind) => kind.recall !== "never",
        () => new KindNotRecallable({ kind: key }),
      ),
    ),
  );
};

/** Plain data for the browser and agents: no resolver function, only its name. */
export const buildCatalogView = (input: {
  readonly owner: string;
  readonly resolver: PlaceResolverName;
  readonly catalog: TasteCatalog;
  readonly hook: HookSettings;
}): CatalogView => ({
  owner: input.owner,
  resolver: input.resolver,
  sourceKinds: input.catalog.sourceKinds.map((kind) => ({ ...kind })),
  derivedKinds: input.catalog.derivedKinds.map((kind) => ({ ...kind, sources: [...kind.sources] })),
  hook: input.hook,
});
