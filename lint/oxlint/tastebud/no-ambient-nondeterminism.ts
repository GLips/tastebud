// ─── tastebud/no-ambient-nondeterminism ──────────────────────────────────
//
// Makes sure: domains, shared helpers and feature layers never read the wall
// clock or a random source directly. Time comes from Effect `Clock` and ids from
// `infrastructure/record-ids`, so a test pins both. `shared/` is in scope so a
// helper cannot launder `Date.now()` into a domain that imports it.
//
// NEGATIVE SPACE: `new Date(x)` with an argument is a conversion and passes.
// An alias (`const D = Date`) is not followed. Module imports of `node:crypto`
// are `tastebud/io-only-in-infrastructure`'s finding.
// ──────────────────────────────────────────────────────────────────────

import type { ESTree } from "@oxlint/plugins";

import { isAtProfile } from "../../policy/declared-trees.ts";
import { defineTreeRule } from "../lib/define-tree-rule.ts";
import { visitImportedNames } from "../lib/imported-names.ts";
import { walkAmbientReads } from "./ambient-reads.ts";
import { mergeVisitors } from "./merge-visitors.ts";

const NONDETERMINISTIC_PATHS = new Set([
  "Date.now",
  "performance.now",
  "Math.random",
  "crypto.randomUUID",
  "crypto.getRandomValues",
]);

const PERF_HOOKS_MODULES = ["node:perf_hooks", "perf_hooks"];

/** True when `node` is the callee of `new Date()` or `Date()` with no arguments: the current time. */
function constructsCurrentDate(node: ESTree.Node): boolean {
  const parent = node.parent;
  if (parent === null || parent === undefined) return false;
  if (parent.type !== "NewExpression" && parent.type !== "CallExpression") return false;
  return parent.callee === node && parent.arguments.length === 0;
}

export const noAmbientNondeterminismRule = defineTreeRule({
  meta: {
    type: "problem",
    messages: {
      ambientNondeterminism:
        "`{{path}}` reads the wall clock or a random source, which a test cannot pin. Use Effect's Clock (`Clock.currentTimeMillis`, `DateTime.now`) for time and the record-ids adapter for ids, passed in from the operation.",
    },
  },
  create(context, role) {
    if (!isAtProfile(role, "domain", "shared", "feature-controllers", "feature-service", "feature-repo")) {
      return {};
    }
    const report = (node: ESTree.Node, path: string) =>
      context.report({ node, messageId: "ambientNondeterminism", data: { path } });

    const perfHooks = visitImportedNames(context.sourceCode, PERF_HOOKS_MODULES, (name, node) => {
      if (name === "performance") report(node, "performance");
    });
    const ambientReads = {
      "Program:exit"() {
        walkAmbientReads(context.sourceCode, (node, path) => {
          if (path === "Date" && constructsCurrentDate(node)) {
            report(node.parent ?? node, "new Date()");
            return true;
          }
          if (!NONDETERMINISTIC_PATHS.has(path)) return false;
          report(node, path);
          return true;
        });
      },
    };
    return mergeVisitors(perfHooks, ambientReads);
  },
});
