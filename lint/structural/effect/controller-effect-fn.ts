// ─── effect/controller-effect-fn ─────────────────────────────────────
//
// Makes sure: Every exported controller that returns an Effect is
// `Effect.fn("<feature>.<export>")(function* (…) { … })`. Each run of the
// operation then opens a span under that name, and a failure's stack trace
// names it. The name is fixed as the feature directory and the export's own
// name, so a trace line greps straight to its definition and two controllers
// can never share a span name.
//
// Type-aware, which is why it sits in this tier: "returns an Effect" is the
// subject, and a controller that composes `pipe(…)` or calls a helper spells
// its Effect return nowhere in its own text.
//
// `Effect.fn` is the only accepted form, even around a single expression,
// where it costs a `function* () { return yield* … }`. One shape is what every
// new controller copies, and `Effect.fn` also records the call site, which an
// arrow piped through `Effect.withSpan` does not. No untraced form is
// accepted: no controller has yet been a measured hot path.
//
// NEGATIVE SPACE:
//   - An export that returns no Effect is silent: pure helpers, constants,
//     schemas, a `Stream`, a `Layer`. So is an exported Effect VALUE, which is
//     not a function and has no call to trace.
//   - Only `controllers/` directories. A service or repo function is reached
//     through a controller, and the controller's span already contains it.
//   - `export { name }` re-exports and default exports are not followed.
//
// SCOPE: tree-scoped, over files classified `feature-controllers`, minus what
// `isArchitectureExemptSourcePath` names (tests, scripts, generated, ambient).
// ──────────────────────────────────────────────────────────────────────

import { relative } from "node:path";
import { classifySourcePath } from "../../policy/layout.ts";
import type { Finding, StructuralCheck, TreeContext } from "../check-context.ts";
import { SignatureKind } from "typescript/unstable/sync";
import {
  SyntaxKind,
  type Node,
  type SourceFile,
  type TreeTypeChecker,
  type Type,
} from "../type-checker.ts";
import { findingAtNode, treeSourceFiles } from "../types/type-shapes.ts";

/** One exported binding: where to report, the name to ask the checker about, and its initializer. */
type ExportedBinding = {
  statement: Node;
  exportName: string;
  name: Node;
  initializer: Node | undefined;
};

export const controllerEffectFnCheck: StructuralCheck = {
  id: "effect/controller-effect-fn",
  scope: "tree",

  run(context: TreeContext): Finding[] {
    const treeChecker = context.typeChecker();
    const findings: Finding[] = [];

    for (const file of treeSourceFiles(context, treeChecker)) {
      const place = classifySourcePath(context.vocabulary, relative(context.sourceRoot, file.fileName));
      if (place?.profile !== "feature-controllers") continue;
      const feature = place.unit.slice(place.unit.indexOf("/") + 1);

      const unwrapped: ExportedBinding[] = [];
      for (const binding of exportedBindings(file)) {
        const form = effectFnForm(binding.initializer);
        const expected = `${feature}.${binding.exportName}`;
        if (form.kind === "traced") {
          if (form.spanName !== expected) {
            findings.push(report(context, file, binding, wrongNameMessage(binding.exportName, expected, form.spanName)));
          }
        } else {
          unwrapped.push(binding);
        }
      }
      if (unwrapped.length === 0) continue;

      const types = treeChecker.checker.getTypeAtLocation(unwrapped.map((binding) => binding.name));
      for (const [index, type] of types.entries()) {
        const binding = unwrapped[index];
        if (binding === undefined || type === undefined) continue;
        if (!returnsEffect(treeChecker, type)) continue;
        const expected = `${feature}.${binding.exportName}`;
        findings.push(report(context, file, binding, unwrappedMessage(binding.exportName, expected)));
      }
    }

    return findings;
  },
};

function report(context: TreeContext, file: SourceFile, binding: ExportedBinding, message: string): Finding {
  return findingAtNode(context, file, binding.name, "error", message);
}

function unwrappedMessage(exportName: string, expected: string): string {
  return (
    `\`${exportName}\` is an exported controller returning an Effect with no name. Write it as ` +
    `\`export const ${exportName} = Effect.fn("${expected}")(function* (…) { … })\`, so each run opens ` +
    `a span and a stack trace names the operation.`
  );
}

function wrongNameMessage(exportName: string, expected: string, actual: string | undefined): string {
  const spelled = actual === undefined ? "no string literal" : `"${actual}"`;
  return (
    `\`${exportName}\` is traced as ${spelled}; name it "${expected}" — the feature directory and the ` +
    `export — so a span greps to exactly one definition.`
  );
}

function hasModifier(node: Node, kind: SyntaxKind): boolean {
  const modifiers = (node as Node & { modifiers?: readonly Node[] }).modifiers ?? [];
  return modifiers.some((modifier) => modifier.kind === kind);
}

function* exportedBindings(file: SourceFile): Generator<ExportedBinding> {
  for (const statement of file.statements as readonly Node[]) {
    if (!hasModifier(statement, SyntaxKind.ExportKeyword)) continue;
    if (hasModifier(statement, SyntaxKind.DefaultKeyword)) continue;

    if (statement.kind === SyntaxKind.FunctionDeclaration) {
      const name = (statement as Node & { name?: Node & { text: string } }).name;
      if (name !== undefined) yield { statement, exportName: name.text, name, initializer: undefined };
      continue;
    }
    if (statement.kind !== SyntaxKind.VariableStatement) continue;
    const list = (statement as Node & { declarationList: { declarations: readonly Node[] } }).declarationList;
    for (const declaration of list.declarations) {
      const { name, initializer } = declaration as Node & { name: Node & { text?: string }; initializer?: Node };
      // A destructuring export has no single name to trace under.
      if (name.kind !== SyntaxKind.Identifier || name.text === undefined) continue;
      yield { statement, exportName: name.text, name, initializer };
    }
  }
}

type EffectFnForm = { kind: "traced"; spanName: string | undefined } | { kind: "other" };

/**
 * `Effect.fn("x")(function* …)` is a call whose callee is a call to `Effect.fn`. Anything else,
 * `Effect.fnUntraced` included, is `other` and goes to the checker.
 */
function effectFnForm(initializer: Node | undefined): EffectFnForm {
  if (initializer?.kind !== SyntaxKind.CallExpression) return { kind: "other" };
  const outer = initializer as Node & { expression: Node; arguments: readonly Node[] };
  if (outer.expression.kind !== SyntaxKind.CallExpression) return { kind: "other" };
  const inner = outer.expression as Node & { expression: Node; arguments: readonly Node[] };
  if (!isEffectMember(inner.expression, "fn")) return { kind: "other" };
  const [first] = inner.arguments;
  const spanName =
    first?.kind === SyntaxKind.StringLiteral ? (first as Node & { text: string }).text : undefined;
  return { kind: "traced", spanName };
}

function isEffectMember(node: Node, member: string): boolean {
  if (node.kind !== SyntaxKind.PropertyAccessExpression) return false;
  const access = node as Node & { expression: Node & { text?: string }; name: Node & { text: string } };
  return access.expression.text === "Effect" && access.name.text === member;
}

function returnsEffect(treeChecker: TreeTypeChecker, type: Type): boolean {
  if (type.isErrorType()) return false;
  const { checker } = treeChecker;
  return checker
    .getSignaturesOfType(type, SignatureKind.Call)
    .some((signature) => isEffectType(checker.getReturnTypeOfSignature(signature)));
}

/** Effect's own `Effect` interface, or a union with one among its members. */
function isEffectType(type: Type | undefined): boolean {
  if (type === undefined) return false;
  if (type.isUnionType()) return type.getTypes().some(isEffectType);
  const symbol = type.getSymbol();
  if (symbol?.name !== "Effect") return false;
  return symbol.declarations.some((declaration) => declaration.path.includes("/node_modules/effect/"));
}
