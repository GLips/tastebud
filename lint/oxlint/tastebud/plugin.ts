// Tastebud's own oxlint plugin, a second `jsPlugins` entry beside the catalog's `arch` one so its
// rules carry their own `tastebud/` prefix. Project rules live here; nothing under the catalog's
// `lint/oxlint/<tag>/` is edited to add one. `oxlint.config.ts` derives its severity table from
// this list and refuses a config where the two disagree.

import { definePlugin } from "@oxlint/plugins";

import { browserRuntimePackagesRule } from "./browser-runtime-packages.ts";
import { coreServerDoorRule } from "./core-server-door.ts";
import { domainRuntimePackagesRule } from "./domain-runtime-packages.ts";
import { ioOnlyInInfrastructureRule } from "./io-only-in-infrastructure.ts";
import { noAmbientNondeterminismRule } from "./no-ambient-nondeterminism.ts";
import { noLongCommentsRule } from "./no-long-comments.ts";
import { relativeImportsStayInTreeRule } from "./relative-imports-stay-in-tree.ts";

export default definePlugin({
  meta: { name: "tastebud" },
  rules: {
    "browser-runtime-packages": browserRuntimePackagesRule,
    "core-server-door": coreServerDoorRule,
    "domain-runtime-packages": domainRuntimePackagesRule,
    "io-only-in-infrastructure": ioOnlyInInfrastructureRule,
    "no-ambient-nondeterminism": noAmbientNondeterminismRule,
    "no-long-comments": noLongCommentsRule,
    "relative-imports-stay-in-tree": relativeImportsStayInTreeRule,
  },
});
