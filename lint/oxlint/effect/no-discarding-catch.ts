// ─── effect/no-discarding-catch ───────────────────────────────────────
//
// Makes sure: No catch handler throws away the failure it was handed. A
// `.catch(…)`, `Effect.catch(…)` or `catchAll(…)` whose handler takes no
// parameter, or never reads the one it takes, answers every failure alike:
// a refusal, a broken server and a dropped connection all become the same
// fallback, and the UI can no longer tell its user which one happened.
// Any `.catch` on `mutateAsync(…)` reports too, because a server
// function's typed failures arrive in its answer and the rejection is
// only ever a defect.
//
// The fix is to handle the failure by its tag where its copy is decided,
// or to let it propagate. A boundary that truly has one answer for any
// failure (a browser prompt the user closed, a best-effort notification)
// disables the rule on that line with the reason beside it, so `rg` over
// the disables lists every place a failure is deliberately dropped.
//
// "Reads" is any identifier in the handler's body with the parameter's
// name, so a log line counts as reading it. That is deliberate: logging a
// defect and recovering is a handled failure, and telling a log from a
// use needs the type-aware tier.
//
// SCOPE: the `trees` option lists the declared roots it reads, and it
// reads every tree when absent. A browser tree is where a failure meets a
// person; a server tree mostly passes failures on, and its own rules
// (`no-silent-error-swallow`) govern that.
//
// NEGATIVE SPACE: `catchTag`, `catchTags` and the narrowing catchers are
// not here. Their handler runs for one failure the call already names, so
// ignoring its value discards nothing. A handler passed by name is not
// followed to its declaration. Not read either: `.then(ok, onRejected)`,
// `Effect.orElse*`, `Effect.ignore`, `Effect.option` and a `match`'s
// `onFailure`, each a discard this rule does not yet see.
// ──────────────────────────────────────────────────────────────────────

import { defineTreeRule } from "../lib/define-tree-rule.ts";
import { stringListRuleOption } from "../lib/rule-options.ts";
import { staticKeyName } from "../lib/static-key-name.ts";
import { type ESTree } from "@oxlint/plugins";

const DISCARDING_CATCH_METHODS = new Set(["catch", "catchAll", "catchEager"]);
const MUTATION_PROMISE_METHOD = "mutateAsync";

function calledName(callee: ESTree.Node): string | undefined {
  if (callee.type === "Identifier") return callee.name;
  return callee.type === "MemberExpression"
    ? staticKeyName(callee.property, callee.computed)
    : undefined;
}

type HandlerFunction = ESTree.ArrowFunctionExpression | ESTree.Function;

function isHandlerFunction(node: ESTree.Node): node is HandlerFunction {
  return node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";
}

/** Whether `name` appears as an identifier anywhere under `node`. */
function mentions(node: unknown, name: string): boolean {
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((child) => mentions(child, name));
  const record = node as Record<string, unknown>;
  if (record["type"] === "Identifier" && record["name"] === name) return true;
  return Object.entries(record).some(
    ([key, child]) => key !== "parent" && typeof child === "object" && mentions(child, name),
  );
}

function discardsItsFailure(handler: HandlerFunction): boolean {
  const [failure] = handler.params;
  if (failure === undefined) return true;
  // A destructured failure reads the fields it names.
  if (failure.type !== "Identifier") return false;
  return !mentions(handler.body, failure.name);
}

/** `mutation.mutateAsync(…).catch(…)`: the call the `.catch` hangs off is a mutation's promise. */
function isMutationPromiseCatch(node: ESTree.CallExpression): boolean {
  const { callee } = node;
  if (callee.type !== "MemberExpression") return false;
  if (staticKeyName(callee.property, callee.computed) !== "catch") return false;
  const { object } = callee;
  return object.type === "CallExpression" && calledName(object.callee) === MUTATION_PROMISE_METHOD;
}

export const noDiscardingCatchRule = defineTreeRule({
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: { trees: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
    messages: {
      discardingCatch:
        "This catch handler never reads the failure it was handed, so every failure gets the same answer and the user cannot tell a refusal from a broken or unreachable server. Handle the failure by its tag, or let it propagate.",
      mutationPromiseCatch:
        "A server function's typed failures arrive in mutateAsync's answer, so its rejection is only ever a defect. Read the answer's Result instead of catching the promise.",
    },
  },
  create(context, role) {
    const trees = stringListRuleOption(context.options[0], "trees", [role.tree.root]);
    if (!trees.includes(role.tree.root)) return {};
    return {
      CallExpression(node) {
        if (isMutationPromiseCatch(node)) {
          context.report({ node, messageId: "mutationPromiseCatch" });
          return;
        }
        const method = calledName(node.callee);
        if (method === undefined || !DISCARDING_CATCH_METHODS.has(method)) return;
        for (const argument of node.arguments) {
          if (isHandlerFunction(argument) && discardsItsFailure(argument)) {
            context.report({ node: argument, messageId: "discardingCatch" });
          }
        }
      },
    };
  },
});
