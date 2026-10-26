// Walks every read rooted at an ambient global (`Date.now`, `globalThis.Bun.spawn`,
// `const { now } = performance`) and hands each member path to the caller. The same
// reference-based walk `boundary/ambient-globals` uses, shared by the two taste/ rules
// that fence ambient capabilities.
//
// NEGATIVE SPACE: an alias (`const D = Date; D.now()`) is not followed. The read is
// reported nowhere, and the spec's legal list says so.

import type { ESTree, Reference, SourceCode } from "@oxlint/plugins";

import { staticKeyName } from "../lib/static-key-name.ts";
import { isTransparentWrapper } from "../lib/transparent-wrappers.ts";

const GLOBAL_OBJECT_HOSTS = new Set(["globalThis", "global", "window", "self"]);

/** Unresolved references plus declared-but-undefined globals; see `boundary/ambient-globals`. */
function ambientGlobalReferences(sourceCode: SourceCode): Reference[] {
  const globalScope = sourceCode.scopeManager.globalScope;
  if (globalScope === null) return [];
  const declared = [...globalScope.set.values()].filter((variable) => variable.defs.length === 0);
  return [...globalScope.through, ...declared.flatMap((variable) => variable.references)];
}

/**
 * Calls `onPath` for each step of each ambient read, outward from the global: `Date`, then
 * `Date.now`. Returning true stops that read's walk, so a caller reports the shortest match once.
 * Call it from the rule's own `Program:exit`, when scope analysis is complete.
 */
export function walkAmbientReads(sourceCode: SourceCode, onPath: (node: ESTree.Node, path: string) => boolean): void {
  for (const reference of ambientGlobalReferences(sourceCode)) {
    const name = reference.identifier.name;
    walkOutward(reference.identifier, GLOBAL_OBJECT_HOSTS.has(name) ? "" : name, onPath);
  }
}

function walkOutward(root: ESTree.Node, rootPath: string, onPath: (node: ESTree.Node, path: string) => boolean): void {
  let node = root;
  let path = rootPath;
  for (;;) {
    if (path !== "" && onPath(node, path)) return;
    const parent: ESTree.Node | null | undefined = node.parent;
    if (parent === null || parent === undefined) return;
    if (isTransparentWrapper(parent) && parent.expression === node) {
      node = parent;
      continue;
    }
    if (parent.type === "MemberExpression" && parent.object === node) {
      const key = staticKeyName(parent.property, parent.computed);
      if (key === undefined) return;
      path = path === "" ? key : `${path}.${key}`;
      node = parent;
      continue;
    }
    if (parent.type === "VariableDeclarator" && parent.init === node && parent.id.type === "ObjectPattern") {
      for (const property of parent.id.properties) {
        if (property.type !== "Property") continue;
        const key = staticKeyName(property.key, property.computed);
        if (key !== undefined) onPath(property, path === "" ? key : `${path}.${key}`);
      }
    }
    return;
  }
}
