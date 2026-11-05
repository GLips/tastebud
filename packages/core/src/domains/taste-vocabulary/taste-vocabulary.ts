/**
 * Tastebud's closed vocabularies, in one browser-safe module. Core, every shell and the review UI derive
 * from these; importProtection keeps the rest of core out of the browser, so anything the UI needs
 * at runtime lives in `src/shared`, which core exports as subpaths.
 */
import { Schema } from "effect";

/** The four record types; `type` in every file's frontmatter. */
const TASTE_RECORD_TYPES = ["Source", "Derivation", "Decision", "ThreadEntry"] as const;
export type TasteRecordType = (typeof TASTE_RECORD_TYPES)[number];

/** Computed on read, never stored. `superseded` means an accepted derivation names it in `supersedes`. */
export const DERIVATION_STATUSES = ["pending", "accepted", "rejected", "retracted", "superseded"] as const;
export const DerivationStatusSchema = Schema.Literals(DERIVATION_STATUSES);
export type DerivationStatus = (typeof DERIVATION_STATUSES)[number];

export const DECISION_OUTCOMES = ["accept", "reject", "retract"] as const;
export const DecisionOutcomeSchema = Schema.Literals(DECISION_OUTCOMES);
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

/** How a derived kind reaches agents: the prompt hook and pull recall, pull recall only, or never. */
export const RECALL_POLICIES = ["inject", "pull", "never"] as const;
export const RecallPolicySchema = Schema.Literals(RECALL_POLICIES);
export type RecallPolicy = (typeof RECALL_POLICIES)[number];

export const SAID_AT_PRECISIONS = ["second", "minute", "day"] as const;
export type SaidAtPrecision = (typeof SAID_AT_PRECISIONS)[number];

/** `explicit`: the proposer chose the scope. `defaulted`: it came from the proposer's context. */
export const SCOPE_SOURCES = ["explicit", "defaulted"] as const;
export type ScopeSource = (typeof SCOPE_SOURCES)[number];

/** The resolver a config names; a function in the config shows as `custom`. */
export const PLACE_RESOLVER_NAMES = ["git", "directories", "custom"] as const;
export type PlaceResolverName = (typeof PLACE_RESOLVER_NAMES)[number];

/** The subject every built-in belief defaults to: the store's owner. */
export const OWNER_SUBJECT = "owner";

/** `human:<id>`. Only the review server and the seed write records as one. */
export const isHumanAccount = (actor: string): boolean => actor.trim().startsWith("human:");

/** The 8 hex characters after the time prefix: the 48-bit time and the version nibble (always 7) are skipped. */
export const shortIdOf = (id: string, length = 8): string => id.replaceAll("-", "").slice(13, 13 + length);
