/**
 * A derivation's history as events, oldest first: its proposal, every decision and every thread note,
 * interleaved by time. Every record stays on file; only the reading groups a decision and the records
 * that undid it straight after into one event.
 */
import { type DerivationScope, isSameScope } from "@tastebud/core/places";
import type { DerivationView } from "@tastebud/core/record-views";
import { type DecisionRecord, scopeFromFields } from "@tastebud/core/records";

export type DerivationHistoryEvent =
  | { readonly type: "proposed"; readonly id: string; readonly by: string; readonly at: string }
  | DecisionHistoryEvent
  | { readonly type: "note"; readonly id: string; readonly by: string; readonly at: string; readonly text: string };

interface DecisionHistoryEvent {
  readonly type: "decision";
  readonly id: string;
  readonly outcome: DecisionRecord["outcome"];
  /** What happened, after the actor's name: "rejected it", "changed the reason". */
  readonly action: string;
  /** Undone straight after, so it changed nothing: one muted line. */
  readonly undone: boolean;
  /** A rejection that only replaced the reason: the state, and when it was set, stay as they were. */
  readonly reasonEdit: boolean;
  readonly by: string;
  readonly at: string;
  readonly reason: string | undefined;
  /** An accept that set a different scope from the one before it. */
  readonly scopeChange: { readonly from: DerivationScope; readonly to: DerivationScope } | undefined;
  /** The ids of the near repeats an accept weighed. */
  readonly weighed: ReadonlyArray<string>;
}

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

/** Undo takes back the decision just made, so only records this close together read as one undone act. */
const UNDO_WINDOW_MS = 10 * 60 * 1000;

/**
 * How many decisions after this one restore exactly where it stood before it, the way Undo writes
 * them: a put-back to the inbox, the same accept, the same reject, or an accept then a retract. Zero
 * when they don't, or came too late to be an undo.
 */
const undoLengthAfter = (decisions: ReadonlyArray<DecisionRecord>, index: number): number => {
  const entry = decisions[index];
  const before = decisions[index - 1];
  const [first, second] = decisions.slice(index + 1);
  if (entry === undefined || first === undefined) return 0;
  if (Date.parse(first.at) - Date.parse(entry.at) > UNDO_WINDOW_MS) return 0;
  if (before === undefined || before.outcome === "reopen") return first.outcome === "reopen" ? 1 : 0;
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
): Array<DecisionHistoryEvent> => {
  const events: Array<DecisionHistoryEvent> = [];
  // Where it applied before each accept: the proposed scope until an accept set one.
  let applied = proposed;
  for (let index = 0; index < decisions.length; index += 1) {
    const entry = decisions[index];
    if (entry === undefined) continue;
    const previous = decisions[index - 1];
    const to = entry.outcome === "accept" ? acceptedScopeOf(entry, proposed) : applied;
    const moved = !isSameScope(applied, to);
    const action = decisionActionOf(entry, previous, moved);
    const undone = undoLengthAfter(decisions, index);
    if (undone > 0) {
      const last = decisions[index + undone] ?? entry;
      events.push({
        type: "decision",
        id: last.id,
        outcome: entry.outcome,
        action: `${action}, then undid that`,
        undone: true,
        reasonEdit: false,
        by: last.by,
        at: last.at,
        reason: undefined,
        scopeChange: undefined,
        weighed: [],
      });
      index += undone;
      continue;
    }
    events.push({
      type: "decision",
      id: entry.id,
      outcome: entry.outcome,
      action,
      undone: false,
      reasonEdit: entry.outcome === "reject" && previous?.outcome === "reject",
      by: entry.by,
      at: entry.at,
      reason: entry.reason,
      scopeChange: moved ? { from: applied, to } : undefined,
      weighed: entry.acknowledges ?? [],
    });
    applied = to;
  }
  return events;
};

/**
 * The decision that put it in its current state: the last one neither undone nor a reason edit.
 * Nothing while it waits for a first decision, or since it was put back in the inbox.
 */
export const stateSettingDecisionOf = (
  view: Pick<DerivationView, "decisions" | "proposedScope">,
): DecisionHistoryEvent | undefined => {
  const setter = decisionEventsOf(view.decisions, view.proposedScope).findLast(
    (event) => !event.undone && !event.reasonEdit,
  );
  return setter?.outcome === "reopen" ? undefined : setter;
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
