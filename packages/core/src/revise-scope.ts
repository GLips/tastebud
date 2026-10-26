/**
 * `revise-scope`: the owner changes where an accepted derivation applies. Records are append-only and
 * scope is part of what the owner ratifies, so this proposes a pending revision (same statement and
 * evidence, the new scope) under propose's rules, and the owner's accept settles it as usual.
 */
import { Effect, Schema } from "effect";

import { requireDerivedKind } from "./catalog.ts";
import { appendDerivationProposal, resolveDespiteRefs } from "./propose.ts";
import { readChosenScope, ScopeChoiceSchema } from "./scope-input.ts";
import { OptionalTrimmedText, OptionalTrimmedTextList, TrimmedText } from "./shared/input-text.ts";
import { resolveDerivationRef, resolveEvidenceRef, TasteStore } from "./store.ts";
import type { ViewSource } from "./views.ts";

/**
 * Records are proposed by agents or processes, never `human:` (records.ts ActorSchema): the owner
 * ratifies, and only decisions carry their name. So the owner's revision is proposed as this process.
 */
const REVISE_SCOPE_ACTOR = "process:review";

export const ReviseScopeInput = Schema.Struct({
  ref: TrimmedText.annotate({ description: "The accepted derivation whose scope to revise" }),
  scope: ScopeChoiceSchema.annotate({ description: "The revision's scope" }),
  places: OptionalTrimmedTextList.annotate({ description: "The places, when scope is places" }),
  despite: OptionalTrimmedTextList.annotate({ description: "Every blocking near repeat under the new scope" }),
  despite_case: OptionalTrimmedText.annotate({ description: "What changed since those matches" }),
});
export type ReviseScopeInput = typeof ReviseScopeInput.Type;

export const reviseDerivationScope = Effect.fn("taste.reviseDerivationScope")(function* (input: ReviseScopeInput) {
  const store = yield* TasteStore;
  const { config } = store;
  const snapshot = yield* store.snapshot;
  const view: ViewSource = { snapshot, catalog: config.catalog };
  const target = yield* resolveDerivationRef(snapshot, input.ref);
  const kind = yield* requireDerivedKind(config.catalog, target.kind);
  const evidenceOf = (ids: ReadonlyArray<string>) => Effect.forEach(ids, (id) => resolveEvidenceRef(snapshot, id));
  return yield* appendDerivationProposal(
    view,
    kind,
    {
      statement: target.statement,
      scope: yield* readChosenScope(input.scope, input.places),
      supports: yield* evidenceOf(target.supports),
      contradicts: yield* evidenceOf(target.contradicts ?? []),
      supersedes: target,
      despite: yield* resolveDespiteRefs(snapshot, input.despite, input.despite_case),
    },
    {
      scopeSource: "explicit",
      subject: target.subject,
      proposedBy: REVISE_SCOPE_ACTOR,
      reasoning: "The owner revised the scope; the statement and evidence are unchanged.",
      despiteCase: input.despite_case,
    },
  );
});
