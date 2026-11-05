/**
 * The config operations: agent operations that run with only the store's root, never an open store,
 * because setup starts where no store exists. Each run yields `TasteStoreRoot` alone, and the
 * registry checks that at compile time.
 */
import {
  CheckTasteConfigInput,
  CheckTasteConfigResultSchema,
  checkTasteConfigText,
  renderCheckTasteConfigText,
  renderShowTasteConfigText,
  renderWriteTasteConfigText,
  ShowTasteConfigResultSchema,
  showTasteConfigText,
  WriteTasteConfigInput,
  WriteTasteConfigResultSchema,
  writeOperationTasteConfigText,
} from "#core/features/store-setup/index.server.ts";

import { declareTasteOperation, NoInput } from "./taste-operation-declaration.ts";

export const STORE_ROOT_TASTE_OPERATIONS = {
  "config-show": declareTasteOperation({
    name: "config-show",
    audience: "agent",
    kind: "query",
    description:
      "Setup starts here: the store's taste.config.ts text, its hash and what it loads as, or, with no store yet, where it would go and a starter.",
    input: NoInput,
    output: ShowTasteConfigResultSchema,
    run: () => showTasteConfigText(),
    renderText: renderShowTasteConfigText,
  }),
  "config-check": declareTasteOperation({
    name: "config-check",
    audience: "agent",
    kind: "query",
    description:
      "Validate a whole candidate taste.config.ts as loading would: every problem by field, the diff against the current file, and where probe directories resolve under it. Writes nothing (for a new store, its directory exists only during the check).",
    input: CheckTasteConfigInput,
    output: CheckTasteConfigResultSchema,
    run: checkTasteConfigText,
    renderText: renderCheckTasteConfigText,
  }),
  "config-write": declareTasteOperation({
    name: "config-write",
    audience: "agent",
    kind: "overwrite",
    description:
      "Only after the owner says yes to the diff: validate and write the whole taste.config.ts, creating the store if there is none. Refused if the file isn't the one in expected_current.",
    input: WriteTasteConfigInput,
    output: WriteTasteConfigResultSchema,
    run: (input) => writeOperationTasteConfigText(input),
    renderText: renderWriteTasteConfigText,
  }),
} as const;
