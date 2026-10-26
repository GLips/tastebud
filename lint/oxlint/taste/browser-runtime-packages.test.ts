import { describeRule } from "../lib/rule-spec.ts";
import { browserRuntimePackagesRule } from "./browser-runtime-packages.ts";

const UI = "/repo/apps/review/src/features/places/ui/places-page.tsx";
const ROUTE = "/repo/apps/review/src/routes/places.tsx";
const SHARED_UI = "/repo/apps/review/src/shared/ui/place-chips.tsx";

describeRule("taste/browser-runtime-packages", browserRuntimePackagesRule, {
  obvious: [
    {
      name: "a review page importing Effect's HTTP platform area",
      filename: UI,
      code: `import { HttpClient } from "effect/http";`,
      errors: [{ messageId: "serverSubpathInBrowserCode" }],
    },
    {
      name: "a route reading the request through the server entry of Start",
      filename: ROUTE,
      code: `import { getRequest } from "@tanstack/react-start/server";`,
      errors: [{ messageId: "serverSubpathInBrowserCode" }],
    },
  ],

  adversarial: [
    {
      name: "a deep path into the process area, which an exact-match list misses",
      filename: SHARED_UI,
      code: `import * as ChildProcess from "effect/process/ChildProcess";`,
      errors: [{ messageId: "serverSubpathInBrowserCode" }],
    },
    {
      name: "a shared helper re-exporting it, which reaches every page that imports the helper",
      filename: "/repo/apps/review/src/shared/format.ts",
      code: `export { SqlClient } from "effect/sql";`,
      errors: [{ messageId: "serverSubpathInBrowserCode" }],
    },
    {
      name: "a dynamic import in the root route",
      filename: "/repo/apps/review/src/routes/__root.tsx",
      code: `export const load = () => import("@tanstack/react-start/server");`,
      errors: [{ messageId: "serverSubpathInBrowserCode" }],
    },
  ],

  legal: [
    {
      name: "pure effect modules and the client half of Start",
      filename: UI,
      code: `import { Option } from "effect";\nimport * as Schema from "effect/Schema";\nimport { createServerFn } from "@tanstack/react-start";`,
    },
    {
      name: "a type-only import is erased",
      filename: UI,
      code: `import type { HttpClient } from "effect/http";`,
    },
    {
      name: "a repo .server.ts module runs on the server",
      filename: "/repo/apps/review/src/features/places/repo/places-audit.server.ts",
      code: `import { getRequest } from "@tanstack/react-start/server";`,
    },
    {
      name: "a controller is a server context",
      filename: "/repo/apps/review/src/features/places/controllers/places-audit.ts",
      code: `import { HttpClient } from "effect/http";`,
    },
    {
      name: "the CLI tree has no browser half",
      filename: "/repo/packages/cli/src/features/cli-operations/controllers/run-cli-operation.ts",
      code: `import { ChildProcess } from "effect/process";`,
    },
    {
      name: "a sibling package whose name merely starts like Start",
      filename: UI,
      code: `import { x } from "@tanstack/react-start-server-utils";`,
    },
  ],
});
