import { Effect } from "effect";

/** Platforms whose opener isn't freedesktop's `xdg-open`. */
const BROWSER_OPENER_BY_PLATFORM: ReadonlyMap<NodeJS.Platform, string> = new Map([
  ["darwin", "open"],
  ["win32", "start"],
]);

/** Opens a URL in the desktop browser; a no-op where there is no desktop to open it on. */
export const openInBrowser = (url: string) =>
  Effect.sync(() => {
    const opener = BROWSER_OPENER_BY_PLATFORM.get(process.platform) ?? "xdg-open";
    Bun.spawn([opener, url], { stdio: ["ignore", "ignore", "ignore"] }).unref();
  });
