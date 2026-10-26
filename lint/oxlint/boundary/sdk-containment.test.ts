// The rows this exercises are Taste's own, in `lint/policy/package-owners.ts`.
// What is proved here is the READER, so the cases follow the rows: pruning a row
// prunes its cases. Taste has no zero-owner row, so the total-ban branch has no
// subject here.

import { describeRule } from "../lib/rule-spec.ts";
import { sdkContainmentRule } from "./sdk-containment.ts";

const OPERATION = "/repo/packages/core/src/features/recall/operations/recall.ts";
const UI = "/repo/apps/review/src/features/places/ui/places-page.tsx";
const CODEC = "/repo/packages/core/src/infrastructure/frontmatter-codec.ts";
const IMPORT_YAML = `import { parse } from "yaml";`;

describeRule("boundary/sdk-containment", sdkContainmentRule, {
  obvious: [
    {
      name: "an operation opening the SQLite index itself",
      filename: OPERATION,
      code: `import { Database } from "bun:sqlite";`,
      errors: [{ messageId: "rawSdkOutsideOwner" }],
    },
    {
      name: "a review UI component parsing frontmatter directly",
      filename: UI,
      code: IMPORT_YAML,
      errors: [{ messageId: "rawSdkOutsideOwner" }],
    },
  ],

  adversarial: [
    {
      name: "a package subpath is the same package, spelled past the name",
      filename: "/repo/packages/mcp/src/features/taste-tools/controllers/call-taste-tool.ts",
      code: `import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";`,
      errors: [{ messageId: "rawSdkOutsideOwner" }],
    },
    {
      name: "a dynamic import is a call expression, not an import declaration",
      filename: UI,
      code: `export const load = async () => (await import("yaml")).parse;`,
      errors: [{ messageId: "rawSdkOutsideOwner" }],
    },
    {
      name: "a re-export hands the raw SDK on under the feature's own name",
      filename: OPERATION,
      code: `export { Database } from "bun:sqlite";`,
      errors: [{ messageId: "rawSdkOutsideOwner" }],
    },
    {
      name: "a star re-export names no binding to notice",
      filename: OPERATION,
      code: `export * from "yaml";`,
      errors: [{ messageId: "rawSdkOutsideOwner" }],
    },
    {
      name: "a literal require() is the same dependency, and reaches no import visitor",
      filename: OPERATION,
      code: `const yaml = require("yaml");`,
      errors: [{ messageId: "rawSdkOutsideOwner" }],
    },
    {
      name: "a directory that merely starts with 'infrastructure' owns nothing",
      filename: "/repo/packages/core/src/infrastructure-legacy/frontmatter-codec.ts",
      code: IMPORT_YAML,
      errors: [{ messageId: "rawSdkOutsideOwner" }],
    },
    {
      name: "a filename that merely extends an owner's does not inherit its exemption",
      filename: "/repo/packages/core/src/infrastructure/frontmatter-codec-legacy.ts",
      code: IMPORT_YAML,
      errors: [{ messageId: "rawSdkOutsideOwner" }],
    },
    {
      name: "an owner is exempt for its OWN package only, so the wrapper layer is not one permission",
      filename: CODEC,
      code: `import { Database } from "bun:sqlite";`,
      errors: [{ messageId: "rawSdkOutsideOwner" }],
    },
    {
      name: "an app entrypoint is not a category that inherits a pass — it owns the row or it does not",
      filename: "/repo/packages/cli/src/main.ts",
      code: `import { serveTasteMcpOverStdio } from "@taste/mcp";`,
      errors: [{ messageId: "rawSdkOutsideOwner" }],
    },
  ],

  legal: [
    {
      name: "the owning module is exactly where the raw SDK belongs",
      filename: CODEC,
      code: IMPORT_YAML,
    },
    {
      name: "a capability with several owners, each importing it for its own part",
      filename: "/repo/packages/core/src/infrastructure/record-index/index-handle.ts",
      code: `import { Database } from "bun:sqlite";`,
    },
    {
      name: "the CLI's one MCP door owns the MCP package",
      filename: "/repo/packages/cli/src/infrastructure/mcp-server.ts",
      code: `import { serveTasteMcpOverStdio } from "@taste/mcp";`,
    },
    {
      name: "the configured adapter, which is what callers are meant to import",
      filename: OPERATION,
      code: `import { stringifyFrontmatter } from "#core/infrastructure/frontmatter-codec";`,
    },
    {
      name: "a package whose name merely starts with an owned one",
      filename: OPERATION,
      code: `import { load } from "yaml-ast-parser";`,
    },
    {
      name: "another package in an owned package's scope is a different package",
      filename: OPERATION,
      code: `import { Client } from "@modelcontextprotocol/client";`,
    },
    {
      name: "a relative path that happens to end in an owned package's name is a file in this repo",
      filename: OPERATION,
      code: `import { rate } from "./yaml";`,
    },
    {
      name: "an unowned library, which has no credential and no IO to centralise",
      filename: OPERATION,
      code: `import { Effect } from "effect";`,
    },
    {
      name: "a test may reach the raw SDK to build a fixture",
      filename: "/repo/packages/core/src/features/recall/operations/recall.test.ts",
      code: `import { Database } from "bun:sqlite";`,
    },
    {
      name: "a one-off script is not part of the shipped module graph",
      filename: "/repo/scripts/rebuild-index.ts",
      code: `import { Database } from "bun:sqlite";`,
    },
  ],
});
