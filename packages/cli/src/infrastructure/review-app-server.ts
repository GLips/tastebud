/**
 * The `@taste/review` owner: serves the built review UI in this process, from a source checkout (after
 * `bun run build:review`) and from a compiled binary alike. Embedded client files are static routes; the shell
 * and every server function go to TanStack Start's server entry.
 */
import { Effect, Schema } from "effect";

import { ReviewPortTaken } from "./taste-core.ts";

const IMMUTABLE_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

const isAddressInUse = Schema.is(Schema.Struct({ code: Schema.Literal("EADDRINUSE") }));

/** The content type comes from the URL's extension: an embedded file's own name may not carry one. */
const reviewAssetResponse = (urlPath: string, filePath: string) => {
  const headers = new Headers({ "content-type": Bun.file(urlPath).type });
  // Vite content-hashes everything under /assets/, so a name never changes meaning; brand files are not hashed.
  if (urlPath.startsWith("/assets/")) headers.set("cache-control", IMMUTABLE_ASSET_CACHE_CONTROL);
  return new Response(Bun.file(filePath), { headers });
};

/**
 * Listens on 127.0.0.1 (not `localhost`, which Bun binds to one address family while a browser may try the
 * other) until the process ends. Only a taken port is a typed failure; any other bind error is a bug.
 */
export const serveReviewApp = (port: number) =>
  Effect.gen(function* () {
    // A literal lazy import: `bun build --compile` still embeds the bundle, and other commands never load it. From
    // an unbuilt checkout this dies naming apps/review/dist/review-bundle.ts: run `bun run build:review`.
    const { REVIEW_CLIENT_ASSETS, fetchReviewServerEntry } = yield* Effect.promise(
      () => import("@taste/review/bundle"),
    );
    const routes = Object.fromEntries(
      Object.entries(REVIEW_CLIENT_ASSETS).map(([urlPath, filePath]) => [
        urlPath,
        reviewAssetResponse(urlPath, filePath),
      ]),
    );
    yield* Effect.suspend(() => {
      try {
        return Effect.succeed(Bun.serve({ hostname: "127.0.0.1", port, routes, fetch: fetchReviewServerEntry }));
      } catch (error) {
        return isAddressInUse(error) ? Effect.fail(new ReviewPortTaken({ port })) : Effect.die(error);
      }
    });
  });
