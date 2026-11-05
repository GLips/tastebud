// The shape of dist/review-bundle.ts, which scripts/write-review-bundle-module.ts generates after `vite build`.
// Committed so typecheck never needs a build.

/** URL path (`/assets/index-abc.js`) to the file holding it: in dist/ from source, embedded in a binary. */
export declare const REVIEW_CLIENT_ASSETS: Readonly<Record<string, string>>;

/** TanStack Start's server entry: the HTML shell and every server function. */
export declare const fetchReviewServerEntry: (request: Request) => Promise<Response>;
