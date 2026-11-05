// ─── tastebud/browser-runtime-packages ───────────────────────────────────
//
// Makes sure: review code the browser loads (routes, feature ui/, shared/,
// shared/ui/) never imports an impure `effect` area (`effect/http`, `effect/process`,
// see `pure-effect-specifiers.ts`) or `@tanstack/react-start/server` at runtime. `api/barrel-purity` lists packages, not subpaths, and Vite's import
// protection fires only at build time; this fires in the editor.
//
// NEGATIVE SPACE: `*.server.ts` modules are server contexts and pass, as do
// type-only imports. Trees with no router (core, cli, mcp) have no browser half.
// ──────────────────────────────────────────────────────────────────────

import { isAtProfile, isServerContext } from "../../policy/declared-trees.ts";
import { isUnderPath } from "../../policy/layout.ts";
import { defineTreeRule } from "../lib/define-tree-rule.ts";
import { isTypeOnlyDeclaration, visitModuleSources } from "../lib/module-source-visitor.ts";
import { isPureEffectSpecifier, namesEffectPackage } from "./pure-effect-specifiers.ts";

const START_SERVER_ENTRY = "@tanstack/react-start/server";

function isServerOnlySpecifier(specifier: string): boolean {
  if (namesEffectPackage(specifier)) return !isPureEffectSpecifier(specifier);
  return isUnderPath(specifier, START_SERVER_ENTRY);
}

export const browserRuntimePackagesRule = defineTreeRule({
  meta: {
    type: "problem",
    messages: {
      serverSubpathInBrowserCode:
        '"{{specifier}}" is server-only and this module ships to the browser. Reach it from a controller or a repo/*.server.ts module, and hand the browser the result.',
    },
  },
  create(context, role) {
    if (role.tree.vocabulary.serverOnly || role.tree.vocabulary.rootRouteName === null) return {};
    if (!isAtProfile(role, "route", "root-route", "feature-ui", "shared", "shared-ui")) return {};
    if (isServerContext(role)) return {};
    return visitModuleSources((source, specifier) => {
      if (!isServerOnlySpecifier(specifier)) return;
      if (source.parent !== null && source.parent !== undefined && isTypeOnlyDeclaration(source.parent)) return;
      context.report({ node: source, messageId: "serverSubpathInBrowserCode", data: { specifier } });
    });
  },
});
