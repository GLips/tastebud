/** The npm package a release is published as: one launcher that fetches the binary from the GitHub release. */
export const TASTEBUD_NPM_PACKAGE_NAME = "tastebud";

/** The GitHub repo whose releases hold the binaries; install.sh fetches from it. */
export const TASTEBUD_RELEASE_REPO = "GLips/tastebud";

/** Every platform a release ships, as `bun build --compile --target` spells it. */
export const TASTEBUD_RELEASE_TARGETS: ReadonlyArray<string> = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-x64",
  "bun-linux-arm64",
];
