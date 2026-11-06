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
import { hasContextOverride, type TasteCaller } from "#core/domains/taste-caller/index.ts";
import { OWNER_SUBJECT } from "#core/domains/taste-vocabulary/index.ts";
import { contextFromDirectory, resolveOperationContext } from "#core/features/place-context/index.server.ts";
import {
  readEligibleTranscriptMessage,
  type TranscriptReference,
} from "#core/features/transcript-mining/index.server.ts";
import { formatLocalIsoTime } from "#core/shared/iso-times.ts";

import { TranscriptFieldConflict, TranscriptQuoteNotFound } from "../errors.ts";

/** The capture fields a transcript reference settles, as the caller may also have given them. */
interface TranscriptCaptureClaims {
  readonly transcript: TranscriptReference;
  readonly quote: string;
  readonly said_by?: string;
  readonly said_by_label?: string;
  readonly said_at?: string;
  readonly said_at_precision?: string;
  readonly address?: string;
  readonly in?: string;
  readonly at?: ReadonlyArray<string>;
}

const conflictsOf = (
  config: LoadedTastebudConfig,
  claims: TranscriptCaptureClaims,
  message: EligibleTranscriptMessage,
  address: string,
): ReadonlyArray<TranscriptFieldConflict> => {
  const conflicts: Array<TranscriptFieldConflict> = [];
  const check = (field: string, given: string | undefined, agrees: (given: string) => boolean, transcript: string) => {
    if (given !== undefined && !agrees(given))
      conflicts.push(new TranscriptFieldConflict({ field, given, transcript }));
  };
  check("said_by", claims.said_by, (given) => given === OWNER_SUBJECT || given === config.owner, OWNER_SUBJECT);
  check("said_by_label", claims.said_by_label, (given) => given === config.ownerName, config.ownerName);
  check("said_at", claims.said_at, (given) => Date.parse(given) === Date.parse(message.timestamp), message.timestamp);
  check("said_at_precision", claims.said_at_precision, (given) => given === "second", "second");
  check("address", claims.address, (given) => given === address, address);
  return conflicts;
};

const samePlaces = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((place) => right.includes(place));

/** The speaker, time, address and places a capture of `claims.transcript` records. */
export const readTranscriptCapture = Effect.fn("capture.readTranscriptCapture")(function* (
  config: LoadedTastebudConfig,
  claims: TranscriptCaptureClaims,
  caller: TasteCaller,
  kind: string,
) {
  const reference = claims.transcript;
  const message = yield* readEligibleTranscriptMessage(reference);
  if (!quoteFitsTranscriptParts(message.parts, claims.quote))
    return yield* new TranscriptQuoteNotFound({ session: reference.session, messageId: reference.message });
  const address = claudeCodeTranscriptAddress(reference.session, reference.message);
  const [conflict] = conflictsOf(config, claims, message, address);
  if (conflict !== undefined) return yield* conflict;
  const source = { kind, address, saidBy: config.owner };
  const context = yield* contextFromDirectory(config, message.cwd, "in", source);
  if (hasContextOverride(claims)) {
    const given = yield* resolveOperationContext(claims, caller, source);
    if (!samePlaces(given.places, context.places))
      return yield* new TranscriptFieldConflict({
        field: claims.in === undefined ? "at" : "in",
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
