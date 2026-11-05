import { describeRule } from "../lib/rule-spec.ts";
import { noAmbientNondeterminismRule } from "./no-ambient-nondeterminism.ts";

const DOMAIN = "/repo/packages/core/src/domains/derivation-lifecycle/lifecycle.ts";
const SHARED = "/repo/packages/core/src/shared/input-text.ts";
const OPERATION = "/repo/packages/core/src/features/decisions/operations/decide.ts";
const REVIEW_SERVICE = "/repo/apps/review/src/features/places/service/places-audit.ts";

describeRule("tastebud/no-ambient-nondeterminism", noAmbientNondeterminismRule, {
  obvious: [
    {
      name: "a domain stamping a record with Date.now()",
      filename: DOMAIN,
      code: `export const stamp = () => Date.now();`,
      errors: [{ messageId: "ambientNondeterminism" }],
    },
    {
      name: "an operation building the current time with new Date()",
      filename: OPERATION,
      code: `export const decidedAt = () => new Date().toISOString();`,
      errors: [{ messageId: "ambientNondeterminism" }],
    },
    {
      name: "a review service drawing a random id",
      filename: REVIEW_SERVICE,
      code: `export const token = () => crypto.randomUUID();`,
      errors: [{ messageId: "ambientNondeterminism" }],
    },
  ],

  adversarial: [
    {
      name: "a shared helper, which launders the clock into every domain that imports it",
      filename: SHARED,
      code: `export const elapsed = (start: number) => performance.now() - start;`,
      errors: [{ messageId: "ambientNondeterminism" }],
    },
    {
      name: "the clock reached through globalThis with a computed key",
      filename: DOMAIN,
      code: `export const stamp = () => globalThis["Date"].now();`,
      errors: [{ messageId: "ambientNondeterminism" }],
    },
    {
      name: "destructuring now off Date under an alias",
      filename: DOMAIN,
      code: `const { now: clock } = Date;\nexport const stamp = () => clock();`,
      errors: [{ messageId: "ambientNondeterminism" }],
    },
    {
      name: "Date called as a function returns the current time as a string",
      filename: OPERATION,
      code: `export const label = () => Date();`,
      errors: [{ messageId: "ambientNondeterminism" }],
    },
    {
      name: "new Date through the global object",
      filename: OPERATION,
      code: `export const now = () => new globalThis.Date();`,
      errors: [{ messageId: "ambientNondeterminism" }],
    },
    {
      name: "performance imported from perf_hooks instead of read off the global",
      filename: SHARED,
      code: `import { performance as perf } from "node:perf_hooks";\nexport const t = () => perf.now();`,
      errors: [{ messageId: "ambientNondeterminism" }],
    },
    {
      name: "a cast between the global and its member",
      filename: DOMAIN,
      code: `export const roll = () => (Math as typeof Math).random();`,
      errors: [{ messageId: "ambientNondeterminism" }],
    },
  ],

  legal: [
    {
      name: "converting a stored time is not reading the clock",
      filename: DOMAIN,
      code: `export const parsed = (iso: string) => new Date(iso).getTime();\nexport const parse = (iso: string) => Date.parse(iso);`,
    },
    {
      name: "infrastructure owns the clock and the id source",
      filename: "/repo/packages/core/src/infrastructure/record-ids.ts",
      code: `export const seed = () => crypto.getRandomValues(new Uint8Array(16));\nexport const t = () => Date.now();`,
    },
    {
      name: "a review UI component formatting relative time is presentation, not a domain",
      filename: "/repo/apps/review/src/features/places/ui/place-details.tsx",
      code: `export const age = (t: number) => Date.now() - t;`,
    },
    {
      name: "Effect's Clock is the deterministic source",
      filename: OPERATION,
      code: `import { Clock } from "effect";\nexport const now = Clock.currentTimeMillis;`,
    },
    {
      name: "a local binding named Date is not the global",
      filename: DOMAIN,
      code: `const Date = { now: () => 0 };\nexport const t = Date.now();`,
    },
    {
      name: "an alias is not followed, which is this rule's stated blind spot",
      filename: DOMAIN,
      code: `const D = Date;\nexport const t = D.now();`,
    },
  ],
});
