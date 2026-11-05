// Tastebud's structural-tier knobs. Where the architecture lives is in
// `lint/policy/declared-trees.ts`; this file holds only numbers, names and
// manifests. Spread `defaultCheckConfigs`, then replace whole values, so an
// override reads in the diff as the complete value it stands in for.

import { resolve } from "node:path";

import { DECLARED_TREES } from "../policy/declared-trees.ts";
import { type ArchitectureConfig, defaultCheckConfigs } from "./config.ts";
import { readThemeScaleFromSource } from "./theme-scale.ts";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const REVIEW_THEME_MODULE = resolve(PROJECT_ROOT, "apps/review/src/shared/ui/theme.ts");

export const architectureConfig: ArchitectureConfig = {
  projectRoot: PROJECT_ROOT,

  checks: {
    ...defaultCheckConfigs,

    "api/barrel-purity": {
      ...defaultCheckConfigs["api/barrel-purity"],
      // `@tastebud/core/<feature>` subpaths are not listed: entries match by package
      // name, so naming `@tastebud/core` would also fence the domain barrels review may
      // import. `tastebud/core-server-door` covers those subpaths instead.
      serverOnlyPackages: ["bun:sqlite", "yaml", "@modelcontextprotocol/server", "@tastebud/mcp"],
      // A trace that hits the bound ends UNKNOWN rather than clean, so the
      // catalog's 6 fails on arithmetic. 16 is tk2's value; it bounds cost only.
      maxTraceDepth: 16,
    },

    // Every cross-feature edge is granted by name in the importee's
    // `visibility.json`, so an edge count says nothing a grant does not. Pair
    // saturation stays: it is about one edge and has an owner.
    "graph/feature-deps": {
      ...defaultCheckConfigs["graph/feature-deps"],
      totalEdgeThreshold: Number.POSITIVE_INFINITY,
      fanOutThreshold: Number.POSITIVE_INFINITY,
    },

    "health/file-size": {
      ...defaultCheckConfigs["health/file-size"],
      // Every declared tree plus the undeclared code a human still maintains here.
      // The rest of lint/ is the vendored catalog: its file shapes follow upstream,
      // and splitting them here would turn every catalog sync into a merge.
      roots: [...DECLARED_TREES.map((tree) => tree.root), "test", "scripts", "lint/oxlint/tastebud"],
    },

    // The default root-level `shadows.css` is rejected by `placement/topology`;
    // the theme module is review's one curated visual source.
    "style/shadow-source": {
      ...defaultCheckConfigs["style/shadow-source"],
      allowedFile: "shared/ui/theme.ts",
    },

    // Read from the theme source, never restated, so the check cannot drift from
    // the scale it guards. Throws until review's theme exports both scales.
    "style/token-equality": {
      ...defaultCheckConfigs["style/token-equality"],
      spacingScale: readThemeScaleFromSource({ path: REVIEW_THEME_MODULE, exportName: "spacing" }),
      radiusScale: readThemeScaleFromSource({ path: REVIEW_THEME_MODULE, exportName: "radius" }),
    },
  },
};
