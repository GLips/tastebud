// ─── effect/is-tagged-known-tag ──────────────────────────────────────
//
// Makes sure: `Predicate.isTagged(value, "Run")` names a tag that `value` can
// actually carry. Effect types the subject as `unknown` and the tag as any
// string, so `isTagged(principal, "Rnu")` compiles, is always false, and a
// negated guard written with it keeps the whole union. The `=== "Run"` it
// replaces was at least checked against the union.
//
// Type-aware, which is why it sits in this tier: the allowed tags are the
// `_tag` literals of the subject's static type, read off each union member.
// Both forms are covered:
//   - data-first: `isTagged(value, "Run")`; the subject is the first argument.
//   - curried: `isTagged("Run")` where a predicate is expected, such as
//     `.filter(…)`; the subject is the first parameter of the contextual
//     function type.
// When the subject has known tags, every tag the argument can be must be among
// them: a literal, or an expression typed as literal tags (`tag:
// Union["_tag"]`, an `as const` tuple's element). A tag typed `string` reports,
// since nothing can check it.
//
// NEGATIVE SPACE:
//   - A subject typed `unknown` or `any`, or with no `_tag` literal on any
//     member, is skipped. Parsing an untyped value by tag is a boundary's job.
//   - A curried call with no contextual function type (stored in a variable
//     first) has no subject to read, and is skipped. So is one inside
//     `Match.when(…)`, whose pattern type gives no subject; write
//     `Match.tag("Run", …)` there, which Match checks itself.
//
// SCOPE: tree-scoped. Walks the declared trees minus what
// `isArchitectureExemptSourcePath` names (tests, scripts, generated, ambient).
// ──────────────────────────────────────────────────────────────────────

import type { Finding, StructuralCheck, TreeContext } from "../check-context.ts";
import { SignatureKind } from "typescript/unstable/sync";
import { SyntaxKind, type Node, type TreeTypeChecker, type Type } from "../type-checker.ts";
import { findingAtNode, treeSourceFiles, typeCheckableNodesOfKind } from "../types/type-shapes.ts";

const CALL_KINDS: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.CallExpression]);
const LITERAL_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
]);

type IsTaggedCall = { call: Node; tag: Node; subject: Node | undefined };

export const isTaggedKnownTagCheck: StructuralCheck = {
  id: "effect/is-tagged-known-tag",
  scope: "tree",

  run(context: TreeContext): Finding[] {
    const treeChecker = context.typeChecker();
    const findings: Finding[] = [];

    for (const file of treeSourceFiles(context, treeChecker)) {
      const calls = typeCheckableNodesOfKind(file, CALL_KINDS).flatMap((node) => {
        const found = isTaggedCall(node);
        return found === undefined ? [] : [found];
      });
      if (calls.length === 0) continue;

      for (const found of calls) {
        const subject = subjectType(treeChecker, found);
        if (subject === undefined) continue;
        const known = knownTags(treeChecker, subject);
        if (known.size === 0) continue;
        const message = verdict(treeChecker, found.tag, known);
        if (message !== undefined) findings.push(findingAtNode(context, file, found.tag, "error", message));
      }
    }

    return findings;
  },
};

function verdict(treeChecker: TreeTypeChecker, tag: Node, known: ReadonlySet<string>): string | undefined {
  const listed = [...known].map((name) => `"${name}"`).join(", ");
  const possible = possibleTags(treeChecker, tag);
  if (possible === undefined) {
    return `This tag is typed as any string, so nothing checks it against the subject's union. Write one of ${listed} as a literal, or type it as the union's tags.`;
  }
  const unknown = possible.filter((name) => !known.has(name));
  if (unknown.length === 0) return undefined;
  const named = unknown.map((name) => `"${name}"`).join(", ");
  return (
    `${named} is not a tag this value can carry, so Predicate.isTagged is always false for it and a ` +
    `negated guard keeps the whole union. The subject's tags are ${listed}.`
  );
}

/** The string literals a tag argument can be, or undefined when its type admits any string. */
function possibleTags(treeChecker: TreeTypeChecker, tag: Node): readonly string[] | undefined {
  if (LITERAL_KINDS.has(tag.kind)) return [(tag as Node & { text: string }).text];
  const tagType = treeChecker.checker.getTypeAtLocation(tag);
  if (tagType === undefined) return undefined;
  const members = tagType.isUnionType() ? tagType.getTypes() : [tagType];
  const names: string[] = [];
  for (const member of members) {
    if (member === undefined || !member.isStringLiteralType()) return undefined;
    names.push(member.value);
  }
  return names;
}

/** `Predicate.isTagged(…)` or a bare imported `isTagged(…)`, with its tag and, data-first, its subject. */
function isTaggedCall(node: Node): IsTaggedCall | undefined {
  const call = node as Node & { expression: Node; arguments: readonly Node[] };
  const callee = call.expression;
  const name =
    callee.kind === SyntaxKind.Identifier
      ? (callee as Node & { text: string }).text
      : callee.kind === SyntaxKind.PropertyAccessExpression
        ? (callee as Node & { name: Node & { text: string } }).name.text
        : undefined;
  if (name !== "isTagged") return undefined;
  const [first, second] = call.arguments;
  if (first === undefined) return undefined;
  if (second !== undefined) return { call: node, tag: second, subject: first };
  return { call: node, tag: first, subject: undefined };
}

function subjectType(treeChecker: TreeTypeChecker, found: IsTaggedCall): Type | undefined {
  const { checker } = treeChecker;
  if (found.subject !== undefined) return checker.getTypeAtLocation(found.subject);
  const expected = checker.getContextualType(found.call as Parameters<typeof checker.getContextualType>[0]);
  if (expected === undefined) return undefined;
  // `Match.when` expects a pattern OR a predicate, so the predicate is one member of a union.
  const candidates = expected.isUnionType() ? expected.getTypes() : [expected];
  for (const candidate of candidates) {
    const [signature] = checker.getSignaturesOfType(candidate, SignatureKind.Call);
    if (signature !== undefined) return checker.getParameterType(signature, 0);
  }
  return undefined;
}

/** Every `_tag` string literal across the subject's union members; empty when any member is untyped. */
function knownTags(treeChecker: TreeTypeChecker, subject: Type): ReadonlySet<string> {
  const { checker } = treeChecker;
  if (subject.isErrorType()) return new Set();
  const members = subject.isUnionType() ? subject.getTypes() : [subject];
  const tags = new Set<string>();
  for (const member of members) {
    const property = checker.getPropertiesOfType(member).find((symbol) => symbol.name === "_tag");
    if (property === undefined) continue;
    const tagType = checker.getTypeOfSymbol(property);
    if (tagType === undefined) return new Set();
    const literals = tagType.isUnionType() ? tagType.getTypes() : [tagType];
    for (const literal of literals) {
      if (!literal.isStringLiteralType()) return new Set();
      tags.add(literal.value);
    }
  }
  return tags;
}
