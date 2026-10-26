// ─── effect/no-tagged-error-instanceof ───────────────────────────────
//
// Makes sure: One of OUR tagged errors is recovered by its tag.
// `Effect.catchTag("AttemptAlreadyRun", …)` removes that error from the
// effect's error type, so what is left is exactly what the caller still has to
// handle. `Effect.catchIf((e) => e instanceof AttemptAlreadyRun, …)` — or the
// same test on a failure pulled out of a `Result` or `Exit` — leaves the union
// whole, and recovery by class is a second vocabulary beside the tag.
//
// Type-aware, which is why it sits in this tier: "is the right-hand side one
// of our tagged errors" is a question about what a constructor builds and
// where it was declared. A class counts when its instances carry both `_tag`
// and `message` (`Data.TaggedError`, `Schema.TaggedErrorClass`) AND it is
// declared in this repo's source rather than under `node_modules`.
//
// The fixes: `Effect.catchTag` / `Effect.catchTags` on the effect, before it
// becomes a Result or Exit; `Predicate.isTagged(error, "<Tag>")` where a
// predicate is genuinely required.
//
// NEGATIVE SPACE:
//   - Boundary normalisation of a FOREIGN carrier is silent: `SqlError`,
//     `EffectDrizzleQueryError`, `cause instanceof Error`, DOM and Node
//     errors. They are not ours, and reading them is a boundary's job.
//   - The body of a NAMED type guard is silent when what it tests is not
//     already one of our tagged errors: `isSqlFailure = (e: unknown): e is …`
//     parses an untyped value, which is a boundary's job. A named guard over
//     a union that holds our errors (`(e: Refusal | Other): e is Refusal`) is
//     recovery by class one name away, and reports. An inline guard handed to
//     `catchIf` is the recovery site itself and always reports.
//   - A right-hand side with no construct signature (a class picked from an
//     array) is not judged.
//   - A tested value whose type holds a type parameter (`error: E | WriteMustBeProposed`
//     with `E` generic) is silent: `catchTag` cannot narrow a tag out of a type
//     parameter, so `instanceof` is the only recovery there.
//
// SCOPE: tree-scoped. Walks the declared trees minus what
// `isArchitectureExemptSourcePath` names (tests, scripts, generated, ambient).
// ──────────────────────────────────────────────────────────────────────

import type { Finding, StructuralCheck, TreeContext } from "../check-context.ts";
import { SignatureKind } from "typescript/unstable/sync";
import { SyntaxKind, TypeFlags, type Node, type TreeTypeChecker, type Type } from "../type-checker.ts";
import {
  declaresTypePredicate,
  enclosingFunctionLike,
  findingAtNode,
  treeSourceFiles,
  typeCheckableNodesOfKind,
} from "../types/type-shapes.ts";

const TAGGED_ERROR_INSTANCEOF_MESSAGE =
  "This recovers one of our tagged errors by class, so the error channel keeps the full union. " +
  "Recover it with Effect.catchTag(\"<Tag>\", …) or Effect.catchTags({ … }) before the effect " +
  "becomes a Result or Exit; use Predicate.isTagged(error, \"<Tag>\") where a predicate is required.";

const BINARY_KINDS: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.BinaryExpression]);

export const noTaggedErrorInstanceofCheck: StructuralCheck = {
  id: "effect/no-tagged-error-instanceof",
  scope: "tree",

  run(context: TreeContext): Finding[] {
    const treeChecker = context.typeChecker();
    const findings: Finding[] = [];

    for (const file of treeSourceFiles(context, treeChecker)) {
      const tests = typeCheckableNodesOfKind(file, BINARY_KINDS).filter(isInstanceof);
      if (tests.length === 0) continue;

      const classes = treeChecker.checker.getTypeAtLocation(tests.map(rightOperand));
      const tested = treeChecker.checker.getTypeAtLocation(tests.map(leftOperand));
      for (const [index, classType] of classes.entries()) {
        const test = tests[index];
        if (test === undefined || classType === undefined) continue;
        const testedType = tested[index];
        if (testedType !== undefined && holdsTypeParameter(testedType)) continue;
        if (!constructsOwnTaggedError(treeChecker, classType)) continue;
        const parsesForeignValue =
          testedType === undefined || !holdsOwnTaggedError(treeChecker, testedType);
        if (parsesForeignValue && isInsideNamedTypeGuard(treeChecker, test)) continue;
        findings.push(findingAtNode(context, file, test, "error", TAGGED_ERROR_INSTANCEOF_MESSAGE));
      }
    }

    return findings;
  },
};

function isInstanceof(node: Node): boolean {
  const binary = node as Node & { operatorToken?: Node };
  return binary.operatorToken?.kind === SyntaxKind.InstanceOfKeyword;
}

function leftOperand(node: Node): Node {
  return (node as Node & { left: Node }).left;
}

function holdsTypeParameter(type: Type): boolean {
  const members = type.isUnionType() ? type.getTypes() : [type];
  return members.some((member) => (member.flags & TypeFlags.TypeParameter) !== 0);
}

function rightOperand(node: Node): Node {
  return (node as Node & { right: Node }).right;
}

/**
 * Inside a NAMED type guard. Every enclosing function is asked, not only the nearest: a guard's
 * body often tests inside a `.some((Class) => value instanceof Class)` callback of its own.
 *
 * An anonymous guard handed straight to `catchIf` is not exempt. That is the recovery site
 * itself, and `catchTag` replaces it outright.
 */
function isInsideNamedTypeGuard(treeChecker: TreeTypeChecker, node: Node): boolean {
  for (let fn = enclosingFunctionLike(node); fn !== undefined; fn = enclosingFunctionLike(fn)) {
    if (isNamedFunction(fn) && declaresTypePredicate(treeChecker, fn)) return true;
  }
  return false;
}

function isNamedFunction(fn: Node): boolean {
  if (fn.kind === SyntaxKind.FunctionDeclaration || fn.kind === SyntaxKind.MethodDeclaration) {
    return true;
  }
  return fn.parent?.kind === SyntaxKind.VariableDeclaration;
}

/** Some member of the tested value's type is an instance of one of our tagged errors. */
function holdsOwnTaggedError(treeChecker: TreeTypeChecker, type: Type): boolean {
  const members = type.isUnionType() ? type.getTypes() : [type];
  return members.some(
    (member) => member !== undefined && isOwnTaggedErrorInstance(treeChecker, member),
  );
}

function isOwnTaggedErrorInstance(treeChecker: TreeTypeChecker, instance: Type): boolean {
  if (!declaredInRepo(instance)) return false;
  const names = new Set(
    treeChecker.checker.getPropertiesOfType(instance).map((property) => property.name),
  );
  return names.has("_tag") && names.has("message");
}

function declaredInRepo(type: Type): boolean {
  const declarations = type.getSymbol()?.declarations ?? [];
  if (declarations.length === 0) return false;
  return !declarations.some((declaration) => declaration.path.includes("/node_modules/"));
}

function constructsOwnTaggedError(treeChecker: TreeTypeChecker, classType: Type): boolean {
  if (classType.isErrorType() || !declaredInRepo(classType)) return false;
  const { checker } = treeChecker;
  return checker.getSignaturesOfType(classType, SignatureKind.Construct).some((signature) => {
    const instance = checker.getReturnTypeOfSignature(signature);
    return instance !== undefined && isOwnTaggedErrorInstance(treeChecker, instance);
  });
}
