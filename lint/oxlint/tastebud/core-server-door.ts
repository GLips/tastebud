// ─── tastebud/core-server-door ───────────────────────────────────────────
//
// Makes sure: each shell reaches core's server code through one module. Outside
// core, a runtime import of `@tastebud/core` or a non-domain subpath is allowed only
// in `infrastructure/tastebud-core.ts` (server-only trees) or
// `infrastructure/tastebud-core.server.ts` (review). In review, only a
// `features/*/repo/*.server.ts` module may import that door.
//
// LOOKS WRONG: not a `boundary/sdk-containment` row, because that table sees one
// package name and cannot tell `@tastebud/core/places` from `@tastebud/core/recall`.
//
// NEGATIVE SPACE: type-only imports pass; they are erased.
// ──────────────────────────────────────────────────────────────────────

import { posix } from "node:path";

import { isAtProfile, isModule } from "../../policy/declared-trees.ts";
import {
  aliasSpecifierFor,
  isServerModule,
  normalizeSourcePath,
  type TreeVocabulary,
  withoutSourceExtension,
} from "../../policy/layout.ts";
import { defineTreeRule } from "../lib/define-tree-rule.ts";
import { isTypeOnlyDeclaration, visitModuleSources } from "../lib/module-source-visitor.ts";
import {
  CORE_EXPORTS_SCHEMA,
  CORE_TREE_ROOT,
  coreExportsOption,
  isCoreDomainSubpath,
  namesCorePackage,
} from "./core-exports.ts";

/** The door's module path from the source root: server-marked wherever a browser bundle exists. */
function doorModule(vocabulary: TreeVocabulary): string {
  const suffix = vocabulary.serverOnly ? "" : vocabulary.serverModuleSuffix;
  return `${vocabulary.infrastructureDir}/tastebud-core${suffix}`;
}

/** The module path a specifier names inside this tree, or undefined for a package. */
function targetModule(vocabulary: TreeVocabulary, sourcePath: string, specifier: string): string | undefined {
  if (specifier.startsWith(vocabulary.aliasPrefix)) {
    return normalizeSourcePath(specifier.slice(vocabulary.aliasPrefix.length));
  }
  if (!specifier.startsWith(".")) return undefined;
  return normalizeSourcePath(posix.join(posix.dirname(sourcePath), specifier));
}

export const coreServerDoorRule = defineTreeRule({
  meta: {
    type: "problem",
    schema: CORE_EXPORTS_SCHEMA,
    messages: {
      coreServerImportOutsideDoor:
        '"{{specifier}}" is core server code, and this shell reaches it only through {{door}}. Export what you need from there; outside it, import only pure domain subpaths (@tastebud/core/<domain>).',
      doorImportOutsideRepo:
        "{{door}} is reached only from a feature's repo/*.server.ts module. Call the repo through the service layer instead, so the browser bundle never sees core's server code.",
    },
  },
  create(context, role) {
    if (role.tree.root === CORE_TREE_ROOT) return {};
    const { vocabulary } = role.tree;
    const coreExports = coreExportsOption(context.options[0]);
    const door = doorModule(vocabulary);
    const doorSpecifier = aliasSpecifierFor(vocabulary, door);
    if (isModule(role, door)) return {};
    const mayImportDoor =
      vocabulary.serverOnly || (isAtProfile(role, "feature-repo") && isServerModule(vocabulary, role.sourcePath));

    return visitModuleSources((source, specifier) => {
      if (source.parent !== null && source.parent !== undefined && isTypeOnlyDeclaration(source.parent)) return;
      if (namesCorePackage(specifier) && !isCoreDomainSubpath(specifier, coreExports)) {
        context.report({
          node: source,
          messageId: "coreServerImportOutsideDoor",
          data: { specifier, door: doorSpecifier },
        });
        return;
      }
      const target = targetModule(vocabulary, role.sourcePath, specifier);
      if (target === undefined || mayImportDoor || withoutSourceExtension(target) !== door) return;
      context.report({ node: source, messageId: "doorImportOutsideRepo", data: { door: doorSpecifier } });
    });
  },
});
