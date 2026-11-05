/**
 * Compiles `tastebud` into one executable per platform, the review UI inside, into dist/bin/<os>-<arch>/tastebud.
 *
 *   bun scripts/build-tastebud-binary.ts                          the host platform (`bun run build:binary`)
 *   bun scripts/build-tastebud-binary.ts --all                    every release platform
 *   bun scripts/build-tastebud-binary.ts --target bun-linux-arm64 one platform
 *
 * Builds the review UI first. A binary this host can run is smoke-checked: its `--version` must be TASTEBUD_VERSION.
 */
import { fileURLToPath } from "node:url";

import { TASTEBUD_VERSION } from "@tastebud/core/taste-vocabulary";

import { TASTEBUD_RELEASE_TARGETS } from "./release/release-names.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

const hostTarget = `bun-${process.platform}-${process.arch}`;

const parseTargets = (args: ReadonlyArray<string>): ReadonlyArray<string> => {
  if (args.length === 0) return [hostTarget];
  if (args.length === 1 && args[0] === "--all") return TASTEBUD_RELEASE_TARGETS;
  if (args.length === 2 && args[0] === "--target" && TASTEBUD_RELEASE_TARGETS.includes(args[1] ?? ""))
    return [args[1] ?? ""];
  throw new Error(`Pass nothing, --all, or --target <one of ${TASTEBUD_RELEASE_TARGETS.join(", ")}>.`);
};

const run = async (command: ReadonlyArray<string>) => {
  const child = Bun.spawn([...command], { cwd: root, stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${command.join(" ")} exited ${String(exitCode)}`);
};

const targets = parseTargets(process.argv.slice(2));
await run(["bun", "run", "build:review"]);

const compileTarget = async (target: string) => {
  const outfile = `dist/bin/${target.replace(/^bun-/, "")}/tastebud`;
  // No bytecode: +15 MB for about 30 ms of startup. No .env or bunfig autoload: a project's .env must not be
  // able to point the binary at another store.
  await run([
    "bun",
    "build",
    "--compile",
    "--minify",
    "--sourcemap",
    "--no-compile-autoload-dotenv",
    "--no-compile-autoload-bunfig",
    `--target=${target}`,
    "packages/cli/src/main.ts",
    "--outfile",
    outfile,
  ]);
  if (target === hostTarget) {
    const printed = Bun.spawnSync([`${root}${outfile}`, "--version"], { stdout: "pipe" })
      .stdout.toString()
      .trim();
    if (!printed.endsWith(TASTEBUD_VERSION)) throw new Error(`${outfile} --version printed "${printed}"`);
  }
  const megabytes = (Bun.file(`${root}${outfile}`).size / 1024 / 1024).toFixed(1);
  process.stdout.write(`${outfile}: ${megabytes} MB\n`);
};

await Promise.all(targets.map(compileTarget));
