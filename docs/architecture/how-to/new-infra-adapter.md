# Add an infrastructure adapter

An adapter is the one module that talks to an SDK, a file format, a process or the OS. Everything else calls it.

1. **Place it.** Core adapters go in `packages/core/src/infrastructure/`; a shell's own process concerns
   (terminal, browser opener, argv) go in that shell's `infrastructure/`. Name it for what it owns
   (`frontmatter-codec.ts`, `git-repository.ts`), not for the package.
2. **Own the package.** Add a row to `lint/policy/package-owners.ts` naming the adapter as the only importer.
   `boundary/sdk-containment` then rejects any other import site. Add the package to the owning package's
   `package.json`; installs are isolated, so it is not visible elsewhere.
3. **Keep it narrow.** Export plain functions or Effects over storage-level types. An adapter imports no
   feature and no domain: if it needs domain knowledge (a decoder, a search projection), take it as an
   argument from the feature that composes it, as `record-index` does.
4. **Errors.** Declare its failures in `infrastructure/store-errors.ts` (or `shared/` if a domain also raises
   them), add them to `TasteError`, and categorise them in `describeTasteFailure`.
5. **Decode at the edge.** Whatever comes back from the outside world is decoded with Effect Schema here,
   before it reaches a feature. No `as` casts on SDK results.
6. **Time and randomness.** Read the clock through Effect `Clock` and ids through `record-ids.ts`, so tests
   control both.
7. **Browser.** If review code runs it in the browser, it must be listed in
   `CLIENT_SAFE_INFRASTRUCTURE`; otherwise it stays behind `taste-core.server.ts`.
8. **Inject it.** Features yield the adapter's service or call its functions. Tests use a real scratch store;
   mock only at the network or clock boundary.

Run `bun run check`.
