/**
 * A capture by transcript reference: the quote must be an exact stretch of one eligible part of the
 * message, and the speaker, time, place and address come from the transcript. A caller value that
 * disagrees is refused rather than overridden.
 */
import { Effect } from "effect";

import {
  claudeCodeTranscriptAddress,
  type EligibleTranscriptMessage,
  quoteFitsTranscriptParts,
} from "#core/domains/claude-code-transcript/index.ts";
import type { LoadedTastebudConfig } from "#core/domains/store-config/index.ts";
import type { TasteCaller } from "#core/domains/taste-caller/index.ts";
import { OWNER_SUBJECT } from "#core/domains/taste-vocabulary/index.ts";
import { contextFromDirectory, resolveOperationContext } from "#core/features/place-context/index.server.ts";
import {
  readEligibleTranscriptMessage,
  type TranscriptReference,
} from "#core/features/transcript-mining/index.server.ts";
import { formatLocalIsoTime } from "#core/shared/iso-times.ts";

import { TranscriptFieldConflict, TranscriptQuoteNotFound } from "../errors.ts";
import type { CaptureSourceInput } from "./capture.ts";

/** The first field the caller gave that the transcript contradicts. */
const firstTranscriptConflictOf = (
  config: LoadedTastebudConfig,
  input: CaptureSourceInput,
  message: EligibleTranscriptMessage,
  address: string,
): TranscriptFieldConflict | undefined => {
  const fields = [
    {
      field: "said_by",
      given: input.said_by,
      agrees: (given: string) => given === OWNER_SUBJECT || given === config.owner,
      transcript: OWNER_SUBJECT,
    },
    {
      field: "said_by_label",
      given: input.said_by_label,
      agrees: (given: string) => given === config.ownerName,
      transcript: config.ownerName,
    },
    {
      field: "said_at",
      given: input.said_at,
      agrees: (given: string) => Date.parse(given) === Date.parse(message.timestamp),
      transcript: message.timestamp,
    },
    {
      field: "said_at_precision",
      given: input.said_at_precision,
      agrees: (given: string) => given === "second",
      transcript: "second",
    },
    { field: "address", given: input.address, agrees: (given: string) => given === address, transcript: address },
  ];
  const conflict = fields.find(({ given, agrees }) => given !== undefined && !agrees(given));
  return conflict?.given === undefined
    ? undefined
    : new TranscriptFieldConflict({ field: conflict.field, given: conflict.given, transcript: conflict.transcript });
};

const samePlaces = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((place) => right.includes(place));

/**
 * The speaker, time, address and places a capture of `reference` records. `in` is ignored: agents
 * pass their own working directory, which says nothing about where a mined message was sent.
 */
export const readTranscriptCapture = Effect.fn("capture.readTranscriptCapture")(function* (
  config: LoadedTastebudConfig,
  input: CaptureSourceInput,
  reference: TranscriptReference,
  caller: TasteCaller,
  kind: string,
) {
  const message = yield* readEligibleTranscriptMessage(reference);
  if (!quoteFitsTranscriptParts(message.parts, input.quote))
    return yield* new TranscriptQuoteNotFound({ session: reference.session, messageId: reference.message });
  const address = claudeCodeTranscriptAddress(reference.session, reference.message);
  const conflict = firstTranscriptConflictOf(config, input, message, address);
  if (conflict !== undefined) return yield* conflict;
  const source = { kind, address, saidBy: config.owner };
  const context = yield* contextFromDirectory(config, message.cwd, "in", source);
  if (input.at !== undefined && input.at.length > 0) {
    const given = yield* resolveOperationContext({ at: input.at }, caller, source);
    if (!samePlaces(given.places, context.places))
      return yield* new TranscriptFieldConflict({
        field: "at",
        given: given.places.join(", "),
        transcript: context.places.join(", "),
      });
  }
  return {
    saidBy: config.owner,
    label: config.ownerName,
    saidAt: formatLocalIsoTime(new Date(message.timestamp)),
    precision: "second" as const,
    address,
    places: context.places,
  };
});
