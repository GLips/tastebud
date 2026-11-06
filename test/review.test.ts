/**
 * `tastebud review` as a person runs it: the built review UI served from this process, from source or from the
 * compiled binary at TASTEBUD_TEST_BINARY. Needs `bun run build:review` first; `bun run check` does that.
 */
import { afterEach, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Schema } from "effect";

import {
  callerFor,
  captureOwnerWords,
  demoConfigText,
  makeTemporaryDirectory,
  makeTestStore,
  runOperation,
  runTastebud,
  TASTEBUD_COMMAND_LINE,
  tastebudProcessEnv,
} from "./support.ts";

const decodeReviewStarted = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ url: Schema.String })));

const runningServers: Array<Bun.Subprocess> = [];
afterEach(() => {
  for (const server of runningServers.splice(0)) server.kill();
});

/** A port in 4800-4899 nothing listens on right now. */
const findFreeReviewPort = () => {
  for (let port = 4800; port < 4900; port += 1) {
    try {
      void Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response() }).stop(true);
      return port;
    } catch {
      // Taken: try the next one.
    }
  }
  throw new Error("no free port in 4800-4899");
};

/** Starts `tastebud review` and resolves with its URL once it prints it. */
const startTastebudReview = async (store: string, port: number) => {
  const server = Bun.spawn([...TASTEBUD_COMMAND_LINE, "review", "--port", String(port), "--store", store, "--json"], {
    cwd: makeTemporaryDirectory("review-cwd"),
    env: tastebudProcessEnv({}),
    stdout: "pipe",
    stderr: "inherit",
  });
  runningServers.push(server);
  const reader = server.stdout.getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  return decodeReviewStarted(new TextDecoder().decode(value).trim()).url;
};

/** A pending belief in a fresh store, proposed as an agent would. */
const storeWithPendingBelief = async (reviewPort?: number) => {
  const store = await makeTestStore(demoConfigText(`"directories"`, undefined, reviewPort));
  const caller = await callerFor(store, { cwd: makeTemporaryDirectory("work") });
  const source = await captureOwnerWords(store, caller, "Name every export after its domain.");
  const { derivation } = await runOperation(
    store,
    "propose",
    { kind: "belief", statement: "Exports carry domain names", supports: [source] },
    caller,
  );
  return { store, derivationId: derivation.id };
};

const countRecordFiles = (store: string, directory: "decisions" | "threads") =>
  existsSync(join(store, directory))
    ? readdirSync(join(store, directory), { recursive: true }).filter((path) => String(path).endsWith(".md")).length
    : 0;

/**
 * The body the built client posts for a server function called with `{ data: fields }`: seroval's JSON.
 * Copied from the browser's request; the real-browser click is the release check.
 */
const serverFnRequestBody = (fields: Readonly<Record<string, string>>) =>
  JSON.stringify({
    t: {
      t: 10,
      i: 0,
      p: {
        k: ["data"],
        v: [
          {
            t: 10,
            i: 1,
            p: { k: Object.keys(fields), v: Object.values(fields).map((value) => ({ t: 1, s: value })) },
            o: 0,
          },
        ],
      },
      o: 0,
    },
    f: 127,
    m: [],
  });

const postServerFn = (url: string, id: string, fields: Readonly<Record<string, string>>, origin: string) =>
  fetch(new URL(`/_serverFn/${id}`, url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-tsr-serverFn": "true", origin },
    body: serverFnRequestBody(fields),
  });

const postAccept = (url: string, ref: string, origin: string) =>
  postServerFn(url, "derivation-decisions.decideReviewDerivation", { ref, outcome: "accept" }, origin);

test("tastebud review serves the shell, typed assets and a decision that lands in the store, same origin only", async () => {
  const { store, derivationId } = await storeWithPendingBelief();
  const url = await startTastebudReview(store, findFreeReviewPort());
  expect(url).toStartWith("http://127.0.0.1:");

  const shell = await fetch(url);
  expect([shell.status, shell.headers.get("content-type")]).toEqual([200, "text/html; charset=utf-8"]);
  const html = await shell.text();
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1] ?? /href="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  const stylesheet = /href="(\/assets\/[^"]+\.css)"/.exec(html)?.[1];
  const assetTypes = await Promise.all(
    [script, stylesheet, "/brand/dancer.svg"].map(async (path) => {
      const asset = await fetch(new URL(path ?? "/missing", url));
      return [asset.status, asset.headers.get("content-type")];
    }),
  );
  expect(assetTypes).toEqual([
    [200, "text/javascript;charset=utf-8"],
    [200, "text/css;charset=utf-8"],
    [200, "image/svg+xml"],
  ]);

  const foreign = await postAccept(url, derivationId, "https://elsewhere.example");
  expect(foreign.status).toBe(403);
  expect(countRecordFiles(store, "decisions")).toBe(0);
  const accepted = await postAccept(url, derivationId, new URL(url).origin);
  expect(accepted.status).toBe(200);
  expect(countRecordFiles(store, "decisions")).toBe(1);
});

test("a second tastebud review on a taken port exits 2 naming the port and how to pick another", async () => {
  const store = await makeTestStore();
  const port = findFreeReviewPort();
  await startTastebudReview(store, port);
  const second = await runTastebud(store, makeTemporaryDirectory("second"), ["review", "--port", String(port)]);
  expect(second.exitCode).toBe(2);
  expect(second.stderr).toContain(`Port ${String(port)} is already in use`);
  expect(second.stderr).toContain("--port");
});

test("a note left in the review UI lands in the store with no agent listening, and review-url finds the server", async () => {
  const port = findFreeReviewPort();
  const { store, derivationId } = await storeWithPendingBelief(port);
  const url = await startTastebudReview(store, port);
  const linked = await runTastebud(store, makeTemporaryDirectory("agent"), ["review-url", derivationId]);
  expect([linked.stdout.trim(), linked.stderr]).toEqual([`${url}derivations/${derivationId}`, ""]);
  const posted = await postServerFn(
    url,
    "derivation-decisions.postOwnerThreadNote",
    { ref: derivationId, text: "Which exports?" },
    new URL(url).origin,
  );
  expect(posted.status).toBe(200);
  expect(countRecordFiles(store, "threads")).toBe(1);
});
