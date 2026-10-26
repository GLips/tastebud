import { Clock, Effect } from "effect";

import { formatLocalIsoTime } from "#core/shared/iso-times.ts";

let lastIdMs = 0;

/**
 * UUIDv7 with a random `rand_a`. Not `Bun.randomUUIDv7()`: that fills `rand_a` with a sub-ms counter
 * (`7000…`), which would leave short ids almost no randomness. The time part never repeats within a
 * process, so ids sort in creation order: replay breaks same-millisecond ties by id.
 */
const newRecordId = (nowMs: number): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  lastIdMs = Math.max(nowMs, lastIdMs + 1);
  let ms = lastIdMs;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * A new record's id and timestamp, read from Effect's `Clock` so the demo seed can write a store
 * whose history spans weeks. Lock waits and listener heartbeats stay on wall time.
 */
export const stampNewRecord = Effect.map(Clock.currentTimeMillis, (nowMs) => ({
  id: newRecordId(nowMs),
  at: formatLocalIsoTime(new Date(nowMs)),
}));
