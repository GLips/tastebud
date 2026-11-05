import { describeRule } from "../lib/rule-spec.ts";
import { noLongCommentsRule } from "./no-long-comments.ts";

const SCRIPT = "/repo/scripts/check.ts";
const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index}`).join(" ");

describeRule("tastebud/no-long-comments", noLongCommentsRule, {
  obvious: [
    {
      name: "a comment past sixty words above code",
      filename: SCRIPT,
      code: `const a = 1;\n// ${words(61)}\nexport const b = a;`,
      errors: [{ messageId: "tooManyWords" }],
    },
    {
      name: "a short comment stretched over too many lines",
      filename: "/repo/test/cli.test.ts",
      code: `const a = 1;\n${Array.from({ length: 16 }, () => "// x").join("\n")}\nexport const b = a;`,
      errors: [{ messageId: "tooManyLines" }],
    },
  ],

  adversarial: [
    {
      name: "a run of line comments split only by blank lines is one comment",
      filename: SCRIPT,
      code: `const a = 1;\n// ${words(31)}\n\n// ${words(31)}\nexport const b = a;`,
      errors: [{ messageId: "tooManyWords" }],
    },
    {
      name: "a block comment and a line comment back to back",
      filename: SCRIPT,
      code: `const a = 1;\n/* ${words(40)} */\n// ${words(30)}\nexport const b = a;`,
      errors: [{ messageId: "tooManyWords" }],
    },
    {
      name: "a file header gets double, and no more",
      filename: SCRIPT,
      code: `// ${words(121)}\nexport const a = 1;`,
      errors: [{ messageId: "tooManyWords" }],
    },
  ],

  legal: [
    {
      name: "a file header within double the allowance",
      filename: SCRIPT,
      code: `// ${words(110)}\nexport const a = 1;`,
    },
    {
      name: "two comments separated by code are two runs",
      filename: SCRIPT,
      code: `// ${words(50)}\nconst a = 1;\n// ${words(50)}\nexport const b = a;`,
    },
    {
      name: "box drawing and gutters hold no words",
      filename: SCRIPT,
      code: `const a = 1;\n// ─── ${"─".repeat(40)}\n/**\n * ${words(10)}\n */\nexport const b = a;`,
    },
  ],
});
