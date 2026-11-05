// What `@tastebud/core`'s export map says about each subpath. The rules take the map as an option,
// read once by `oxlint.config.ts`, so they stay pure and their specs pass a fixture map.

import { DECLARED_TREES } from "../../policy/declared-trees.ts";

const CORE_PACKAGE = "@tastebud/core";
const CORE_PACKAGE_DIR = "packages/core";
export const CORE_TREE_ROOT = `${CORE_PACKAGE_DIR}/src`;

const coreTree = DECLARED_TREES.find((tree) => tree.root === CORE_TREE_ROOT);
if (coreTree === undefined)
  throw new Error(`${CORE_TREE_ROOT} is not a declared tree; the tastebud/ door rules key on it.`);
const DOMAIN_TARGET_PREFIX = `./${CORE_TREE_ROOT.slice(CORE_PACKAGE_DIR.length + 1)}/${coreTree.vocabulary.domainsDir}/`;

export type CoreExports = Readonly<Record<string, string>>;

/** The `coreExports` rule option, or an empty map, which makes every core subpath non-domain. */
export function coreExportsOption(option: unknown): CoreExports {
  if (typeof option !== "object" || option === null || !("coreExports" in option)) return {};
  const value: unknown = option.coreExports;
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export const CORE_EXPORTS_SCHEMA = [
  {
    type: "object",
    properties: { coreExports: { type: "object", additionalProperties: { type: "string" } } },
    additionalProperties: false,
  },
];

/** True for `@tastebud/core` and any of its subpaths. */
export function namesCorePackage(specifier: string): boolean {
  return specifier === CORE_PACKAGE || specifier.startsWith(`${CORE_PACKAGE}/`);
}

/** True when `specifier` is a core subpath the export map points at a domain barrel: pure, client-safe. */
export function isCoreDomainSubpath(specifier: string, coreExports: CoreExports): boolean {
  if (!specifier.startsWith(`${CORE_PACKAGE}/`)) return false;
  const target = coreExports[`./${specifier.slice(CORE_PACKAGE.length + 1)}`];
  return target !== undefined && target.startsWith(DOMAIN_TARGET_PREFIX);
}
