/**
 * Every server function the review UI calls. A plain `.ts` name on purpose: the browser imports these
 * references (Start swaps each handler for an RPC stub), while core stays behind the
 * `taste-store.server.ts` door. Each function only shapes input and runs operations; decisions and
 * the owner's thread notes are written here and nowhere else.
 */
import { createServerFn } from "@tanstack/react-start";
import { DECISION_OUTCOMES, DERIVATION_STATUSES } from "@taste/core/vocabulary";
import { Effect, Schema } from "effect";

import { runReviewOperation, runReviewOperations } from "./taste-store.server.ts";

// Validators only shape the wire; each operation decodes its own input strictly after this.
const ContextRequestFields = {
  in: Schema.optionalKey(Schema.String),
  at: Schema.optionalKey(Schema.Array(Schema.String)),
};
const ScopeOverrideFields = {
  scope: Schema.optionalKey(Schema.Literals(["global", "places"])),
  places: Schema.optionalKey(Schema.Array(Schema.String)),
};

/** Header data every screen polls: the catalog view, the store root, and pending counts per kind. */
export const fetchReviewShell = createServerFn({ method: "GET" }).handler(() =>
  runReviewOperations((run) =>
    Effect.gen(function* () {
      const { catalog, storeRoot, pendingByKind } = yield* run("catalog", {});
      return { catalog, storeRoot, pendingByKind };
    }),
  ),
);

/** Pending derivations grouped by kind, scope and subject, each with what an accept must acknowledge. */
export const fetchInboxGroups = createServerFn({ method: "GET" }).handler(() => runReviewOperation("inbox", {}));

/** What accepting with a scope would settle on, and the near repeats it must acknowledge. */
export const fetchAcceptPreview = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ ref: Schema.String, ...ScopeOverrideFields })))
  .handler(({ data }) => runReviewOperation("accept-preview", data));

/** Accept (with a scope and acknowledgements), reject or retract. Written as the store owner. */
export const decideReviewDerivation = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        ref: Schema.String,
        outcome: Schema.Literals(DECISION_OUTCOMES),
        reason: Schema.optionalKey(Schema.String),
        acknowledges: Schema.optionalKey(Schema.Array(Schema.String)),
        ...ScopeOverrideFields,
      }),
    ),
  )
  .handler(({ data }) => runReviewOperation("decide", data));

/** The owner's note on a thread: the browser never names an author. */
export const postOwnerThreadNote = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ ref: Schema.String, text: Schema.String })))
  .handler(({ data }) => runReviewOperation("thread-note", data));

/** A kind's library: derivations filtered by status, place and text. */
export const fetchDerivationList = createServerFn({ method: "GET" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        kind: Schema.optionalKey(Schema.Array(Schema.String)),
        status: Schema.optionalKey(Schema.Literals(DERIVATION_STATUSES)),
        place: Schema.optionalKey(Schema.String),
        text: Schema.optionalKey(Schema.String),
      }),
    ),
  )
  .handler(({ data }) => runReviewOperation("list", data));

/** One record as `show` returns it, plus who is listening on threads (for a derivation's composer). */
export const fetchRecordDetail = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ ref: Schema.String })))
  .handler(({ data }) =>
    runReviewOperations((run) =>
      Effect.gen(function* () {
        const shown = yield* run("show", { ref: data.ref });
        const { listeners } = yield* run("listeners", {});
        return { ...shown, listeners };
      }),
    ),
  );

/** Every source, optionally of some kinds. Speaker filtering happens in the browser. */
export const fetchSourceList = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ kind: Schema.optionalKey(Schema.Array(Schema.String)) })))
  .handler(async ({ data }) => {
    const listed = await runReviewOperation("list", { sources: true, ...data });
    return listed.ok ? { ok: true as const, value: listed.value.sources } : listed;
  });

/** Recall and the exact hook payload for the same prompt, standing where the inspector says. */
export const fetchRecallInspection = createServerFn({ method: "GET" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        query: Schema.String,
        kind: Schema.optionalKey(Schema.Array(Schema.String)),
        history: Schema.optionalKey(Schema.Boolean),
        limit: Schema.optionalKey(Schema.Finite),
        ...ContextRequestFields,
      }),
    ),
  )
  .handler(({ data }) => {
    const { in: directory, at, query, ...recallInput } = data;
    const where = { ...(directory !== undefined && { in: directory }), ...(at !== undefined && { at }) };
    return runReviewOperations((run) =>
      Effect.gen(function* () {
        const recall = yield* run("recall", { query, ...recallInput, ...where });
        const hook = yield* run("hook-preview", { prompt: query, ...where });
        return { recall, hook };
      }),
    );
  });

/** Why one derivation (by ref, or the closest text matches) would be injected, recalled or excluded there. */
export const fetchRecallExplanation = createServerFn({ method: "GET" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        ref: Schema.optionalKey(Schema.String),
        text: Schema.optionalKey(Schema.String),
        kind: Schema.optionalKey(Schema.Array(Schema.String)),
        history: Schema.optionalKey(Schema.Boolean),
        ...ContextRequestFields,
      }),
    ),
  )
  .handler(({ data }) => runReviewOperation("recall-explain", data));

/** Places in use with counts, and the audit against the probes the reviewer keeps in the browser. */
export const fetchPlacesAudit = createServerFn({ method: "GET" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        probes: Schema.optionalKey(Schema.Array(Schema.String)),
        probe_places: Schema.optionalKey(Schema.Array(Schema.String)),
      }),
    ),
  )
  .handler(({ data }) => runReviewOperation("places", data));

/** "Where am I?": the places the configured resolver gives a directory, or the places as typed. */
export const resolveReviewContext = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct(ContextRequestFields)))
  .handler(async ({ data }) => {
    const resolved = await runReviewOperation("catalog", data);
    return resolved.ok ? { ok: true as const, value: resolved.value.context } : resolved;
  });

/** Proposes revisions replacing exact place `from` with `to`; each still needs the owner's accept. */
export const repointReviewPlace = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ from: Schema.String, to: Schema.String })))
  .handler(({ data }) => runReviewOperation("repoint", data));

/** What repointing `from` to `to` would propose, written nowhere. */
export const fetchRepointPreview = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ from: Schema.String, to: Schema.String })))
  .handler(({ data }) => runReviewOperation("repoint-preview", data));

/** "Edit scope → propose revision": the owner's pending revision of an accepted derivation. */
export const proposeScopeRevision = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        ref: Schema.String,
        scope: Schema.Literals(["global", "places"]),
        places: Schema.optionalKey(Schema.Array(Schema.String)),
        despite: Schema.optionalKey(Schema.Array(Schema.String)),
        despite_case: Schema.optionalKey(Schema.String),
      }),
    ),
  )
  .handler(({ data }) => runReviewOperation("revise-scope", data));
