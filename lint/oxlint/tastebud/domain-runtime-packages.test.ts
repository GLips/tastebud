import { describeRule } from "../lib/rule-spec.ts";
import { domainRuntimePackagesRule } from "./domain-runtime-packages.ts";

const DOMAIN = "/repo/packages/core/src/domains/records/record-schemas.ts";
const SHARED = "/repo/packages/core/src/shared/input-text.ts";
// A fixture export map in the target shape: one domain subpath and one feature subpath.
const options = [
  {
    coreExports: {
      "./places": "./src/domains/places/index.ts",
      "./record-store": "./src/features/record-store/index.server.ts",
    },
  },
];

describeRule("tastebud/domain-runtime-packages", domainRuntimePackagesRule, {
  obvious: [
    {
      name: "a domain parsing frontmatter with the yaml package",
      filename: DOMAIN,
      code: `import { parse } from "yaml";`,
      options,
      errors: [{ messageId: "impureDomainPackage" }],
    },
    {
      name: "a shared helper reaching for a Node module",
      filename: SHARED,
      code: `import { join } from "node:path";`,
      options,
      errors: [{ messageId: "impureDomainPackage" }],
    },
  ],

  adversarial: [
    {
      name: "Effect 4's process area is a lowercase subpath of the allowed package",
      filename: DOMAIN,
      code: `import { ChildProcess } from "effect/process";`,
      options,
      errors: [{ messageId: "impureDomainPackage" }],
    },
    {
      name: "a domain exporting the fetch-backed HTTP layer, which calls globalThis.fetch",
      filename: "/repo/packages/core/src/domains/records/index.ts",
      code: `import { FetchHttpClient } from "effect/http";\nexport const httpLayer = FetchHttpClient.layer;`,
      options,
      errors: [{ messageId: "impureDomainPackage" }],
    },
    {
      name: "a deep import into the sql area",
      filename: SHARED,
      code: `import * as SqlClient from "effect/sql/SqlClient";`,
      options,
      errors: [{ messageId: "impureDomainPackage" }],
    },
    {
      name: "a core feature subpath is the same package name as a domain one",
      filename: DOMAIN,
      code: `import { TasteStore } from "@tastebud/core/record-store";`,
      options,
      errors: [{ messageId: "impureDomainPackage" }],
    },
    {
      name: "a re-export ships the package through the domain barrel",
      filename: "/repo/packages/core/src/domains/records/index.ts",
      code: `export * from "effect/http";`,
      options,
      errors: [{ messageId: "impureDomainPackage" }],
    },
    {
      name: "a dynamic import, which no ImportDeclaration visitor sees",
      filename: DOMAIN,
      code: `export const load = () => import("yaml");`,
      options,
      errors: [{ messageId: "impureDomainPackage" }],
    },
    {
      name: "a package whose name merely starts with effect",
      filename: DOMAIN,
      code: `import { x } from "effect-schema-extras";`,
      options,
      errors: [{ messageId: "impureDomainPackage" }],
    },
  ],

  legal: [
    {
      name: "effect and its stable modules, which every domain is written in",
      filename: DOMAIN,
      code: `import { Schema } from "effect";\nimport * as Option from "effect/Option";\nimport { Model } from "effect/schema";`,
      options,
    },
    {
      name: "a core domain subpath, as the export map declares it",
      filename: DOMAIN,
      code: `import { placeKey } from "@tastebud/core/places";`,
      options,
    },
    {
      name: "a type-only import is erased",
      filename: DOMAIN,
      code: `import type { Document } from "yaml";`,
      options,
    },
    {
      name: "the tree's own modules are import-policy's subject, not this rule's",
      filename: DOMAIN,
      code: `import { inputText } from "#core/shared/input-text";\nimport { other } from "./record-times";`,
      options,
    },
    {
      name: "an operation may import any package; only domains and shared are pure",
      filename: "/repo/packages/core/src/features/recall/operations/recall.ts",
      code: `import { parse } from "yaml";`,
      options,
    },
    {
      name: "a domain in another tree is outside this rule's subject",
      filename: "/repo/packages/cli/src/domains/acme-demo-story/demo-config.ts",
      code: `import { join } from "node:path";`,
      options,
    },
  ],
});
