/**
 * Tastebud's version: what `tastebud --version` and the MCP server's `serverInfo` report, and the npm
 * version the host install lines pin. The release workflow refuses a tag that is not `v${TASTEBUD_VERSION}`,
 * and `bun run check` fails until the plugin manifest and the README match it, so bump all three together.
 */
export const TASTEBUD_VERSION = "0.1.0";
