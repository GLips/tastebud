import { describe, expect, test } from "bun:test";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { normalizeRemote, canonicalPlaceKey, placeCovers } from "@tastebud/core/places";
import { Result, Schema } from "effect";

import {
  callerFor,
  demoConfigText,
  failOperation,
  git,
  makeGitRepo,
  makeTemporaryDirectory,
  makeTestStore,
  runOperation,
  runTastebud,
} from "./support.ts";

const decodeCatalogContext = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ context: Schema.Struct({ places: Schema.Array(Schema.String) }) })),
);

/** A module a config imports for its `place` function: `<prefix>/<directory name>`. */
const placeHelperText = (prefix: string) =>
  `import { basename } from "node:path";\nexport const placeOf = (cwd: string) => ["${prefix}/" + basename(cwd)];\n`;

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

  test("a config's relative import loads, and a long-lived process re-reads it once it changes", async () => {
    const root = await makeTestStore(
      `import { placeOf } from "./helpers/places.ts";\nexport default { owner: "human:tester", place: ({ cwd }: { cwd: string }) => placeOf(cwd) };\n`,
    );
    const helperPath = join(root, "helpers", "places.ts");
    mkdirSync(join(root, "helpers"));
    writeFileSync(helperPath, placeHelperText("work"));
    const project = join(makeTemporaryDirectory("project"), "web");
    mkdirSync(project);
    const placesIn = async () => (await callerFor(root, { cwd: project })).context.places;
    expect(await placesIn()).toEqual(["work/web"]);

    writeFileSync(helperPath, placeHelperText("proj"));
    // Two writes can land in one mtime tick; the reload keys on mtime, so make the change visible.
    utimesSync(helperPath, new Date(), new Date(Date.now() + 5000));
    expect(await placesIn()).toEqual(["proj/web"]);
    // `tastebud` as a process too: the release smoke run makes this the compiled binary, bundling the import itself.
    const catalog = await runTastebud(root, project, ["catalog", "--json"]);
    expect(decodeCatalogContext(catalog.stdout).context.places).toEqual(["proj/web"]);
  });

  test("with no git installed, a git-resolver store places a checkout by its directory", async () => {
    const store = await makeTestStore();
    const repo = makeGitRepo("https://github.com/acme/web.git");
    // A PATH holding nothing at all: `tastebud` runs from process.execPath or the binary, and finds no git.
    const noGit = { PATH: makeTemporaryDirectory("no-git-path"), HOME: makeTemporaryDirectory("home") };
    const catalog = await runTastebud(store, repo, ["catalog", "--json"], noGit);
    expect(catalog.stderr).toBe("");
    expect(decodeCatalogContext(catalog.stdout).context.places).toEqual([repo]);
  });

  test("audit probes expand ~ and resolve relative paths only against the caller's cwd", async () => {
    const root = await makeTestStore(demoConfigText(`"directories"`));
    // The review server's caller: no cwd of its own.
    const reviewer = await callerFor(root, {}, undefined);
    const audit = await runOperation(root, "places", { probes: ["~"] }, reviewer);
    expect(audit.audit.probes).toEqual([{ probe: "~", places: ["~"] }]);
    const relative = await failOperation(root, "places", { probes: ["notes"] }, reviewer);
    expect(relative).toMatchObject({ _tag: "InvalidTasteInput", problems: [expect.stringContaining("probes")] });
    const work = makeTemporaryDirectory("work");
    mkdirSync(join(work, "notes"));
    const fromWork = await runOperation(root, "places", { probes: ["notes"] }, await callerFor(root, { cwd: work }));
    expect(fromWork.audit.probes).toEqual([{ probe: "notes", places: [join(work, "notes")] }]);
  });
});
