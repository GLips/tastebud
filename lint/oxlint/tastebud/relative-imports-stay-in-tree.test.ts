import { describeRule } from "../lib/rule-spec.ts";
import { relativeImportsStayInTreeRule } from "./relative-imports-stay-in-tree.ts";

const CLI_INFRA = "/repo/packages/cli/src/infrastructure/demo-store.ts";
const CORE_DOMAIN = "/repo/packages/core/src/domains/places/place-keys.ts";

describeRule("tastebud/relative-imports-stay-in-tree", relativeImportsStayInTreeRule, {
  obvious: [
    {
      name: "the CLI reaching into core's domain files by path",
      filename: CLI_INFRA,
      code: `import { placeKey } from "../../../core/src/domains/places/place-keys.ts";`,
      errors: [{ messageId: "relativeImportLeavesTree" }],
    },
    {
      name: "a core domain reaching up into the CLI entry",
      filename: CORE_DOMAIN,
      code: `import { main } from "../../../../cli/src/main.ts";`,
      errors: [{ messageId: "relativeImportLeavesTree" }],
    },
  ],

  adversarial: [
    {
      name: "a type-only import still bypasses the export map",
      filename: "/repo/apps/review/src/features/places/service/places.ts",
      code: `import type { Place } from "../../../../../../packages/core/src/domains/places/place.ts";`,
      errors: [{ messageId: "relativeImportLeavesTree" }],
    },
    {
      name: "climbing to the package root, one level above src",
      filename: CORE_DOMAIN,
      code: `export { version } from "../../../package.json";`,
      errors: [{ messageId: "relativeImportLeavesTree" }],
    },
    {
      name: "a directory whose name merely starts with the tree root's",
      filename: CLI_INFRA,
      code: `import { old } from "../../src-old/demo-store.ts";`,
      errors: [{ messageId: "relativeImportLeavesTree" }],
    },
    {
      name: "a dynamic import, which no ImportDeclaration visitor sees",
      filename: CLI_INFRA,
      code: `export const load = () => import("../../../mcp/src/server.ts");`,
      errors: [{ messageId: "relativeImportLeavesTree" }],
    },
  ],

  legal: [
    {
      name: "siblings and parents that stay inside the tree",
      filename: CORE_DOMAIN,
      code: `import { place } from "./place.ts";\nimport { inputText } from "../../shared/input-text.ts";`,
    },
    {
      name: "another package by name",
      filename: CLI_INFRA,
      code: `import { placeKey } from "@tastebud/core/places";`,
    },
    {
      name: "another layer of the same tree",
      filename: CLI_INFRA,
      code: `import { demoConfig } from "../domains/acme-demo-story/demo-config.ts";`,
    },
  ],
});
