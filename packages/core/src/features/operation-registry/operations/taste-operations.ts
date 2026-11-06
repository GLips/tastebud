/**
 * The operation registry: every behaviour a shell reaches by name, agent operations first. One
 * `as const` record, so dispatch keeps each operation's types; human operations never appear on
 * agent surfaces.
 */
import { AGENT_TASTE_OPERATIONS } from "./agent-operations.ts";
import { HUMAN_TASTE_OPERATIONS } from "./human-operations.ts";
import { STORE_ROOT_TASTE_OPERATIONS } from "./store-root-operations.ts";

/** Every operation, keyed by its name. */
export const TASTE_OPERATIONS = {
  ...AGENT_TASTE_OPERATIONS,
  ...STORE_ROOT_TASTE_OPERATIONS,
  ...HUMAN_TASTE_OPERATIONS,
} as const;

export type TasteOperations = typeof TASTE_OPERATIONS;
export type TasteOperationName = keyof TasteOperations;

// Each key is its operation's name, so a registry lookup and a declaration's `name` never disagree.
true satisfies { [N in TasteOperationName]: TasteOperations[N]["name"] extends N ? true : false }[TasteOperationName];

/** What a caller sends: the input as it crosses the wire, before decoding. */
export type TasteOperationInput<N extends TasteOperationName> = TasteOperations[N]["input"]["Encoded"];
/** What an operation returns: plain JSON, described by its `output` schema. */
export type TasteOperationOutput<N extends TasteOperationName> = TasteOperations[N]["output"]["Type"];

/** The operations agents may reach; human operations are refused to them at run time. */
export type AgentTasteOperationName = keyof typeof AGENT_TASTE_OPERATIONS | StoreRootTasteOperationName;

/** The operations that run with only the store's root, so a missing store doesn't stop them. */
export type StoreRootTasteOperationName = keyof typeof STORE_ROOT_TASTE_OPERATIONS;

export const isStoreRootTasteOperation = (name: TasteOperationName): name is StoreRootTasteOperationName =>
  Object.hasOwn(STORE_ROOT_TASTE_OPERATIONS, name);
