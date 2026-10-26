# Error conventions

## Where an error is declared

Every failure is an Effect tagged error (`Data.TaggedError`) whose `message` is the sentence a person or agent
reads. It is declared at the lowest layer that raises it, because a lower layer may not import a higher one:

| Raised by | Declared in | Examples |
|---|---|---|
| Several layers | `packages/core/src/shared/` | `InvalidTasteInput`, `CorruptRecordFile` |
| Infrastructure | `infrastructure/store-errors.ts` | `StoreNotInitialised`, `InvalidConfig`, `StoreWriteFailed`, `DecisionLockTimeout`, `PlaceResolutionFailed` |
| A domain | `domains/<d>/errors.ts` | `UnknownKind`, `RetiredKind`, `UnknownRecordRef` |
| A feature | `features/<f>/errors.ts` | `NearRepeat`, `ScopeRequired`, `WideningNeedsAcknowledgement`, `OperationNotAllowed` |

An error that reads differently per surface implements `sentenceFor(surface)`; `NearRepeat` tells the CLI to
pass `--despite`, MCP to pass `despite`, and review to tick each match.

## One union, one mapper

`features/operation-registry/operations/taste-error.ts` is `TasteError`, the union of every failure core can
raise. Adding an error means adding it there; the mapper's exhaustive match then fails to compile until it is
categorised.

`describe-taste-failure.ts` exports `describeTasteFailure`, the single mapper from a `TasteError` to what a
shell shows: a sentence, a category (`input`, `refused`, `conflict`, `broken`), the tag, and the CLI exit
code. The CLI, the MCP server and the review server all call it, so a failure reads the same everywhere.
Shells do not map errors themselves, which is why the catalog's per-call-site
`effect/require-failure-disclosure` is not used (see [decisions.md](decisions.md)).

## Matching

Match on tags with `Match.valueTags`, `Effect.catchTag` or `Effect.catchTags`. Comparing `_tag` by hand and
`instanceof` on tagged errors are rejected (`effect/no-manual-tag-comparison`,
`effect/no-tagged-error-instanceof`), because both silently miss a renamed or added tag.

## Defects and boundaries

Trust internal code: no try/catch or defensive checks for what cannot happen. Decode at boundaries: store
files, `taste.config.ts`, SQLite rows, MCP arguments and process input are decoded with Effect Schema and fail
as typed errors. Defects (bugs) propagate. The one deliberate exception is the prompt hook, which must never
break a prompt: `run-prompt-hook.ts` runs with `Effect.runPromiseExit` and stays silent on failure.

Review receives failures as a `ReviewOutcome` envelope (`shared/review-outcome.ts`); `unwrapReviewOutcome`
turns a failed one into a `ReviewQueryError` that `QueryErrorAlert` titles by category.
