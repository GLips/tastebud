import { Data } from "effect";

import type { RepeatMatch } from "#core/domains/record-views/index.ts";
import { formatRepeatMatchLines } from "#core/domains/repeat-detection/index.ts";
import { type DecisionOutcome, type DerivationStatus, shortIdOf } from "#core/domains/taste-vocabulary/index.ts";

/** A derivation as people read it: the statement first, the short id after for the CLI. */
const nameDerivation = (target: string, statement: string): string => `“${statement}” (${shortIdOf(target)})`;

/** An accept whose effective scope overlaps blocking matches that neither `despite` nor `acknowledges` names. */
export class WideningNeedsAcknowledgement extends Data.TaggedError("WideningNeedsAcknowledgement")<{
  readonly target: string;
  readonly statement: string;
  readonly matches: ReadonlyArray<RepeatMatch>;
}> {
  override get message() {
    return [
      `Accepting ${nameDerivation(this.target, this.statement)} with this scope overlaps near repeats it hasn't acknowledged:`,
      ...formatRepeatMatchLines(this.matches),
      "Acknowledge them to accept anyway.",
    ].join("\n");
  }
}

/** The decision is not valid for the derivation's current state (usually someone decided first). */
export class DecisionNotAllowed extends Data.TaggedError("DecisionNotAllowed")<{
  readonly target: string;
  readonly statement: string;
  readonly outcome: DecisionOutcome;
  readonly status: DerivationStatus;
  readonly problem: string;
}> {
  override get message() {
    return `Cannot ${this.outcome} ${nameDerivation(this.target, this.statement)}: ${this.problem}.`;
  }
}
