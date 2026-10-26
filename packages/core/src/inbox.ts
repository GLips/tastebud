/**
 * `inbox`: pending derivations grouped by kind, then scope, then subject, oldest first. Retired kinds
 * are left out, since they can't be accepted. Each card carries the near repeats an accept would
 * have to acknowledge under its proposed scope.
 */
import { Effect, Schema } from "effect";

import { proposedScopeOf } from "./records.ts";
import { findRepeatMatches, supersessionLineageOf } from "./repeat-check.ts";
import { DerivationScopeSchema, scopeGroupKey } from "./shared/places.ts";
import { derivationStateOf, TasteStore } from "./store.ts";
import { DerivationViewSchema, RepeatMatchSchema } from "./view-schemas.ts";
import { buildDerivationView, type ViewSource } from "./views.ts";

const InboxCardSchema = Schema.Struct({
  derivation: DerivationViewSchema,
  /** Blocking under the proposed scope and not named by `despite`: the accept preview must show these. */
  needsAcknowledgement: Schema.Array(RepeatMatchSchema),
  /** Other near or related derivations of the kind (any status), for the reviewer's context. */
  related: Schema.Array(RepeatMatchSchema),
});
export type InboxCard = typeof InboxCardSchema.Type;

const InboxGroupSchema = Schema.Struct({
  kind: Schema.String,
  kindLabel: Schema.String,
  kindPlural: Schema.String,
  acceptLabel: Schema.String,
  scope: DerivationScopeSchema,
  /** Order-independent scope identity; batch accept stays within one kind and one scope key. */
  scopeKey: Schema.String,
  subject: Schema.optionalKey(Schema.String),
  cards: Schema.Array(InboxCardSchema),
});
export type InboxGroup = typeof InboxGroupSchema.Type;

export const InboxResultSchema = Schema.Struct({ groups: Schema.Array(InboxGroupSchema) });
export type InboxResult = typeof InboxResultSchema.Type;

/** Pending derivations per live kind, every kind present (zero included). What the review header counts. */
export const countPendingByKind = (view: ViewSource): Record<string, number> => {
  const counts: Record<string, number> = Object.fromEntries(view.catalog.derivedKinds.map((kind) => [kind.key, 0]));
  for (const derivation of view.snapshot.derivations) {
    const count = counts[derivation.kind];
    if (count !== undefined && derivationStateOf(view.snapshot, derivation).status === "pending")
      counts[derivation.kind] = count + 1;
  }
  return counts;
};

export const listInboxGroups = Effect.fn("taste.listInboxGroups")(function* () {
  const store = yield* TasteStore;
  const snapshot = yield* store.snapshot;
  const { catalog } = store.config;
  const view: ViewSource = { snapshot, catalog };
  const groups: Array<InboxGroup> = [];
  for (const kind of catalog.derivedKinds) {
    const byKey = new Map<string, { group: InboxGroup; cards: Array<InboxCard> }>();
    const pending = snapshot.derivations
      .filter(
        (derivation) => derivation.kind === kind.key && derivationStateOf(snapshot, derivation).status === "pending",
      )
      .sort((left, right) => left.proposed_at.localeCompare(right.proposed_at) || left.id.localeCompare(right.id));
    for (const derivation of pending) {
      const scope = proposedScopeOf(derivation);
      const scopeKey = scopeGroupKey(scope);
      const key = JSON.stringify([scopeKey, derivation.subject ?? null]);
      const repeat = findRepeatMatches(view, {
        kind: kind.key,
        statement: derivation.statement,
        scope,
        excludeIds: [derivation.id, ...supersessionLineageOf(view.snapshot, derivation.supersedes)],
      });
      const despite = new Set(derivation.despite ?? []);
      const card: InboxCard = {
        derivation: buildDerivationView(view, derivation),
        needsAcknowledgement: repeat.blocking.filter((match) => !despite.has(match.id)),
        related: [...repeat.blocking.filter((match) => despite.has(match.id)), ...repeat.related],
      };
      const existing = byKey.get(key);
      if (existing !== undefined) existing.cards.push(card);
      else
        byKey.set(key, {
          group: {
            kind: kind.key,
            kindLabel: kind.singular,
            kindPlural: kind.plural,
            acceptLabel: kind.acceptLabel,
            scope,
            scopeKey,
            ...(derivation.subject !== undefined && { subject: derivation.subject }),
            cards: [],
          },
          cards: [card],
        });
    }
    for (const { group, cards } of byKey.values()) groups.push({ ...group, cards });
  }
  const result: InboxResult = { groups };
  return result;
});
