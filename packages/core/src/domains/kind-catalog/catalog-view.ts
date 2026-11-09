/**
 * The catalog as plain data, for the browser and for agents. A config's `place` may be a function,
 * which can't cross into the browser, so the view names the resolver instead.
 */
import { Schema } from "effect";

import { PLACE_RESOLVER_NAMES, RecallPolicySchema } from "#core/domains/taste-vocabulary/index.ts";

const SourceKindViewSchema = Schema.Struct({
  key: Schema.String,
  singular: Schema.String,
  plural: Schema.String,
  description: Schema.optionalKey(Schema.String),
});
export type SourceKindView = typeof SourceKindViewSchema.Type;

const DerivedKindViewSchema = Schema.Struct({
  ...SourceKindViewSchema.fields,
  sources: Schema.Array(Schema.String),
  recall: RecallPolicySchema,
  acceptLabel: Schema.String,
  proposalPrompt: Schema.String,
});
export type DerivedKindView = typeof DerivedKindViewSchema.Type;

const HookSettingsSchema = Schema.Struct({ limit: Schema.Finite, budgetMs: Schema.Finite });
export type HookSettings = typeof HookSettingsSchema.Type;

export const CatalogViewSchema = Schema.Struct({
  owner: Schema.String,
  /** What to call the owner on screen ("Dana"): `ownerName` from the config, else the id after `human:`. */
  ownerName: Schema.String,
  resolver: Schema.Literals(PLACE_RESOLVER_NAMES),
  sourceKinds: Schema.Array(SourceKindViewSchema),
  derivedKinds: Schema.Array(DerivedKindViewSchema),
  conversationSourceKind: Schema.optionalKey(Schema.String),
  hook: HookSettingsSchema,
});
export type CatalogView = typeof CatalogViewSchema.Type;
