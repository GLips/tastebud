// ─── taste/domain-runtime-packages ────────────────────────────────────
//
// Makes sure: core's domains and core's shared/ import at runtime only pure
// `effect` specifiers (see `pure-effect-specifiers.ts`) and core's own domain subpaths. Taste widened
// `DOMAIN_RUNTIME_AREAS` by `package` so domains can use Effect Schema; this
// narrows it back. shared/ is covered because domains import it freely and
// domain barrels ship it to the browser.
//
// NEGATIVE SPACE: type-only imports pass; they are erased.
// ──────────────────────────────────────────────────────────────────────

import { isAtProfile } from "../../policy/declared-trees.ts";
import { classifySpecifier } from "../../policy/layout.ts";
import { defineTreeRule } from "../lib/define-tree-rule.ts";
import { isTypeOnlyDeclaration, visitModuleSources } from "../lib/module-source-visitor.ts";
import { CORE_EXPORTS_SCHEMA, CORE_TREE_ROOT, coreExportsOption, isCoreDomainSubpath } from "./core-exports.ts";
import { isPureEffectSpecifier } from "./pure-effect-specifiers.ts";

export const domainRuntimePackagesRule = defineTreeRule({
  meta: {
    type: "problem",
    schema: CORE_EXPORTS_SCHEMA,
    messages: {
      impureDomainPackage:
        '"{{specifier}}" is not a pure package. Core domains and shared/ run in the browser through domain barrels and in tests without IO, so at runtime they import only `effect`, its root modules, `effect/schema`, `effect/encoding` and core domain subpaths. Take what this needs as a parameter from the operation that calls it.',
    },
  },
  create(context, role) {
    if (role.tree.root !== CORE_TREE_ROOT || !isAtProfile(role, "domain", "shared")) return {};
    const coreExports = coreExportsOption(context.options[0]);
    return visitModuleSources((source, specifier) => {
      if (classifySpecifier(role.tree.vocabulary, specifier)?.kind !== "package") return;
      if (source.parent !== null && source.parent !== undefined && isTypeOnlyDeclaration(source.parent)) return;
      if (isPureEffectSpecifier(specifier) || isCoreDomainSubpath(specifier, coreExports)) return;
      context.report({ node: source, messageId: "impureDomainPackage", data: { specifier } });
    });
  },
});
