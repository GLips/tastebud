import { describeRule } from "../lib/rule-spec.ts";
import { deprecatedPathsRule } from "./deprecated-paths.ts";

const UI = "/repo/apps/review/src/features/places/ui/places-page.tsx";
const CLI_CONTROLLER = "/repo/packages/cli/src/features/cli-operations/controllers/query-commands.ts";
const OPERATION = "/repo/packages/core/src/features/recall/operations/recall.ts";

describeRule("placement/deprecated-paths", deprecatedPathsRule, {
  obvious: [
    {
      name: "a shell importing the core root barrel that no longer exists",
      filename: CLI_CONTROLLER,
      code: `import { runTasteOperation } from "@taste/core";`,
      errors: [
        {
          message:
            "The @taste/core root export no longer exists. Import a pure domain subpath (@taste/core/<domain>), or a feature subpath through this shell's #cli/infrastructure/taste-core door.",
        },
      ],
    },
    {
      name: "a review component importing the renamed vocabulary subpath",
      filename: UI,
      code: `import { kindLabel } from "@taste/core/vocabulary";`,
      errors: [{ messageId: "coreVocabularyRenamed" }],
    },
    {
      name: "a core operation importing a flat module that moved",
      filename: OPERATION,
      code: `import { TasteStore } from "#core/store";`,
      errors: [{ messageId: "coreFlatModuleMoved" }],
    },
  ],

  adversarial: [
    {
      name: "a type-only import of the root barrel still points at an export that will not resolve",
      filename: UI,
      code: `import type { TasteRecord } from "@taste/core";`,
      errors: [{ messageId: "coreRootBarrelRemoved" }],
    },
    {
      name: "a dynamic import carries the dependency without an import declaration",
      filename: UI,
      code: `export const load = async () => (await import("@taste/core/catalog-view")).catalogView;`,
      errors: [{ messageId: "coreCatalogViewRenamed" }],
    },
    {
      name: "a star re-export names no binding to notice",
      filename: OPERATION,
      code: `export * from "#core/errors";`,
      errors: [{ messageId: "coreFlatModuleMoved" }],
    },
    {
      name: "a flat module's subpath, which a pattern closed on the end alone misses",
      filename: OPERATION,
      code: `import { recallText } from "#core/render/recall-text";`,
      errors: [{ messageId: "coreFlatModuleMoved" }],
    },
    {
      name: "a moved shared file, inside a directory that otherwise survives",
      filename: OPERATION,
      code: `export { placeKey } from "#core/shared/places";`,
      errors: [{ messageId: "coreFlatModuleMoved" }],
    },
    {
      name: "quote style is a lexer detail the parsed specifier has already discarded",
      filename: OPERATION,
      code: `import { decide } from '#core/decide';`,
      errors: [{ messageId: "coreFlatModuleMoved" }],
    },
  ],

  legal: [
    {
      name: "a pure domain subpath, which is what review may import",
      filename: UI,
      code: `import { kindLabel } from "@taste/core/taste-vocabulary";`,
    },
    {
      name: "a live module whose name merely starts with a removed one",
      filename: OPERATION,
      code: `import { tasteStoreFromEnv } from "#core/features/store-host/index.server";\nimport { openIndex } from "#core/infrastructure/record-index/record-index";`,
    },
    {
      name: "a flat name that now lives one level down is the new home, not the old path",
      filename: OPERATION,
      code: `import { recordStore } from "#core/features/record-store/index.server";\nimport { inputText } from "#core/shared/input-text";`,
    },
    {
      name: "a package whose name merely starts with the core package",
      filename: CLI_CONTROLLER,
      code: `import { x } from "@taste/core-legacy";`,
    },
    {
      name: "a relative specifier is deliberately unfenced — nothing resolves it to a project path",
      filename: OPERATION,
      code: `import { local } from "./store";`,
    },
    {
      name: "a test may still reference a path under migration",
      filename: "/repo/apps/review/src/features/places/ui/places-page.test.tsx",
      code: `import { kindLabel } from "@taste/core/vocabulary";`,
    },
    {
      name: "a one-off script sits outside the architecture contract",
      filename: "/repo/scripts/codemod-imports.ts",
      code: `import { runTasteOperation } from "@taste/core";`,
    },
  ],
});
