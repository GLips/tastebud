import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { Result } from "effect";

import { normalizeRemote } from "../src/core/index.ts";
import { canonicalPlaceKey, placeCovers } from "../src/shared/places.ts";
import { callerFor, git, makeGitRepo, makeTemporaryDirectory, makeTestStore, runOperation } from "./support.ts";

describe("places", () => {
  test("normalizeRemote: one repo id per remote, credentials stripped, ports kept, local paths flagged", () => {
    const table: ReadonlyArray<readonly [string, ReturnType<typeof normalizeRemote>]> = [
      ["git@github.com:GLips/taste.git", { kind: "hosted", repoId: "github.com/GLips/taste" }],
      ["github.com:GLips/taste", { kind: "hosted", repoId: "github.com/GLips/taste" }],
      ["ssh://git@GitHub.com/GLips/taste.git", { kind: "hosted", repoId: "github.com/GLips/taste" }],
      ["ssh://git@git.example.com:2222/team/app.git", { kind: "hosted", repoId: "git.example.com:2222/team/app" }],
      ["https://user:secret@github.com/GLips/taste.git", { kind: "hosted", repoId: "github.com/GLips/taste" }],
      ["https://gitlab.com/a/b/c/", { kind: "hosted", repoId: "gitlab.com/a/b/c" }],
      ["https://git.example.com:8443/team/app", { kind: "hosted", repoId: "git.example.com:8443/team/app" }],
      ["git://github.com/GLips/taste.git", { kind: "hosted", repoId: "github.com/GLips/taste" }],
      // An explicit default port is still a different spelling of the server, so it is kept.
      ["https://git.example.com:443/team/app", { kind: "hosted", repoId: "git.example.com:443/team/app" }],
      ["https://git.example.com/team/my%20app", { kind: "hosted", repoId: "git.example.com/team/my app" }],
      ["file:///srv/repos/taste.git", { kind: "local" }],
      ["/srv/repos/taste.git", { kind: "local" }],
      ["../upstream", { kind: "local" }],
    ];
    for (const [url, expected] of table) expect([url, normalizeRemote(url)]).toEqual([url, expected]);
    expect(normalizeRemote("https://github.com").kind).toBe("malformed");
    expect(normalizeRemote("ftp://example.com/x").kind).toBe("malformed");
    expect(normalizeRemote("https://example.com/team/%ZZ").kind).toBe("malformed");
  });

  test("placeCovers: ancestors and equals cover, descendants and other roots don't", () => {
    const root = "github.com/acme/web::";
    expect(placeCovers(root, "github.com/acme/web::apps/checkout")).toBe(true);
    expect(placeCovers(root, root)).toBe(true);
    expect(placeCovers("github.com/acme/web::apps/checkout", root)).toBe(false);
    expect(placeCovers("github.com/acme/web::apps", "github.com/acme/web::apps-old")).toBe(false);
    // `gitlab.com/a/b::` names repo a/b, not a subdirectory of repo a.
    expect(placeCovers("gitlab.com/a::", "gitlab.com/a/b::")).toBe(false);
    expect(placeCovers("~/Programming", "~/Programming/x")).toBe(true);
    expect(placeCovers("~", "/Users/elsewhere")).toBe(false);
    expect(placeCovers("clients/acme", "clients/acme/ads")).toBe(true);
    expect(placeCovers("clients/acme", "~/clients/acme")).toBe(false);
    expect(Result.getOrThrow(canonicalPlaceKey("GitHub.com/Acme/Web.git::/apps//checkout/"))).toBe(
      "github.com/Acme/Web::apps/checkout",
    );
    expect(Result.isFailure(canonicalPlaceKey("clients/../acme"))).toBe(true);
  });

  test("git resolver: a worktree and a second clone give the same key; no remote gives a directory place", async () => {
    const root = await makeTestStore();
    const repo = makeGitRepo("https://github.com/acme/web.git", ["apps/billing"]);
    const worktree = join(makeTemporaryDirectory("worktree"), "wt");
    git(repo, "worktree", "add", "-q", worktree, "-b", "side");
    const clone = join(makeTemporaryDirectory("clone"), "web");
    git(makeTemporaryDirectory("scratch"), "clone", "-q", repo, clone);
    // A fresh clone's origin is the local path it came from; point it at the same host in scp spelling.
    git(clone, "remote", "set-url", "origin", "git@github.com:acme/web.git");

    const placesIn = async (directory: string) => (await callerFor(root, { cwd: directory })).context.places;
    const subdirectory = "github.com/acme/web::apps/billing";
    const billingDirectories = [repo, worktree, clone].map((checkout) => join(checkout, "apps/billing"));
    for (const billing of billingDirectories) mkdirSync(billing, { recursive: true });
    expect(await Promise.all(billingDirectories.map(placesIn))).toEqual([
      [subdirectory],
      [subdirectory],
      [subdirectory],
    ]);
    expect(await placesIn(repo)).toEqual(["github.com/acme/web::"]);
    expect(placeCovers("github.com/acme/web::", subdirectory)).toBe(true);

    const unhosted = makeGitRepo(undefined);
    expect(await placesIn(unhosted)).toEqual([unhosted]);
    const catalog = await runOperation(root, "catalog", { in: unhosted }, await callerFor(root, {}));
    expect(catalog.context).toEqual({ places: [unhosted], origin: "in", cwd: unhosted });
  });
});
