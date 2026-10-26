/**
 * The operation registry: every behaviour a shell reaches by name, agent operations first. One
 * `as const` record, so dispatch keeps each operation's types; human operations never appear on
 * agent surfaces.
 */
import { AGENT_TASTE_OPERATIONS } from "./agent-operations.ts";
import { HUMAN_TASTE_OPERATIONS } from "./human-operations.ts";

/** Every operation, keyed by its name. */
export const TASTE_OPERATIONS = { ...AGENT_TASTE_OPERATIONS, ...HUMAN_TASTE_OPERATIONS } as const;

export type TasteOperations = typeof TASTE_OPERATIONS;
export type TasteOperationName = keyof TasteOperations;

// Each key is its operation's name, so a registry lookup and a declaration's `name` never disagree.
true satisfies { [N in TasteOperationName]: TasteOperations[N]["name"] extends N ? true : false }[TasteOperationName];

/** What a caller sends: the input as it crosses the wire, before decoding. */
export type TasteOperationInput<N extends TasteOperationName> = TasteOperations[N]["input"]["Encoded"];
/** What an operation returns: plain JSON, described by its `output` schema. */
export type TasteOperationOutput<N extends TasteOperationName> = TasteOperations[N]["output"]["Type"];
