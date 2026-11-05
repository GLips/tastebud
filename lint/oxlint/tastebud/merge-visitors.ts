import type { Visitor } from "@oxlint/plugins";

/**
 * Combines visitors so a key two of them share runs both handlers. A spread would keep only the
 * last one's: `visitModuleSources` and `visitImportedNames` both own `CallExpression` and
 * `ImportExpression`, and spreading them silently drops a whole arm.
 */
export function mergeVisitors(...visitors: Visitor[]): Visitor {
  const handlers = new Map<string, ((node: never) => void)[]>();
  for (const visitor of visitors) {
    for (const [key, handler] of Object.entries(visitor)) {
      if (typeof handler !== "function") continue;
      handlers.set(key, [...(handlers.get(key) ?? []), handler]);
    }
  }
  const merged: Visitor = {};
  for (const [key, list] of handlers) {
    Object.assign(merged, { [key]: (node: never) => list.forEach((handler) => handler(node)) });
  }
  return merged;
}
