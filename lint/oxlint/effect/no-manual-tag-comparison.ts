// ─── effect/no-manual-tag-comparison ──────────────────────────────────
//
// Makes sure: Adding a variant to a tagged union is a compile error at every
// site that branches on it. `Match.valueTags`, `Match.tagsExhaustive` and a
// tagged enum's `$match` refuse to typecheck until the new tag has a branch.
// A chain of `x._tag === "A"` tests, or a `switch (x._tag)` with a default,
// compiles unchanged and sends the new variant down whichever branch is last.
//
// Ported from humanlayer/effect-channels' anti-slop rule of the same name,
// with two changes. Comparisons inside a broad `Effect.catch` handler report
// here too: recovering one error by tag is `Effect.catchTag`'s job, so that
// handler is the site this rule most wants to move. And the subject is any
// equality against a `_tag` read, not only one against a string literal, so
// `x._tag === RUN` reports alongside the literal spelling.
//
// The fixes, by shape:
//   - several variants             → `Match.valueTags(x, { A: …, B: … })`
//   - one variant, narrowing       → `Predicate.isTagged(x, "A")`
//   - one error, recovering        → `Effect.catchTag("A", …)`
// Effect types `isTagged`'s tag as any string; `effect/is-tagged-known-tag`
// (structural) checks it against the subject's union.
// In JSX, a two-way split stays inline as a `Predicate.isTagged(x, "A") ? … : …`
// ternary. Three or more variants take `Match.valueTags`; returning its markup
// inline trips `react/no-unstable-nested-components` (a false positive: the
// arms are called at once), so return the Match from a component of its own.
//
// NEGATIVE SPACE:
//   - `a._tag === b._tag` is silent. It asks whether two values are the same
//     variant, which no Match form spells and no new variant changes.
//   - A tag read used as a table key — `handlers[x._tag]` — is silent. A
//     `Record<Tag, Handler>` table is itself exhaustive at its declaration.
//   - A tag passed to a call is silent: `RETRYABLE_TAGS.has(x._tag)` reads the
//     tag as a value against a named set, which is one address to extend. An
//     inline list — `["A", "B"].includes(x._tag)`, `new Set([…]).has(x._tag)` —
//     reports: it is the comparison chain respelled, with no address.
//   - A `switch` on any other discriminant (`.kind`, `.verb`) is out of scope.
//   - Building a tagged literal (`{ _tag: "Skip" }`) is not a comparison and is
//     not a subject; the compiler checks it against its union already.
//   - A tag read through a renamed destructure (`const { _tag: kind } = x`) is
//     not followed. `_tag` destructured under its own name is.
//
// SCOPE: tree-scoped, like every rule here but `testing/no-module-mocking`.
// `lib/define-tree-rule.ts` makes it silent outside the declared trees and on
// tests, scripts, generated and ambient modules.
// ──────────────────────────────────────────────────────────────────────

import { defineTreeRule } from "../lib/define-tree-rule.ts";
import { staticKeyName } from "../lib/static-key-name.ts";
import { type ESTree } from "@oxlint/plugins";

const TAG_KEY = "_tag";
const EQUALITY_OPERATORS = new Set(["==", "===", "!=", "!=="]);

/** `x._tag`, `x?._tag`, `x["_tag"]`, or a bare `_tag` binding destructured under its own name. */
function readsTag(node: ESTree.Node): boolean {
  const target = node.type === "ChainExpression" ? node.expression : node;
  if (target.type === "Identifier") return target.name === TAG_KEY;
  return (
    target.type === "MemberExpression" &&
    staticKeyName(target.property, target.computed) === TAG_KEY
  );
}

/** `[…]`, or `new Set([…])` built in place: a list with no name to extend it at. */
function isInlineList(node: ESTree.Node): boolean {
  if (node.type === "ArrayExpression") return true;
  if (node.type !== "NewExpression") return false;
  const [first] = node.arguments;
  return (
    node.callee.type === "Identifier" &&
    node.callee.name === "Set" &&
    first !== undefined &&
    first.type === "ArrayExpression"
  );
}

export const noManualTagComparisonRule = defineTreeRule({
  meta: {
    type: "problem",
    messages: {
      manualComparison:
        "Comparing `_tag` by hand compiles unchanged when the union grows a variant, which then falls through to whichever branch is last. Dispatch with Match.valueTags / Match.tagsExhaustive (or a tagged enum's $match), narrow one variant with Predicate.isTagged, and recover one error with Effect.catchTag.",
      inlineTagList:
        "Testing `_tag` against an inline list of tags is a comparison chain by another spelling: a new variant compiles unchanged. Decide every variant with Match.valueTags or a Record<Tag, boolean> table, or name the set once as a constant.",
      manualSwitch:
        "A `switch` on `_tag` compiles unchanged when the union grows a variant. Use Match.valueTags(value, { … }) or Match.value(value).pipe(Match.tagsExhaustive({ … })), or a tagged enum's $match, so the new variant is a compile error here.",
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (!EQUALITY_OPERATORS.has(node.operator)) return;
        const left = readsTag(node.left);
        const right = readsTag(node.right);
        // Exactly one side: two tag reads compare variants with each other, not against a name.
        if (left !== right) context.report({ node, messageId: "manualComparison" });
      },

      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        const method = staticKeyName(callee.property, callee.computed);
        if (method !== "includes" && method !== "has") return;
        const [argument] = node.arguments;
        if (argument === undefined || !readsTag(argument)) return;
        if (isInlineList(callee.object)) context.report({ node, messageId: "inlineTagList" });
      },

      SwitchStatement(node) {
        if (readsTag(node.discriminant)) context.report({ node, messageId: "manualSwitch" });
      },
    };
  },
});
