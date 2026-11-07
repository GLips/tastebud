/** The text `catch-up` and `catch-up-done` print. */
import type { CatchUpRecord } from "#core/domains/records/index.ts";

import type { CatchUpStatusResult } from "./catch-up-status.ts";

const originLines = (origin: CatchUpStatusResult["origins"][number]) => {
  const read =
    origin.read_through === undefined
      ? "never read by a catch-up"
      : `read through ${origin.read_through}${origin.last_run_in.length > 0 ? ` (from ${origin.last_run_in.join(", ")})` : ""}`;
  const lines = [`${origin.kind}: ${read}`, ...(origin.description === undefined ? [] : [`  ${origin.description}`])];
  const { sessions } = origin;
  if (sessions === undefined) return [...lines, "  Read it with your own tools if you can reach it from here."];
  return [
    ...lines,
    `  Claude Code sessions: ${String(sessions.messages)} of the owner's messages waiting, about ${String(sessions.tokens)} tokens.`,
    ...(sessions.gap_before === undefined
      ? []
      : [`  Words before ${sessions.gap_before} were never read and are past the look-back.`]),
    sessions.batches.length === 1
      ? "  1 batch, for one Sonnet subagent that reads every session together (don't read it yourself):"
      : `  ${String(sessions.batches.length)} batches, one Sonnet subagent each (don't read them yourself):`,
    ...sessions.batches.map(
      (batch, index) =>
        `    ${String(index + 1)}. ${batch.command}  (${String(batch.messages)} messages, ~${String(batch.tokens)} tokens)`,
    ),
    `  Then record: --origin ${origin.kind} --read-through ${sessions.read_until}`,
    ...(sessions.unplaced > 0
      ? [`  ${String(sessions.unplaced)} sent from directories that no longer resolve to a place are passed over.`]
      : []),
    ...(sessions.left_for_next > 0
      ? [`  ${String(sessions.left_for_next)} more past the budget wait for the next catch-up.`]
      : []),
  ];
};

export const renderCatchUpStatusText = (result: CatchUpStatusResult) =>
  [
    `${result.first ? "First catch-up" : "Catch-up"} at ${result.now}${result.run_in.length > 0 ? ` in ${result.run_in.join(", ")}` : ""}. Budget: subagents read up to about ${String(result.budget.subagent_tokens)} tokens in batches of ~${String(result.budget.batch_tokens)}; at most ${String(result.budget.proposals)} proposals.`,
    "",
    "Origins:",
    ...result.origins.flatMap(originLines),
    "",
    "Sources due, by kind:",
    ...result.kinds.map(
      (kind) =>
        `${kind.kind} (${kind.policy}): ${String(kind.due)} due${kind.due_ids.length > 0 ? ` - ${kind.due_ids.join(" ")}` : ""}`,
    ),
  ].join("\n");

export const renderRecordCatchUpText = (result: {
  readonly catch_up: CatchUpRecord;
  readonly already_recorded: boolean;
}) => {
  const { catch_up: catchUp } = result;
  return [
    `${result.already_recorded ? "Already recorded" : "Recorded"} catch-up ${catchUp.id}`,
    ...(catchUp.origin === undefined ? [] : [`  ${catchUp.origin} read through ${catchUp.read_through ?? ""}`]),
    ...(catchUp.considered === undefined
      ? []
      : [`  ${String(catchUp.considered.length)} sources weighed for ${(catchUp.considered_for ?? []).join(", ")}`]),
  ].join("\n");
};
