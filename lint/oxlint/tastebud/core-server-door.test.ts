import { describeRule } from "../lib/rule-spec.ts";
import { coreServerDoorRule } from "./core-server-door.ts";

const options = [
  {
    coreExports: {
      "./places": "./src/domains/places/index.ts",
      "./host": "./src/features/store-host/index.server.ts",
      "./operations": "./src/features/operation-registry/index.server.ts",
    },
  },
];
const CLI_CONTROLLER = "/repo/packages/cli/src/features/cli-operations/controllers/run-cli-operation.ts";
const REVIEW_SERVICE = "/repo/apps/review/src/features/places/service/places-audit.ts";
const REVIEW_REPO = "/repo/apps/review/src/features/places/repo/places-audit.server.ts";

describeRule("tastebud/core-server-door", coreServerDoorRule, {
  obvious: [
    {
      name: "a CLI controller importing the operation registry past the door",
      filename: CLI_CONTROLLER,
      code: `import { runTasteOperation } from "@tastebud/core/operations";`,
      options,
      errors: [
        {
          message:
            '"@tastebud/core/operations" is core server code, and this shell reaches it only through #cli/infrastructure/tastebud-core. Export what you need from there; outside it, import only pure domain subpaths (@tastebud/core/<domain>).',
        },
      ],
    },
    {
      name: "a review service calling the door instead of its repo",
      filename: REVIEW_SERVICE,
      code: `import { runAsReviewer } from "#review/infrastructure/tastebud-core.server";`,
      options,
      errors: [{ messageId: "doorImportOutsideRepo" }],
    },
  ],

  adversarial: [
    {
      name: "the root package, which is no domain",
      filename: "/repo/packages/mcp/src/features/tastebud-tools/controllers/call-tastebud-tool.ts",
      code: `import { describeTasteFailure } from "@tastebud/core";`,
      options,
      errors: [{ messageId: "coreServerImportOutsideDoor" }],
    },
    {
      name: "a subpath the export map does not list is not a domain either",
      filename: "/repo/apps/review/src/features/places/ui/places-page.tsx",
      code: `import { x } from "@tastebud/core/places/internal";`,
      options,
      errors: [{ messageId: "coreServerImportOutsideDoor" }],
    },
    {
      name: "the door reached by a relative path rather than the alias",
      filename: "/repo/apps/review/src/features/places/controllers/places-audit.ts",
      code: `import { runAsReviewer } from "../../../infrastructure/tastebud-core.server";`,
      options,
      errors: [{ messageId: "doorImportOutsideRepo" }],
    },
    {
      name: "a review door spelled without the server suffix is not the door",
      filename: "/repo/apps/review/src/infrastructure/tastebud-core.ts",
      code: `export { runTasteOperation } from "@tastebud/core/operations";`,
      options,
      errors: [{ messageId: "coreServerImportOutsideDoor" }],
    },
    {
      name: "a repo module without the .server suffix ships to the browser",
      filename: "/repo/apps/review/src/features/places/repo/places-audit.ts",
      code: `import { runAsReviewer } from "#review/infrastructure/tastebud-core.server";`,
      options,
      errors: [{ messageId: "doorImportOutsideRepo" }],
    },
    {
      name: "a dynamic import past the door",
      filename: CLI_CONTROLLER,
      code: `export const host = () => import("@tastebud/core/host");`,
      options,
      errors: [{ messageId: "coreServerImportOutsideDoor" }],
    },
  ],

  legal: [
    {
      name: "the CLI door itself",
      filename: "/repo/packages/cli/src/infrastructure/tastebud-core.ts",
      code: `export { runTasteOperation } from "@tastebud/core/operations";\nexport { tasteStoreFromEnv } from "@tastebud/core/host";`,
      options,
    },
    {
      name: "the review door itself",
      filename: "/repo/apps/review/src/infrastructure/tastebud-core.server.ts",
      code: `export { tasteStoreFromEnv } from "@tastebud/core/host";`,
      options,
    },
    {
      name: "a review repo module reaching core through the door",
      filename: REVIEW_REPO,
      code: `import { runAsReviewer } from "#review/infrastructure/tastebud-core.server";`,
      options,
    },
    {
      name: "a CLI controller through its door",
      filename: CLI_CONTROLLER,
      code: `import { runTasteOperation } from "#cli/infrastructure/tastebud-core";`,
      options,
    },
    {
      name: "a pure domain subpath anywhere, including review UI",
      filename: "/repo/apps/review/src/features/places/ui/places-page.tsx",
      code: `import { placeKey } from "@tastebud/core/places";`,
      options,
    },
    {
      name: "a type-only import of core's server types is erased",
      filename: REVIEW_SERVICE,
      code: `import type { TasteOperationResult } from "@tastebud/core/operations";`,
      options,
    },
    {
      name: "core itself is not a shell",
      filename: "/repo/packages/core/src/features/store-host/operations/taste-store-from-env.ts",
      code: `import { TasteStore } from "@tastebud/core/operations";`,
      options,
    },
    {
      name: "tests import whatever they exercise",
      filename: "/repo/test/cli.test.ts",
      code: `import { runTasteOperation } from "@tastebud/core/operations";`,
      options,
    },
  ],
});
