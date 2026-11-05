// vite.config.ts: the review UI. `tastebud review` serves its build (`bun run build:review`); `bun run dev:review` runs
// it with HMR. Screens render in the browser (`defaultSsr: false` in start.ts); the server answers the shell, per
// request, and server functions.
import { unplugin as stylexUnplugin } from "@stylexjs/unplugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** @stylexjs/unplugin types every bundler entry as returning `any`; a Vite plugin is at least a named object. */
const isVitePlugin = (candidate: unknown): candidate is Plugin =>
  typeof candidate === "object" && candidate !== null && "name" in candidate && typeof candidate.name === "string";

const stylexPluginCandidate: unknown = stylexUnplugin.vite({ devMode: "full" });
if (!isVitePlugin(stylexPluginCandidate))
  throw new Error("@stylexjs/unplugin's vite entry did not return a Vite plugin");
const stylexVitePlugin = stylexPluginCandidate;

// Every core subpath that is a feature rather than a pure domain: server-only, like `/operations` and `/host`.
const CORE_FEATURE_SUBPATHS = [
  "record-store",
  "store-setup",
  "recall",
  "review-threads",
  "place-context",
  "record-browsing",
  "decisions",
  "proposals",
  "inbox",
  "places-audit",
].map((feature) => `@tastebud/core/${feature}`);

/** Server function ids read `<feature>.<export>`, so a test or a stack trace can name one. */
const reviewServerFunctionId = ({ filename, functionName }: { filename: string; functionName: string }) => {
  const feature = /\/features\/([^/]+)\//.exec(filename)?.[1];
  return feature === undefined ? undefined : `${feature}.${functionName.replace(/_createServerFn_handler$/, "")}`;
};

// The CLI bundles core and effect already; left external here, `bun build --compile` resolves them to those same
// modules, one copy per binary. A predicate because Vite's `ssr.external` refuses packages whose exports are `.ts`.
const isSharedWithCli = (id: string) => id.startsWith("@tastebud/core/") || id === "effect" || id.startsWith("effect/");

export default defineConfig({
  root: import.meta.dirname,
  environments: { ssr: { build: { rolldownOptions: { external: isSharedWithCli } } } },
  // The store lives wherever TASTEBUD_STORE points; its files change under Vite and must never trigger a reload.
  // `.tastebud.config.*.ts` are core's short-lived copies of a store's config (store-config-module.ts), imported
  // through Vite and deleted at once, in whatever directory the store is; watching them reloads in a loop.
  server: { watch: { ignored: ["**/.tastebud/**", "**/*demo-store/**", "**/.index/**", "**/.tastebud.config.*.ts"] } },
  plugins: [
    stylexVitePlugin,
    tanstackStart({
      serverFns: { generateFunctionId: reviewServerFunctionId },
      // The trust boundary: core's features and infrastructure touch the filesystem and SQLite, so only `*.server.ts`
      // repos may reach them, and no browser module may import one. Core's domains are pure, so they stay reachable.
      importProtection: {
        behavior: "error",
        client: {
          specifiers: [
            "bun:sqlite",
            /^node:/,
            "@tastebud/core/operations",
            "@tastebud/core/host",
            ...CORE_FEATURE_SUBPATHS,
          ],
          files: ["**/*.server.*", "**/packages/core/src/features/**", "**/packages/core/src/infrastructure/**"],
        },
      },
    }),
    viteReact(),
  ],
});
