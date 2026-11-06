/**
 * The line that ends every injected block, naming what it sent: `[tastebud-recall <id>:<fingerprint> …]`.
 * The hook finds it again in the host's record of its own earlier output, which is how it knows what
 * it already said without keeping a ledger.
 */
import { type DerivationScope, scopeGroupKey } from "#core/domains/places/index.ts";

import type { HookEmission } from "./hook-evidence.ts";

const MARKER_LINE = /^\[tastebud-recall((?: [^\s:]+:[0-9a-f]{8})+)\]$/gm;

/** FNV-1a, 32 bits: stable across processes, and a change of status or scope changes it. */
const fnv1aHex = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/** The effective state a derivation was sent in; a repeat with another fingerprint is news. */
export const hookEmissionFingerprint = (status: string, effectiveScope: DerivationScope): string =>
  fnv1aHex(`${status}\n${scopeGroupKey(effectiveScope)}`);

export const renderHookEmissionMarker = (emissions: ReadonlyArray<HookEmission>): string =>
  `[tastebud-recall${emissions.map((emission) => ` ${emission.id}:${emission.fingerprint}`).join("")}]`;

/** Every emission named by a marker line in `text`; none when there is no marker. */
export const parseHookEmissionMarkers = (text: string): Array<HookEmission> =>
  [...text.matchAll(MARKER_LINE)].flatMap((match) =>
    (match[1] ?? "")
      .trim()
      .split(" ")
      .map((entry) => {
        const separator = entry.lastIndexOf(":");
        return { id: entry.slice(0, separator), fingerprint: entry.slice(separator + 1) };
      }),
  );
