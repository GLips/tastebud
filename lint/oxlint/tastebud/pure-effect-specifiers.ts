// Which `effect` specifiers carry no IO. Effect 4 ships its platform areas
// (`effect/http`, `effect/process`, `effect/sql`, ...) as lowercase subpaths of
// the same package, so a prefix check on `effect` admits them. This is an
// allowlist: an area Effect adds later is impure until listed here.

import { isUnderPath } from "../../policy/layout.ts";

const EFFECT_PACKAGE = "effect";

/** Lowercase areas that are pure data or codecs. Everything else lowercase reaches a platform. */
export const PURE_EFFECT_AREAS = ["schema", "encoding"] as const;

// Capitalised single segments are the root barrel's own modules (`effect/Option`).
// `FileSystem`, `Path` and `Terminal` among them are service tags; IO needs a platform layer.
const ROOT_MODULE_PATTERN = /^[A-Z][A-Za-z0-9]*$/;

/** True for `effect`, a root module such as `effect/Option`, and anything under a pure area. */
export function isPureEffectSpecifier(specifier: string): boolean {
  if (specifier === EFFECT_PACKAGE) return true;
  if (!specifier.startsWith(`${EFFECT_PACKAGE}/`)) return false;
  const subpath = specifier.slice(EFFECT_PACKAGE.length + 1);
  if (ROOT_MODULE_PATTERN.test(subpath)) return true;
  return PURE_EFFECT_AREAS.some((area) => isUnderPath(subpath, area));
}

/** True for `effect` and every subpath of it, pure or not. */
export function namesEffectPackage(specifier: string): boolean {
  return isUnderPath(specifier, EFFECT_PACKAGE);
}
