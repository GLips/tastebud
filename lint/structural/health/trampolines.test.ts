// The extractor's arrow form, read against files shaped like review's
// `features/*/service/*.ts`: exported arrows forwarding to a repo call. The
// fixture tree has no service written this way, so without these cases the
// check could go silent on every review service and the suite stay green.

import assert from "node:assert/strict";
import { test } from "node:test";

import { blankComments, stripCommentsAndStrings } from "../check-context.ts";
import { findForwardingFunctions } from "./trampolines.ts";

function forwardingNames(source: string): string[] {
  const scrubbed = blankComments(source).split("\n").map(stripCommentsAndStrings).join("\n");
  return findForwardingFunctions(scrubbed).map(({ name, line }) => `${name}:${line}`);
}

void test("exported arrows that only forward to the repo are each found, on their own line", () => {
  const service = `import type { TasteOperationInput } from "@taste/core/operations";

import { readInboxGroups, writeDecision } from "../repo/derivation-decisions.server.ts";

/** Pending derivations grouped by kind. */
export const loadInboxGroups = () => readInboxGroups();

/** Accept, reject or retract. */
export const recordOwnerDecision = (input: TasteOperationInput<"decide">) => writeDecision(input);

export const loadRepointPreview = async (
  input: TasteOperationInput<"repoint-preview">,
): Promise<RepointPreview> => {
  return readRepointPreview(input);
};
`;
  assert.deepEqual(forwardingNames(service), ["loadInboxGroups:6", "recordOwnerDecision:9", "loadRepointPreview:11"]);
});

void test("arrows that branch or bind, and values that are not arrows, are not reported", () => {
  const service = `export const loadPlace = (input: PlaceInput) => (input.key ? readPlace(input) : readAllPlaces());
export const recordNote = (input: NoteInput) => {
  const trimmed = input.text.trim();
  return writeNote({ ...input, text: trimmed });
};
export const total = (base + extra);
export const PLACE_LIMIT = 50;
export const renderPlace = (place: Place) => format(place?.key ?? "none");
`;
  assert.deepEqual(forwardingNames(service), ["renderPlace:8"]);
});
