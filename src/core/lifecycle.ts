/**
 * Status and effective scope, replayed from decisions on every read and never stored. The rules are
 * the same for every kind; a kind's `acceptLabel` changes wording only.
 */
import type { DerivationScope } from "../shared/places.ts";
import type { DecisionOutcome, DerivationStatus } from "../shared/vocabulary.ts";
import { compareIsoTimes } from "./ids.ts";
import { type DecisionRecord, type DerivationRecord, proposedScopeOf, scopeFromFields } from "./records.ts";

export interface DerivationState {
  readonly status: DerivationStatus;
  /** Every decision targeting the derivation, oldest first, including ones that had no effect. */
  readonly decisions: ReadonlyArray<DecisionRecord>;
  /** The decision that produced the current base status (accept, reject or retract). */
  readonly decidingDecision: DecisionRecord | undefined;
  /** The accept that ratified it, kept after a retraction or supersession. */
  readonly acceptingDecision: DecisionRecord | undefined;
  /** The accepting decision's scope override when it has one, otherwise the proposed scope. */
  readonly effectiveScope: DerivationScope;
  /** Ids of accepted derivations whose `supersedes` names this one. */
  readonly supersededBy: ReadonlyArray<string>;
}

/** The scope a derivation governs with: an accept's override, else what was proposed. */
const effectiveScopeOf = (
  derivation: DerivationRecord,
  acceptingDecision: DecisionRecord | undefined,
): DerivationScope =>
  acceptingDecision?.scope === undefined
    ? proposedScopeOf(derivation)
    : scopeFromFields({
        scope: acceptingDecision.scope,
        ...(acceptingDecision.places && { places: acceptingDecision.places }),
      });

type BaseStatus = "pending" | "accepted" | "rejected" | "retracted";

export interface DerivationLookup {
  readonly statusOf: (id: string) => DerivationStatus | undefined;
  readonly kindOf: (id: string) => string | undefined;
}

/**
 * Why a decision is or isn't valid given the statuses at that moment. Shared by the write-time check
 * (under the lock) and the replay below, so a file that slipped past the lock (hand-written, or a
 * race on another machine) has no effect instead of corrupting status.
 */
export const decisionInvalidReason = (
  outcome: DecisionOutcome,
  derivation: DerivationRecord,
  lookup: DerivationLookup,
): string | undefined => {
  const status = lookup.statusOf(derivation.id);
  if (outcome === "retract")
    return status === "accepted" ? undefined : `only an accepted ${derivation.kind} can be retracted (it is ${status})`;
  if (status !== "pending") return `only a pending ${derivation.kind} can be decided (it is ${status})`;
  if (outcome === "accept" && derivation.supersedes !== undefined) {
    if (lookup.kindOf(derivation.supersedes) !== derivation.kind)
      return `it supersedes ${derivation.supersedes}, which is not a ${derivation.kind}`;
    const replaced = lookup.statusOf(derivation.supersedes);
    if (replaced !== "accepted") return `it supersedes ${derivation.supersedes}, which is ${replaced}, not accepted`;
  }
  return undefined;
};

const sortDecisions = (decisions: ReadonlyArray<DecisionRecord>): Array<DecisionRecord> =>
  [...decisions].sort((left, right) => compareIsoTimes(left.at, right.at) || left.id.localeCompare(right.id));

const BASE_STATUS_BY_OUTCOME: Record<DecisionOutcome, BaseStatus> = {
  accept: "accepted",
  reject: "rejected",
  retract: "retracted",
};

/** Replays every decision in time order. Decisions on missing targets are ignored. */
export const deriveDerivationStates = (
  derivations: ReadonlyArray<DerivationRecord>,
  decisions: ReadonlyArray<DecisionRecord>,
): Map<string, DerivationState> => {
  const byId = new Map(derivations.map((derivation) => [derivation.id, derivation]));
  const base = new Map<string, BaseStatus>(derivations.map((derivation) => [derivation.id, "pending"]));
  const deciding = new Map<string, DecisionRecord>();
  const accepting = new Map<string, DecisionRecord>();
  const history = new Map<string, Array<DecisionRecord>>();
  const supersedersById = new Map<string, Array<DerivationRecord>>();
  for (const derivation of derivations) {
    if (derivation.supersedes === undefined) continue;
    supersedersById.set(derivation.supersedes, [...(supersedersById.get(derivation.supersedes) ?? []), derivation]);
  }

  const acceptedSupersedersOf = (id: string) =>
    (supersedersById.get(id) ?? [])
      .filter((derivation) => base.get(derivation.id) === "accepted")
      .map((derivation) => derivation.id);
  const lookup: DerivationLookup = {
    statusOf: (id) => {
      const status = base.get(id);
      return status === "accepted" && acceptedSupersedersOf(id).length > 0 ? "superseded" : status;
    },
    kindOf: (id) => byId.get(id)?.kind,
  };

  for (const decision of sortDecisions(decisions)) {
    const derivation = byId.get(decision.target);
    if (derivation === undefined) continue;
    history.set(derivation.id, [...(history.get(derivation.id) ?? []), decision]);
    if (decisionInvalidReason(decision.outcome, derivation, lookup) !== undefined) continue;
    base.set(derivation.id, BASE_STATUS_BY_OUTCOME[decision.outcome]);
    deciding.set(derivation.id, decision);
    if (decision.outcome === "accept") accepting.set(derivation.id, decision);
  }

  return new Map(
    derivations.map((derivation) => [
      derivation.id,
      {
        status: lookup.statusOf(derivation.id) ?? "pending",
        decisions: history.get(derivation.id) ?? [],
        decidingDecision: deciding.get(derivation.id),
        acceptingDecision: accepting.get(derivation.id),
        effectiveScope: effectiveScopeOf(derivation, accepting.get(derivation.id)),
        supersededBy: acceptedSupersedersOf(derivation.id),
      },
    ]),
  );
};
