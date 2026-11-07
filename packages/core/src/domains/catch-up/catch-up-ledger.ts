/**
 * What earlier catch-ups covered, read from their receipts: how far each origin's words have been read,
 * and which sources each derived kind has weighed under its current proposal policy.
 */
import type { DerivedKindDefinition, TasteCatalog } from "#core/domains/kind-catalog/index.ts";
import type { CatchUpRecord, SourceRecord } from "#core/domains/records/index.ts";

/**
 * Bumped when the catch-up procedure changes what weighing a source means, so every source is due
 * again for every kind.
 */
const CATCH_UP_GUIDE_VERSION = "1";

/** FNV-1a, 32 bits, as 8 hex digits: a stable fingerprint, not a security boundary. */
const fingerprint = (text: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/**
 * `<kind>@<policy>`: the policy is what decides whether a source becomes a proposal of the kind (its
 * prompt and the source kinds it cites), so a changed prompt makes earlier weighing stale. Labels
 * and descriptions don't count.
 */
export const catchUpPolicyTagOf = (kind: DerivedKindDefinition): string =>
  `${kind.key}@${fingerprint([CATCH_UP_GUIDE_VERSION, kind.proposalPrompt, ...kind.sources.toSorted()].join("\n"))}`;

export interface OriginReading {
  readonly origin: string;
  /** Every word of the origin said up to here has been read. */
  readonly readThrough: string;
  readonly at: string;
  readonly by: string;
  readonly runIn: ReadonlyArray<string>;
}

/** The furthest receipt of each origin; an origin no catch-up has read is absent. */
export const latestOriginReadings = (catchUps: ReadonlyArray<CatchUpRecord>): ReadonlyMap<string, OriginReading> => {
  const latest = new Map<string, OriginReading>();
  for (const catchUp of catchUps) {
    if (catchUp.origin === undefined || catchUp.read_through === undefined) continue;
    const known = latest.get(catchUp.origin);
    if (known !== undefined && Date.parse(known.readThrough) >= Date.parse(catchUp.read_through)) continue;
    latest.set(catchUp.origin, {
      origin: catchUp.origin,
      readThrough: catchUp.read_through,
      at: catchUp.at,
      by: catchUp.by,
      runIn: catchUp.run_in ?? [],
    });
  }
  return latest;
};

/**
 * For each derived kind, the sources it may cite that no catch-up has weighed under its current policy,
 * oldest first. Being weighed never hides a source from later searches for related evidence.
 */
export const sourcesDueForKinds = (
  catalog: TasteCatalog,
  sources: ReadonlyArray<SourceRecord>,
  catchUps: ReadonlyArray<CatchUpRecord>,
): ReadonlyArray<{
  readonly kind: DerivedKindDefinition;
  readonly tag: string;
  readonly due: ReadonlyArray<SourceRecord>;
}> => {
  const weighed = new Map<string, Set<string>>();
  for (const catchUp of catchUps)
    for (const tag of catchUp.considered_for ?? []) {
      const ids = weighed.get(tag) ?? new Set<string>();
      for (const id of catchUp.considered ?? []) ids.add(id);
      weighed.set(tag, ids);
    }
  return catalog.derivedKinds.map((kind) => {
    const tag = catchUpPolicyTagOf(kind);
    const done = weighed.get(tag) ?? new Set<string>();
    const due = sources
      .filter((source) => kind.sources.includes(source.kind) && !done.has(source.id))
      .toSorted((left, right) => Date.parse(left.captured_at) - Date.parse(right.captured_at));
    return { kind, tag, due };
  });
};
