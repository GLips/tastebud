/**
 * Tastebud's version: what `tastebud --version` and the MCP server's `serverInfo` report, and the npm
 * version the host install lines pin. `bun run release <version>` bumps it with the plugin manifest and the
 * README; the release workflow refuses a tag that is not `v${TASTEBUD_VERSION}`.
 */
export const TASTEBUD_VERSION = "0.2.0";
