// ─── policy/package-owners — which module owns which SDK ─────────────────────
//
// The data behind `boundary/sdk-containment`. It lives here rather than inside
// that rule for the same reason the import table does: it is a fact about the
// application's shape, and a rule body is a place no reader can enumerate.
//
// This is NOT part of the import table, and folding it in is the one merge that
// did not pay. Its policy is keyed by exact package and exact module, not by
// area — and reaching an ordering where the table could express it forces
// `domain → package` to claim the domain may import any package, a cell stating
// something untrue so that machinery could work. One table, several readers; the
// rule merge was the part worth refusing.
//
// A domain importing a raw SDK genuinely breaks two policies and gets two
// diagnostics, which is deliberate. The one requirement is that both stay jointly
// actionable: the ownership message NAMES ITS OWNERS and does not prescribe an
// import, because "import the wrapper from infrastructure instead" is a fix that
// `import-policy`'s runtime purity ALSO forbids, and a pair of diagnostics that
// each forbid the other's fix is an edit loop. Read together, the two resolve to
// "the dependency has to be supplied from above", which is the right answer.
//
// A row names a package by its CANONICAL name and never by pattern. Matching a
// subpath is the reader's job — `stripe/webhooks` is `stripe` — so there is no
// anchor to get wrong, where a regex alternation of package names has one per
// entry and reads `stripe-mock` as `stripe` the first time somebody forgets it.
//
// ── Adapt ────────────────────────────────────────────────────────────────────
//
// One row per CANONICAL package name. Not a regex, and not a group: an entry
// covering three packages against two possible owners makes "the declared owner
// no longer imports this package" a question with no definition, and the rule
// then cannot tell a live containment from a dead one.
//
// A package belongs here when a SECOND import site would have to repeat a
// decision: a credential to supply, a connection to open, a per-environment value
// to pick, or behaviour that differs by platform or runtime. Any one is enough,
// and the criterion is the decision rather than the vendor — a platform or
// stdlib-shaped package counts.
//
// A row may name NO owner. `owners: []` is the total ban — the FIRST import site
// is already wrong, so there is no owner to name — and it is the right row for a
// package that is present in the tree and must never be reached from it: the
// second half of an SDK the project has standardised away from, or a sibling
// workspace package that this tree may not depend on. The rule contains such a
// package everywhere and says so in its own sentence. An empty list is never a
// row someone forgot to fill in; a package with nothing to say about it has no
// row at all.
//
// What does NOT belong is a library with no credential, no IO and no
// per-environment config: date maths, schema validation, immutable helpers.
// Wrapping those buys an indirection and nothing else, and a list that grows past
// the packages meeting the criterion teaches people the rule is arbitrary.
//
// NEGATIVE SPACE: a package with no row here is UNCONSTRAINED, and nothing
// detects that state. Whether a package reaches a network, a keychain or a
// filesystem is a judgement; the nearest mechanical proxy would flag React while
// still missing the first bad import. Adding an SDK means adding the row.
//
// NEGATIVE SPACE: an ORM is deliberately absent. `drizzle-orm` is imported by
// every repo module and by the schema, which is the LAYER-RESTRICTED pattern —
// `boundary/db-isolation` fences the DB client and schema by layer, and a wrapper
// around a query builder would only forward calls. Containment and layer
// restriction are different answers, and putting a layer-restricted package on
// this list bans it from the layer it belongs in.
//
// ─────────────────────────────────────────────────────────────────────────────

export type PackageOwnership = {
  /** The package, exactly as package.json spells it. Subpaths are the reader's job. */
  package: string;
  /**
   * The modules allowed to import it, source-root-relative and with the real
   * extension. A LIST because two modules can jointly own one capability, and an
   * explicit list is what makes "does any owner still import this?" answerable.
   *
   * EMPTY IS A VALUE, and it means the opposite of what an empty list usually
   * means here: `[]` bans the package in every file of every declared tree,
   * because no file's path can be on a list with nothing on it. It is not an
   * unfinished row, and the rule prints a different sentence for it — one that
   * says nothing may import the package, rather than naming owners it does not
   * have.
   */
  owners: string[];
  /** Which decisions the wrapper already made, and what a second caller would get wrong. */
  why: string;
};

/**
 * Owner paths are source-root-relative in whichever declared tree holds them.
 * `@taste/core`'s non-domain subpaths are one package name to this table, so
 * `taste/core-server-door` contains them instead.
 */
export const PACKAGE_OWNERS: PackageOwnership[] = [
  {
    package: "bun:sqlite",
    owners: [
      "infrastructure/record-index/record-index.ts",
      "infrastructure/record-index/index-handle.ts",
      "infrastructure/record-index/index-search.ts",
      "infrastructure/record-index/index-rows.ts",
    ],
    why: "The index file's location, the reopen-if-replaced inode check, the pragmas and the row schema are settled once in record-index. A second Database handle opens the index without the reopen check and keeps reading a file that a reindex has already swapped out, so recall answers from stale rows with no error.",
  },
  {
    package: "yaml",
    owners: ["infrastructure/frontmatter-codec.ts"],
    why: "Record files are frontmatter that every tool, agent and human edits by hand. The codec decides the stringify options (line width, key order, quoting) once. A second stringify writes the same record with different formatting, so every save produces a diff nobody made.",
  },
  {
    package: "@modelcontextprotocol/server",
    owners: ["infrastructure/mcp-sdk.ts"],
    why: "The MCP server's name, version, capabilities and stdio transport are decided once in the SDK adapter. A second server built elsewhere advertises a different tool surface over the same transport, or writes to stdout beside it and corrupts the protocol stream.",
  },
  {
    package: "@taste/mcp",
    owners: ["infrastructure/mcp-server.ts"],
    why: "`taste mcp` hands the process's stdio to the MCP server, and only one module may do that. Any other CLI import of the MCP package can start a second server or print to the stdout it owns, which corrupts the protocol for the connected agent.",
  },
];
