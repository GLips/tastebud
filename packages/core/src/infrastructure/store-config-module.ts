/** Imports a store's `taste.config.ts` module. Bun runs TS natively, so no build step is needed. */
import { copyFileSync, existsSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { Effect, Predicate, Schema } from "effect";

import { formatSchemaProblems } from "#core/shared/schema-problems.ts";

import { InvalidConfig } from "./store-errors.ts";

const loadedConfigModules = new Map<string, { readonly mtimeMs: number; readonly exported: unknown }>();

export const storeConfigModuleExists = (path: string) => existsSync(path);

/**
 * The module's default export, imported fresh whenever the file's mtime changes. Bun caches modules
 * by path and ignores query strings, so each edit is imported from a uniquely named sibling copy (a
 * sibling, so the config's relative imports still resolve), deleted once loaded.
 */
const importDefaultExport = (path: string) =>
  Effect.tryPromise({
    try: async () => {
      const { mtimeMs } = statSync(path);
      const cached = loadedConfigModules.get(path);
      if (cached?.mtimeMs === mtimeMs) return cached.exported;
      const copy = join(dirname(path), `.taste.config.${process.pid}.${Date.now()}.${loadedConfigModules.size}.ts`);
      copyFileSync(path, copy);
      try {
        const module: unknown = await import(pathToFileURL(copy).href);
        const exported = Predicate.hasProperty(module, "default") ? module.default : undefined;
        loadedConfigModules.set(path, { mtimeMs, exported });
        return exported;
      } finally {
        rmSync(copy, { force: true });
      }
    },
    catch: (error) => new InvalidConfig({ path, problems: [`it failed to load: ${String(error)}`] }),
  });

/** The config module's default export, decoded by `configSchema` with every problem named. */
export const importStoreConfigModule = <A>(path: string, configSchema: Schema.Decoder<A>) =>
  Effect.flatMap(importDefaultExport(path), (exported) =>
    Predicate.isObject(exported)
      ? Schema.decodeEffect(configSchema)(exported, { errors: "all", onExcessProperty: "error" }).pipe(
          Effect.mapError((error) => new InvalidConfig({ path, problems: formatSchemaProblems(error) })),
        )
      : Effect.fail(new InvalidConfig({ path, problems: ["it must default-export a plain object"] })),
  );
