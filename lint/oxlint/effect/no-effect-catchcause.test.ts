import { describeRule } from "../lib/rule-spec.ts";
import { noEffectCatchCauseRule } from "./no-effect-catchcause.ts";

const SERVICE = "/repo/packages/core/src/features/billing/operations/charge-invoice.ts";
const IMPORTS = `import { Effect } from "effect";\nimport { chargeCard } from "#core/features/billing/operations/payments";`;

describeRule("effect/no-effect-catchcause", noEffectCatchCauseRule, {
  obvious: [
    {
      name: "the cause catcher data-last in a pipe",
      filename: SERVICE,
      code: `${IMPORTS}\nexport const charge = (id: string) =>\n  chargeCard(id).pipe(Effect.catchCause(() => Effect.succeed({ charged: false })));`,
      errors: [{ messageId: "causeCaught" }],
    },
    {
      name: "the same call written data-first",
      filename: SERVICE,
      code: `${IMPORTS}\nexport const charge = (id: string) =>\n  Effect.catchCause(chargeCard(id), () => Effect.succeed({ charged: false }));`,
      errors: [{ messageId: "causeCaught" }],
    },
  ],

  adversarial: [
    {
      name: "computed member access spells the name without an identifier",
      filename: SERVICE,
      code: `${IMPORTS}\nexport const charge = (id: string) =>\n  Effect["catchCause"](chargeCard(id), () => Effect.succeed(null));`,
      errors: [{ messageId: "causeCaught" }],
    },
    {
      name: "reached through a namespace alias rather than the conventional Effect",
      filename: SERVICE,
      code: `import * as Eff from "effect/Effect";\nimport { chargeCard } from "#core/features/billing/operations/payments";\nexport const charge = (id: string) =>\n  chargeCard(id).pipe(Eff.catchCause(() => Eff.succeed(null)));`,
      errors: [{ messageId: "causeCaught" }],
    },
    {
      name: "imported bare, with no member expression to match",
      filename: SERVICE,
      code: `import { catchCause, succeed } from "effect/Effect";\nimport { chargeCard } from "#core/features/billing/operations/payments";\nexport const charge = (id: string) => catchCause(chargeCard(id), () => succeed(null));`,
      errors: [{ messageId: "causeCaught" }],
    },
    {
      // Passed as a value rather than called. A CallExpression-only rule sees nothing here, and the
      // defect is caught all the same as soon as the pipeline runs.
      name: "referenced as a value and applied elsewhere",
      filename: SERVICE,
      code: `${IMPORTS}\nconst quiet = Effect.catchCause;\nexport const charge = (id: string) => quiet(chargeCard(id), () => Effect.succeed(null));`,
      errors: [{ messageId: "causeCaught" }],
    },
    {
      // The precise spelling of the same decision, and the one reached for once the first is
      // refused — it does not even have the excuse of catching declared errors alongside.
      name: "the defect catcher, which is the retry after the cause catcher is refused",
      filename: SERVICE,
      code: `${IMPORTS}\nexport const charge = (id: string) =>\n  chargeCard(id).pipe(Effect.catchDefect(() => Effect.succeed(null)));`,
      errors: [{ messageId: "defectCaught" }],
    },
    {
      // No handler at all, so nothing even pretends to recover: the defect becomes a success.
      name: "the cause discarded outright, the step past catching it",
      filename: SERVICE,
      code: `${IMPORTS}\nexport const charge = (id: string) => chargeCard(id).pipe(Effect.ignoreCause);`,
      errors: [{ messageId: "causeIgnored" }],
    },
    {
      name: "two cause catchers in one file are two findings",
      filename: SERVICE,
      code: `${IMPORTS}\nexport const charge = (id: string) =>\n  chargeCard(id).pipe(Effect.catchCause(() => Effect.succeed(null)));\nexport const refund = (id: string) =>\n  chargeCard(id).pipe(Effect.catchCause(() => Effect.succeed(null)));`,
      errors: [{ messageId: "causeCaught" }, { messageId: "causeCaught" }],
    },
  ],

  legal: [
    {
      name: "catching the errors the type declares",
      filename: SERVICE,
      code: `${IMPORTS}\nexport const charge = (id: string) =>\n  chargeCard(id).pipe(Effect.catchTag("CardDeclined", () => Effect.succeed({ charged: false })));`,
    },
    {
      name: "catch takes the error channel and leaves defects travelling",
      filename: SERVICE,
      code: `${IMPORTS}\nexport const charge = (id: string) =>\n  chargeCard(id).pipe(Effect.catch(() => Effect.succeed({ charged: false })));`,
    },
    {
      // Reading the cause is the opposite of swallowing it: the failure carries on to the runtime
      // boundary with a log line attached. A rule matching the word "cause" would report here.
      name: "observing the cause without catching it",
      filename: SERVICE,
      code: `import { Cause, Effect } from "effect";\nimport { chargeCard } from "#core/features/billing/operations/payments";\nexport const charge = (id: string) =>\n  chargeCard(id).pipe(Effect.tapCause((cause) => Effect.logError(Cause.pretty(cause))));`,
    },
    {
      // A prefix of the name, not the name: the exact match leaves every cause the predicate
      // rejects travelling, which a rule matching `catchCause*` would report anyway.
      name: "a cause catcher narrowed to one known failure",
      filename: SERVICE,
      code: `${IMPORTS}\nimport { isGatewayTimeout } from "#core/features/billing/operations/payments";\nexport const charge = (id: string) =>\n  chargeCard(id).pipe(Effect.catchCauseIf(isGatewayTimeout, () => Effect.succeed({ charged: false })));`,
    },
    {
      name: "sandbox exposes the cause in the error channel without handling it",
      filename: SERVICE,
      code: `${IMPORTS}\nexport const charge = (id: string) => chargeCard(id).pipe(Effect.sandbox);`,
    },
    {
      name: "a test may assert what a program does when a defect is caught",
      filename: "/repo/packages/core/src/features/billing/operations/charge-invoice.test.ts",
      code: `${IMPORTS}\nconst quiet = chargeCard("inv_1").pipe(Effect.catchCause(() => Effect.succeed(null)));`,
    },
    {
      name: "a one-off script is not the shipped module graph",
      filename: "/repo/scripts/replay-charges.ts",
      code: `${IMPORTS}\nconst quiet = chargeCard("inv_1").pipe(Effect.catchCause(() => Effect.succeed(null)));`,
    },
  ],
});
