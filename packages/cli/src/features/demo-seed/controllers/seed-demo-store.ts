/**
 * `taste seed`: a fictional demo store. Dana (`human:dana`) is a developer on Acme's storefront
 * (`github.com/acme/web`) and billing API; the call quotes are Acme's customers, all invented. Every
 * record goes through core's operations, so the repeat check, evidence rules and status rules apply
 * to the seed exactly as to an agent. Decisions and Dana's notes are human operations, run by a
 * `via: "seed"` caller acting as `process:seed`, which each decision records as its `via`.
 */
import { Effect } from "effect";

import { DEMO_CONFIG_TEXT, DEMO_OWNER } from "#cli/domains/acme-demo-story/index.ts";
import {
  countStoreRecordFiles,
  provideTasteStore,
  requireNoStoreRecords,
  writeTasteConfigText,
} from "#cli/infrastructure/taste-core.ts";

import { seedBeliefs } from "./seed-belief-chapter.ts";
import { seedCallsInsightsAndIdeas } from "./seed-call-chapter.ts";
import { resetSeedClock, withSeedClock } from "./seed-story-steps.ts";

/** Writes the demo store at `root`, which must hold no store yet: no config and no records. */
export const seedTasteDemoStore = Effect.fn("demo-seed.seedTasteDemoStore")(function* (root: string) {
  yield* requireNoStoreRecords(root);
  // Created through the same write as config-write, so an existing config refuses the seed.
  yield* writeTasteConfigText(root, DEMO_CONFIG_TEXT, "");
  resetSeedClock();
  yield* provideTasteStore(root)(withSeedClock(Effect.andThen(seedBeliefs, seedCallsInsightsAndIdeas)));
  return { root, owner: DEMO_OWNER, recordCount: countStoreRecordFiles(root) };
});
