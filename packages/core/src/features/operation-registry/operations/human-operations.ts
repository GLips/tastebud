/** The owner's operations: only the review server and the seed may run them. */
import { Effect, Schema } from "effect";

import { DerivationScopeSchema } from "#core/domains/places/index.ts";
import { DerivationSummarySchema, DerivationViewSchema, RepeatMatchSchema } from "#core/domains/record-views/index.ts";
import { DecisionRecordSchema, ThreadEntryRecordSchema } from "#core/domains/records/index.ts";
import {
  decideDerivation,
  DecideDerivationInput,
  PreviewAcceptanceInput,
  previewDerivationAcceptance,
  renderAcceptancePreviewText,
  renderDecideText,
} from "#core/features/decisions/index.server.ts";
import { InboxResultSchema, listInboxGroups, renderInboxText } from "#core/features/inbox/index.server.ts";
import {
  ProposalResultSchema,
  renderProposeText,
  reviseDerivationScope,
  ReviseScopeInput,
} from "#core/features/proposals/index.server.ts";
import {
  appendOwnerThreadNote,
  ListenerHeartbeatSchema,
  listListenerHeartbeats,
  renderListenersText,
  renderThreadEntryText,
  ThreadEntryInput,
} from "#core/features/review-threads/index.server.ts";

import { declareTasteOperation, NoInput } from "./taste-operation-declaration.ts";

export const HUMAN_TASTE_OPERATIONS = {
  inbox: declareTasteOperation({
    name: "inbox",
    audience: "human",
    kind: "query",
    description: "Pending derivations grouped by kind, then scope, then subject.",
    input: NoInput,
    output: InboxResultSchema,
    run: () => listInboxGroups(),
    renderText: renderInboxText,
  }),
  "accept-preview": declareTasteOperation({
    name: "accept-preview",
    audience: "human",
    kind: "query",
    description: "What accepting with a scope would settle on, and the near repeats it must acknowledge.",
    input: PreviewAcceptanceInput,
    output: Schema.Struct({
      derivation: DerivationSummarySchema,
      effectiveScope: DerivationScopeSchema,
      needsAcknowledgement: Schema.Array(RepeatMatchSchema),
    }),
    run: (input) => previewDerivationAcceptance(input),
    renderText: renderAcceptancePreviewText,
  }),
  decide: declareTasteOperation({
    name: "decide",
    audience: "human",
    kind: "command",
    description: "Accept (optionally with a scope and acknowledgements), reject or retract a derivation.",
    input: DecideDerivationInput,
    output: Schema.Struct({ decision: DecisionRecordSchema, derivation: DerivationViewSchema }),
    run: (input, caller) => decideDerivation(input, { writtenBy: caller.actor }),
    renderText: renderDecideText,
  }),
  "thread-note": declareTasteOperation({
    name: "thread-note",
    audience: "human",
    kind: "command",
    description: "The owner's comment on a derivation's thread. Wakes listening agents.",
    input: ThreadEntryInput,
    output: Schema.Struct({ entry: ThreadEntryRecordSchema }),
    run: (input) => appendOwnerThreadNote(input),
    renderText: renderThreadEntryText,
  }),
  "revise-scope": declareTasteOperation({
    name: "revise-scope",
    audience: "human",
    kind: "command",
    description:
      "The owner's new scope for an accepted derivation: a pending revision with the same statement and evidence, proposed by the owner.",
    input: ReviseScopeInput,
    output: ProposalResultSchema,
    run: (input) => reviseDerivationScope(input),
    renderText: renderProposeText,
  }),
  listeners: declareTasteOperation({
    name: "listeners",
    audience: "human",
    kind: "query",
    description: "Every agent that has listened on review threads, and whether it is listening now.",
    input: NoInput,
    output: Schema.Struct({ listeners: Schema.Array(ListenerHeartbeatSchema) }),
    run: () => Effect.map(listListenerHeartbeats, (listeners) => ({ listeners })),
    renderText: renderListenersText,
  }),
} as const;
