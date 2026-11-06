/**
 * The config operations: agent operations that run with only the store's root, never an open store,
 * because setup starts where no store exists. Each run yields `TasteStoreRoot` alone, and the
 * registry checks that at compile time.
 */
import {
  CheckTastebudConfigInput,
  CheckTastebudConfigResultSchema,
  checkTastebudConfigText,
  renderCheckTastebudConfigText,
  renderShowTastebudConfigText,
  renderWriteTastebudConfigText,
  ShowTastebudConfigInput,
  ShowTastebudConfigResultSchema,
  showTastebudConfigText,
  WriteTastebudConfigInput,
  WriteTastebudConfigResultSchema,
  writeOperationTastebudConfigText,
} from "#core/features/store-setup/index.server.ts";

import { declareTasteOperation } from "./taste-operation-declaration.ts";

export const STORE_ROOT_TASTE_OPERATIONS = {
  "config-show": declareTasteOperation({
    name: "config-show",
    audience: "agent",
    kind: "query",
    description:
      "Setup starts here: the store's tastebud.config.ts text, its hash and what it loads as, or, with no store yet, where it would go and a starter. With guide, also the setup interview.",
    input: ShowTastebudConfigInput,
    output: ShowTastebudConfigResultSchema,
    run: showTastebudConfigText,
    renderText: renderShowTastebudConfigText,
  }),
  "config-check": declareTasteOperation({
    name: "config-check",
    audience: "agent",
    kind: "query",
    description:
      "Validate a whole candidate tastebud.config.ts as loading would: every problem by field, the diff against the current file, and where probe directories resolve under it. Writes nothing (for a new store, its directory exists only during the check).",
    input: CheckTastebudConfigInput,
    output: CheckTastebudConfigResultSchema,
    run: checkTastebudConfigText,
    renderText: renderCheckTastebudConfigText,
  }),
  "config-write": declareTasteOperation({
    name: "config-write",
    audience: "agent",
    kind: "overwrite",
    description:
      "Only after the owner says yes to the diff: validate and write the whole tastebud.config.ts, creating the store if there is none. Refused if the file isn't the one in expected_current.",
    input: WriteTastebudConfigInput,
    output: WriteTastebudConfigResultSchema,
    run: (input) => writeOperationTastebudConfigText(input),
    renderText: renderWriteTastebudConfigText,
  }),
} as const;
