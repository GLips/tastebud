import type { TasteOperationInput } from "@tastebud/core/operations";

import { readRecallExplanation, readRecallWithHookPayload } from "../repo/recall-inspector.server.ts";

interface RecallInspectionRequest {
  readonly query: string;
  readonly kind?: ReadonlyArray<string>;
  readonly history?: boolean;
  readonly limit?: number;
  readonly in?: string;
  readonly at?: ReadonlyArray<string>;
}

/** Recall and the exact hook payload for the same prompt, standing where the inspector says. */
export const loadRecallInspection = (request: RecallInspectionRequest) => {
  const { in: directory, at, query, ...recallInput } = request;
  const where = { ...(directory !== undefined && { in: directory }), ...(at !== undefined && { at }) };
  return readRecallWithHookPayload({ query, ...recallInput, ...where }, { prompt: query, ...where });
};

/** Why one derivation (by ref, or the closest text matches) would be injected, recalled or excluded there. */
export const loadRecallExplanation = (input: TasteOperationInput<"recall-explain">) => readRecallExplanation(input);
