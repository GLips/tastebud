import { describeRule } from "../lib/rule-spec.ts";
import { ioOnlyInInfrastructureRule } from "./io-only-in-infrastructure.ts";

const OPERATION = "/repo/packages/core/src/features/decisions/operations/decide.ts";
const DOMAIN = "/repo/packages/core/src/domains/places/place-keys.ts";
const CLI_CONTROLLER = "/repo/packages/cli/src/features/review-server/controllers/start-review-server.ts";
const CLI_ROUTE = "/repo/packages/cli/src/routes/tastebud-command.ts";

describeRule("tastebud/io-only-in-infrastructure", ioOnlyInInfrastructureRule, {
  obvious: [
    {
      name: "an operation writing the lock file itself",
      filename: OPERATION,
      code: `import { writeFileSync } from "node:fs";`,
      errors: [{ messageId: "ioModuleOutsideInfrastructure" }],
    },
    {
      name: "a controller spawning vite with Bun.spawn",
      filename: CLI_CONTROLLER,
      code: `export const start = () => Bun.spawn(["bunx", "vite"]);`,
      errors: [
        {
          message:
            "`Bun.spawn` is IO, and IO lives in #cli/infrastructure/. Move the call into an adapter there (terminal, process-arguments, git-repository and the like) and inject it.",
        },
      ],
    },
    {
      name: "the root route reading argv and setting the exit code",
      filename: CLI_ROUTE,
      code: `export const args = process.argv.slice(2);\nprocess.exitCode = 1;`,
      errors: [{ messageId: "ioMemberOutsideInfrastructure" }, { messageId: "ioMemberOutsideInfrastructure" }],
    },
  ],

  adversarial: [
    {
      name: "the unprefixed module spelling, which Bun and Node both resolve",
      filename: DOMAIN,
      code: `import { homedir } from "os";`,
      errors: [{ messageId: "ioModuleOutsideInfrastructure" }],
    },
    {
      name: "a subpath of an IO module is the same IO",
      filename: OPERATION,
      code: `import { readFile } from "node:fs/promises";`,
      errors: [{ messageId: "ioModuleOutsideInfrastructure" }],
    },
    {
      name: "a dynamic import of SQLite, which no ImportDeclaration visitor sees",
      filename: OPERATION,
      code: `export const open = async () => new (await import("bun:sqlite")).Database("x");`,
      errors: [{ messageId: "ioModuleOutsideInfrastructure" }],
    },
    {
      name: "the Bun global reached through globalThis with a computed key",
      filename: CLI_CONTROLLER,
      code: `export const start = () => globalThis["Bun"]["spawn"](["git"]);`,
      errors: [{ messageId: "ioMemberOutsideInfrastructure" }],
    },
    {
      name: "destructuring the capability off process under an alias",
      filename: CLI_ROUTE,
      code: `const { exit: quit } = process;\nquit(1);`,
      errors: [{ messageId: "ioMemberOutsideInfrastructure" }],
    },
    {
      name: "a named import from the bun module, which is Bun.spawn without the word Bun",
      filename: CLI_CONTROLLER,
      code: `import { spawn as run } from "bun";\nexport const start = () => run(["git"]);`,
      errors: [{ messageId: "ioMemberOutsideInfrastructure" }],
    },
    {
      name: "the default export of node:process is process",
      filename: CLI_ROUTE,
      code: `import proc from "node:process";\nexport const out = proc.stdout;`,
      errors: [{ messageId: "ioMemberOutsideInfrastructure" }],
    },
    {
      name: "a re-export hands the capability on with no read in this file",
      filename: CLI_CONTROLLER,
      code: `export { spawn } from "bun";`,
      errors: [{ messageId: "ioMemberOutsideInfrastructure" }],
    },
    {
      name: "a cast wedged between the global and its member",
      filename: CLI_ROUTE,
      code: `export const cwd = (process as NodeJS.Process).cwd();`,
      errors: [{ messageId: "ioMemberOutsideInfrastructure" }],
    },
  ],

  legal: [
    {
      name: "infrastructure is where IO lives",
      filename: "/repo/packages/core/src/infrastructure/decision-lock.ts",
      code: `import { writeFileSync } from "node:fs";\nexport const pid = process.pid;\nexport const spawn = () => Bun.spawn(["git"]);`,
    },
    {
      name: "a nested infrastructure module is still infrastructure",
      filename: "/repo/packages/core/src/infrastructure/record-index/index-handle.ts",
      code: `import { Database } from "bun:sqlite";`,
    },
    {
      name: "a type-only import of an IO module is erased",
      filename: OPERATION,
      code: `import type { Stats } from "node:fs";`,
    },
    {
      name: "pure Node modules are not IO",
      filename: DOMAIN,
      code: `import { posix } from "node:path";\nimport { format } from "node:util";`,
    },
    {
      name: "process.env is ambient-globals' subject, not this rule's",
      filename: "/repo/packages/core/src/env.ts",
      code: `export const store = process.env.TASTEBUD_STORE;`,
    },
    {
      name: "a local binding named Bun is not the global",
      filename: OPERATION,
      code: `const Bun = { spawn: () => 0 };\nexport const n = Bun.spawn();`,
    },
    {
      name: "a module whose name merely starts like an IO module",
      filename: DOMAIN,
      code: `import { x } from "fs-extra-types";\nimport { y } from "os-locale-data";`,
    },
    {
      name: "tests and files outside every tree are not this rule's subject",
      filename: "/repo/test/cli.test.ts",
      code: `import { mkdtempSync } from "node:fs";\nprocess.exit(0);`,
    },
  ],
});
