import { describeRule } from "../lib/rule-spec.ts";
import { noDiscardingCatchRule } from "./no-discarding-catch.ts";

const UI = "/repo/apps/review/src/features/billing/ui/charge-button.tsx";
const CORE = "/repo/packages/core/src/features/billing/operations/charge-invoice.ts";
const IMPORTS = `import { Effect } from "effect";\nimport { chargeCard } from "#review/features/billing/controllers/charge";`;
const WEB_ONLY = [{ trees: ["apps/web/src"] }];

describeRule("effect/no-discarding-catch", noDiscardingCatchRule, {
  obvious: [
    {
      name: "a promise catch whose handler takes no failure",
      filename: UI,
      code: `${IMPORTS}\nexport const charge = (id: string) => chargeCard(id).catch(() => "Not charged");`,
      errors: [{ messageId: "discardingCatch" }],
    },
    {
      name: "a catch on a mutation's promise",
      filename: UI,
      code: `${IMPORTS}\nexport const charge = (mutation: { mutateAsync: (id: string) => Promise<void> }) =>\n  mutation.mutateAsync("a").catch((error: unknown) => console.error(error));`,
      errors: [{ messageId: "mutationPromiseCatch" }],
    },
  ],

  adversarial: [
    {
      // Naming the failure and never reading it discards it as surely as taking none.
      name: "a handler that names the failure and never reads it",
      filename: UI,
      code: `${IMPORTS}\nexport const charge = (id: string) => chargeCard(id).catch((_error) => "Not charged");`,
      errors: [{ messageId: "discardingCatch" }],
    },
    {
      name: "the data-first Effect spelling, where the handler is the second argument",
      filename: UI,
      code: `${IMPORTS}\nexport const charge = (id: string) => Effect.catch(Effect.promise(() => chargeCard(id)), () => Effect.succeed(null));`,
      errors: [{ messageId: "discardingCatch" }],
    },
    {
      name: "a function expression rather than an arrow",
      filename: UI,
      code: `${IMPORTS}\nexport const charge = (id: string) => chargeCard(id).catch(function () { return null; });`,
      errors: [{ messageId: "discardingCatch" }],
    },
  ],

  legal: [
    {
      name: "a handler that answers with the failure's own sentence",
      filename: UI,
      code: `${IMPORTS}\nexport const charge = (id: string) =>\n  Effect.promise(() => chargeCard(id)).pipe(Effect.catch((failure) => Effect.succeed(failure.message)));`,
    },
    {
      name: "a destructured failure reads the fields it names",
      filename: UI,
      code: `${IMPORTS}\nexport const charge = (id: string) => chargeCard(id).catch(({ message }: Error) => message);`,
    },
    {
      // Negative space: a catchTag handler runs for one failure the call already names.
      name: "catchTag ignoring the value of the one failure it names",
      filename: UI,
      code: `${IMPORTS}\nexport const charge = (id: string) =>\n  Effect.promise(() => chargeCard(id)).pipe(Effect.catchTag("CardDeclined", () => Effect.succeed(null)));`,
    },
    {
      name: "a tree the option leaves out",
      filename: CORE,
      options: WEB_ONLY,
      code: `${IMPORTS}\nexport const charge = (id: string) => chargeCard(id).catch(() => "Not charged");`,
    },
  ],
});
