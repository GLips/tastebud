/**
 * The names a release is published under. Platform packages are `${TASTEBUD_NPM_PACKAGE_NAME}-<os>-<arch>`
 * (`tastebud-darwin-arm64`, …), derived where they are written and resolved.
 */
export const TASTEBUD_NPM_PACKAGE_NAME = "tastebud";

/** The GitHub repo whose releases hold the binaries; install.sh and the launcher's hint point at it. */
export const TASTEBUD_RELEASE_REPO = "GLips/tastebud";

/** Every platform a release ships, as `bun build --compile --target` spells it. */
export const TASTEBUD_RELEASE_TARGETS: ReadonlyArray<string> = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-x64",
  "bun-linux-arm64",
];
