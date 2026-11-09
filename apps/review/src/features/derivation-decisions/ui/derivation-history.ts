/**
 * A derivation's history as events, oldest first: its proposal, every decision and every thread note,
 * interleaved by time. Every record stays on file; only the reading groups a put-back and the decisions
 * that undid it into one event.
 */
import { type DerivationScope, isSameScope } from "@tastebud/core/places";
import type { DerivationView } from "@tastebud/core/record-views";
import { type DecisionRecord, scopeFromFields } from "@tastebud/core/records";

export type DerivationHistoryEvent =
  | { readonly type: "proposed"; readonly id: string; readonly by: string; readonly at: string }
  | {
      readonly type: "decision";
      readonly id: string;
      /** The outcome that colours it; a put-back that was undone reads as a reopen. */
      readonly outcome: DecisionRecord["outcome"];
      /** What happened, after the actor's name: "rejected it", "changed the reason". */
      readonly action: string;
      readonly by: string;
      readonly at: string;
      readonly reason: string | undefined;
      /** An accept that set a different scope from the one before it. */
      readonly scopeChange: { readonly from: DerivationScope; readonly to: DerivationScope } | undefined;
      /** How many near repeats an accept weighed. */
      readonly weighed: number;
    }
  | { readonly type: "note"; readonly id: string; readonly by: string; readonly at: string; readonly text: string };

/** One decision in words, read against the decision before it. */
const decisionActionOf = (entry: DecisionRecord, previous: DecisionRecord | undefined, moved: boolean): string => {
  if (entry.outcome === "reject") return previous?.outcome === "reject" ? "changed the reason" : "rejected it";
  if (entry.outcome === "retract") return "retracted it";
  if (entry.outcome === "reopen") return "put it back in the inbox";
  switch (previous?.outcome) {
    case "accept":
      return moved ? "moved it to a new scope" : "accepted it again";
    case "reject":
      return "accepted it after all";
    case "retract":
      return "accepted it again";
    default:
      return "accepted it";
  }
};

const sameScopeFields = (left: DecisionRecord, right: DecisionRecord): boolean =>
  left.scope === right.scope && (left.places ?? []).join("\n") === (right.places ?? []).join("\n");

/**
 * How many decisions after a put-back restore exactly where it stood before it, the way Undo writes
 * them: the same accept, the same reject, or an accept then a retract. Zero when they don't.
 */
const undoLengthAfterReopen = (decisions: ReadonlyArray<DecisionRecord>, reopenIndex: number): number => {
  const before = decisions[reopenIndex - 1];
  const [first, second] = decisions.slice(reopenIndex + 1);
  if (before === undefined || first === undefined) return 0;
  if (before.outcome === "accept") return first.outcome === "accept" && sameScopeFields(before, first) ? 1 : 0;
  if (before.outcome === "reject") return first.outcome === "reject" && first.reason === before.reason ? 1 : 0;
  if (before.outcome === "retract") return first.outcome === "accept" && second?.outcome === "retract" ? 2 : 0;
  return 0;
};

/** An accept with no scope fields accepted as proposed. */
const acceptedScopeOf = (entry: DecisionRecord, proposed: DerivationScope): DerivationScope =>
  entry.scope === undefined
    ? proposed
    : scopeFromFields({ scope: entry.scope, ...(entry.places && { places: entry.places }) });

const decisionEventsOf = (
  decisions: ReadonlyArray<DecisionRecord>,
  proposed: DerivationScope,
): Array<DerivationHistoryEvent> => {
  const events: Array<DerivationHistoryEvent> = [];
  // Where it applied before each accept: the proposed scope until an accept set one.
  let applied = proposed;
  for (let index = 0; index < decisions.length; index += 1) {
    const entry = decisions[index];
    if (entry === undefined) continue;
    const undone = entry.outcome === "reopen" ? undoLengthAfterReopen(decisions, index) : 0;
    const last = decisions[index + undone] ?? entry;
    if (undone > 0) {
      events.push({
        type: "decision",
        id: last.id,
        outcome: "reopen",
        action: "put it back in the inbox, then undid that",
        by: last.by,
        at: last.at,
        reason: undefined,
        scopeChange: undefined,
        weighed: 0,
      });
      index += undone;
      continue;
    }
    const to = entry.outcome === "accept" ? acceptedScopeOf(entry, proposed) : applied;
    const moved = !isSameScope(applied, to);
    events.push({
      type: "decision",
      id: entry.id,
      outcome: entry.outcome,
      action: decisionActionOf(entry, decisions[index - 1], moved),
      by: entry.by,
      at: entry.at,
      reason: entry.reason,
      scopeChange: moved ? { from: applied, to } : undefined,
      weighed: entry.acknowledges?.length ?? 0,
    });
    applied = to;
  }
  return events;
};

export const derivationHistoryOf = (
  view: Pick<DerivationView, "decisions" | "thread" | "proposedScope" | "proposedAt" | "derivation">,
): Array<DerivationHistoryEvent> => {
  const notes = view.thread.map((entry): DerivationHistoryEvent => ({
    type: "note",
    id: entry.id,
    by: entry.author,
    at: entry.at,
    text: entry.text,
  }));
  const later = [...decisionEventsOf(view.decisions, view.proposedScope), ...notes].toSorted(
    (left, right) => Date.parse(left.at) - Date.parse(right.at),
  );
  return [{ type: "proposed", id: view.derivation.id, by: view.derivation.proposed_by, at: view.proposedAt }, ...later];
};
