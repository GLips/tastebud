import { describeRule } from "../lib/rule-spec.ts";
import { routeThinnessRule } from "./route-thinness.ts";

const ROUTE = "/repo/apps/review/src/routes/invoices.tsx";
const NESTED_ROUTE = "/repo/apps/review/src/routes/admin/settings.tsx";
// Review declares no env module, so the rule's env arm has no subject in this
// repo; every case here exercises the DB arm.
const IMPORT_DB = `import { db } from "#review/infrastructure/db";`;

describeRule("boundary/route-thinness", routeThinnessRule, {
  obvious: [
    {
      name: "a route reaching straight past the feature layer to the DB",
      filename: ROUTE,
      code: IMPORT_DB,
      errors: [{ message: "Routes are isomorphic thin adapters. Import data through the client-safe feature barrel (#review/features/<feature>), not #review/infrastructure/db." }],
    },
  ],

  adversarial: [
    {
      name: "a dynamic import is a call expression, not an import declaration",
      filename: ROUTE,
      code: `export const loader = async () => (await import("#review/infrastructure/db")).db;`,
      errors: [{ messageId: "serverOnlyImportInRoute" }],
    },
    {
      name: "a re-export carries the same runtime dependency an import does",
      filename: ROUTE,
      code: `export { db } from "#review/infrastructure/db";`,
      errors: [{ messageId: "serverOnlyImportInRoute" }],
    },
    {
      name: "a star re-export names no binding to notice",
      filename: ROUTE,
      code: `export * from "#review/infrastructure/db/schema/invoices";`,
      errors: [{ messageId: "serverOnlyImportInRoute" }],
    },
    {
      name: "a type-only import still couples the route to the schema's shape",
      filename: ROUTE,
      code: `import type { Invoice } from "#review/infrastructure/db/schema/invoices";`,
      errors: [{ messageId: "serverOnlyImportInRoute" }],
    },
    {
      name: "the DB module has subpaths, so matching the client module alone misses the schema",
      filename: NESTED_ROUTE,
      code: `import { invoices } from "#review/infrastructure/db/schema/invoices";`,
      errors: [{ messageId: "serverOnlyImportInRoute" }],
    },
    {
      name: "a route nested two directories deep is still the transport layer",
      filename: NESTED_ROUTE,
      code: IMPORT_DB,
      errors: [{ messageId: "serverOnlyImportInRoute" }],
    },
    {
      // The one file a wider import licence could plausibly have exempted.
      name: "the root route has a wider import licence and is not exempt from this one",
      filename: "/repo/apps/review/src/routes/__root.tsx",
      code: IMPORT_DB,
      errors: [{ messageId: "serverOnlyImportInRoute" }],
    },
  ],

  legal: [
    {
      name: "the client-safe feature barrel, which is how a route is meant to get data",
      filename: ROUTE,
      code: `import { billingLabel } from "#review/features/billing";`,
    },
    {
      name: "an infrastructure module whose name merely starts like the DB one",
      filename: ROUTE,
      code: `import { dbtLogger } from "#review/infrastructure/dbt-logger";`,
    },
    {
      name: "an env module whose name merely starts like the server one",
      filename: ROUTE,
      code: `import { flags } from "#review/env.server-flags";`,
    },
    {
      name: "a directory that merely starts with 'routes' is not the routes layer",
      filename: "/repo/apps/review/src/routes-legacy/invoices.tsx",
      code: IMPORT_DB,
    },
    {
      name: "the service layer, which is allowed the dependencies a route is not",
      filename: "/repo/apps/review/src/features/billing/service/charge.ts",
      code: IMPORT_DB,
    },
    {
      name: "a server barrel is api/server-import-context's arm, not a third one here",
      filename: ROUTE,
      code: `import { listInvoices } from "#review/features/billing/index.server";`,
    },
    {
      name: "a route file named .server.ts is a server context that may name a server barrel, so an arm here would deny what that rule permits",
      filename: "/repo/apps/review/src/routes/api.invoices.server.ts",
      code: `import { listInvoices } from "#review/features/billing/index.server";`,
    },
    {
      name: "a route's test may reach across every boundary",
      filename: "/repo/apps/review/src/routes/invoices.test.tsx",
      code: IMPORT_DB,
    },
    {
      name: "an external package that happens to be named after the alias root",
      filename: ROUTE,
      code: `import { connect } from "@infrastructure/db";`,
    },
  ],
});
