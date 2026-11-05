/**
 * The names a release is published under. `@taste-placeholder/taste` is a valid npm name, so packing and
 * installing work offline; nothing publishes until Graham picks the real one (`taste` and `taste-cli` are taken).
 */
export const TASTE_NPM_PACKAGE_NAME = "@taste-placeholder/taste";

/** The GitHub repo whose releases hold the binaries; install.sh and the launcher's hint point at it. */
export const TASTE_RELEASE_REPO = "GLips/taste";

/** Every platform a release ships, as `bun build --compile --target` spells it. */
export const TASTE_RELEASE_TARGETS: ReadonlyArray<string> = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-x64",
  "bun-linux-arm64",
];
