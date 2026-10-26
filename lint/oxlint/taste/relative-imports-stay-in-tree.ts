// ─── taste/relative-imports-stay-in-tree ──────────────────────────────
//
// Makes sure: a relative specifier in a declared tree resolves inside that
// tree. `../../../core/src/domains/...` from the CLI reaches core's files past
// its export map, and the `no-restricted-imports` path ban only sees
// specifiers that spell `packages/*/src`. Another package is reached by name.
//
// NEGATIVE SPACE: type-only imports are reported too; a type reached by path
// still bypasses the export map. Package and alias specifiers are not relative.
// ──────────────────────────────────────────────────────────────────────

import { dirname, resolve } from "node:path";

import { isUnderPath } from "../../policy/layout.ts";
import { defineTreeRule } from "../lib/define-tree-rule.ts";
import { visitModuleSources } from "../lib/module-source-visitor.ts";

export const relativeImportsStayInTreeRule = defineTreeRule({
  meta: {
    type: "problem",
    messages: {
      relativeImportLeavesTree:
        '"{{specifier}}" resolves outside {{treeRoot}}. Reach another workspace package by its name and export map (`@taste/core/<subpath>`), never by a relative path.',
    },
  },
  create(context, role) {
    const filename = context.filename;
    const treeRoot = filename.slice(0, filename.length - role.sourcePath.length).replace(/\/$/, "");
    return visitModuleSources((source, specifier) => {
      if (!specifier.startsWith(".")) return;
      if (isUnderPath(resolve(dirname(filename), specifier), treeRoot)) return;
      context.report({
        node: source,
        messageId: "relativeImportLeavesTree",
        data: { specifier, treeRoot: role.tree.root },
      });
    });
  },
});
