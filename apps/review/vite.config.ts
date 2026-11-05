// vite.config.ts: the review UI, served by `taste review` (bun --bun vite). TanStack Start in SPA mode: the server
// only answers server functions and the shell; every screen renders in the browser.
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
].map((feature) => `@taste/core/${feature}`);

export default defineConfig({
  root: import.meta.dirname,
  // The store lives wherever TASTE_STORE points; its files change under Vite and must never trigger a reload.
  // `.taste.config.*.ts` are core's short-lived copies of a store's config (store-config-module.ts), imported
  // through Vite and deleted at once, in whatever directory the store is; watching them reloads in a loop.
  server: { watch: { ignored: ["**/.taste/**", "**/*demo-store/**", "**/.index/**", "**/.taste.config.*.ts"] } },
  plugins: [
    stylexVitePlugin,
    tanstackStart({
      spa: { enabled: true },
      // The trust boundary: core's features and infrastructure touch the filesystem and SQLite, so only `*.server.ts`
      // repos may reach them, and no browser module may import one. Core's domains are pure, so they stay reachable.
      importProtection: {
        behavior: "error",
        client: {
          specifiers: ["bun:sqlite", /^node:/, "@taste/core/operations", "@taste/core/host", ...CORE_FEATURE_SUBPATHS],
          files: ["**/*.server.*", "**/packages/core/src/features/**", "**/packages/core/src/infrastructure/**"],
        },
      },
    }),
    viteReact(),
  ],
});
