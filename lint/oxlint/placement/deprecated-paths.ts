// ─── placement/deprecated-paths ─────────────────────────────────────────
//
// Makes sure: No file imports a path that a migration removed. You delete
// a module once and it stays deleted, because the next import of it
// fails the lint and the message names the directory that
// holds the code now. You do not search the tree for old paths after each
// change an agent writes.
//
// Each deprecated path keeps its own messageId. The message is the fix
// instruction, thus it names the old path and the exact directory the code
// moved to. One shared "this path is deprecated" message sends the reader
// somewhere else for the answer.
//
// Delete an entry only after the last import of that path is gone. An entry
// removed while agents still write the old path from memory is the point where
// the migration reverses, and no report follows.
//
// The rule reads the specifier and says the old path is gone. Whether the new
// path is one this file may import at all is boundary/import-policy's finding.
//
// SCOPE, and it is the same for every TREE-SCOPED rule in this catalog — which
// is every rule but `testing/no-module-mocking`, whose subject is a test file and
// which is therefore enabled globally. This rule is silent outside the declared
// trees, and silent on the files `isArchitectureExemptSourcePath` names inside
// them — tests, scripts, generated and ambient modules. Neither
// silence is coverage. `lib/define-tree-rule.ts` owns both, which is why no rule
// body checks either one.
// ──────────────────────────────────────────────────────────────────────

import { aliasSpecifierFor } from "../../policy/layout.ts";
import { defineTreeRule } from "../lib/define-tree-rule.ts";
import { visitModuleSources } from "../lib/module-source-visitor.ts";

// Anchored at the head of the specifier and closed on a slash OR the end of it. Both alternatives
// are load-bearing: the bare spelling (`#core/store`) is the one reproduced from memory, and a
// pattern closed on the slash alone approves it. Requiring a separator keeps a live module whose
// name merely starts the same way (`#core/store-host`) out of the deprecation.
//
// Only alias and package forms are fenced. A relative specifier resolves against the importing
// file's own directory, and a per-file lint has no project root to resolve it against.
//
// Tastebud's entries: the core root barrel and two renamed domain subpaths (shells and tests imported
// them by package name), and core's flat modules, which moved into features/, domains/ and
// infrastructure/. `shared/` survives, so only its three moved files are listed.
const CORE_FLAT_MODULES = [
  "caller",
  "capture",
  "catalog",
  "config",
  "decide",
  "errors",
  "frontmatter",
  "hook-payload",
  "ids",
  "inbox",
  "index-db",
  "index",
  "lifecycle",
  "list",
  "listener",
  "operation",
  "place-resolution",
  "places-audit",
  "prompts",
  "propose",
  "recall-explain",
  "recall",
  "records",
  "render",
  "repeat-check",
  "repoint",
  "review-url",
  "revise-scope",
  "scope-input",
  "show",
  "similarity",
  "store-files",
  "store",
  "threads",
  "view-schemas",
  "views",
  "shared/places",
  "shared/vocabulary",
  "shared/catalog-view",
];

const DEPRECATED_PATHS = [
  { pattern: /^@tastebud\/core$/, messageId: "coreRootBarrelRemoved" },
  { pattern: /^@tastebud\/core\/vocabulary(\/|$)/, messageId: "coreVocabularyRenamed" },
  { pattern: /^@tastebud\/core\/catalog-view(\/|$)/, messageId: "coreCatalogViewRenamed" },
  {
    pattern: new RegExp(`^#core/(${CORE_FLAT_MODULES.join("|")})(/|$)`),
    messageId: "coreFlatModuleMoved",
  },
] as const;

export const deprecatedPathsRule = defineTreeRule({
  meta: {
    type: "problem",
    messages: {
      coreRootBarrelRemoved:
        "The @tastebud/core root export no longer exists. Import a pure domain subpath (@tastebud/core/<domain>), or a feature subpath through this shell's {{infrastructure}}/tastebud-core door.",
      coreVocabularyRenamed:
        "@tastebud/core/vocabulary is now @tastebud/core/taste-vocabulary. Import from there instead.",
      coreCatalogViewRenamed:
        "@tastebud/core/catalog-view is now part of @tastebud/core/kind-catalog. Import from there instead.",
      coreFlatModuleMoved:
        "Core's flat modules no longer exist. The code moved to #core/features/<feature>/ (operations), #core/domains/<domain>/ (pure logic) or #core/infrastructure/ (IO). Import it from its new home.",
    },
  },
  create(context, role) {
    const { vocabulary } = role.tree;
    const data = {
      infrastructure: aliasSpecifierFor(vocabulary, vocabulary.infrastructureDir),
    };

    return visitModuleSources((source, specifier) => {
      for (const { pattern, messageId } of DEPRECATED_PATHS) {
        if (pattern.test(specifier)) context.report({ node: source, messageId, data });
      }
    });
  },
});
