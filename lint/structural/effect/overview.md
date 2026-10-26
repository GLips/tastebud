# effect — Effect policy that needs a checker

The type-aware half of the `effect` tag. `@effect/language-service` owns type-aware *diagnostics*
(see [../../oxlint/effect/overview.md](../../oxlint/effect/overview.md)); these three are *policies* it
does not ship, and each asks a question only a type can answer, so none can be an oxlint rule.

| Rule | Blocking | What it buys |
|---|---|---|
| [no-tagged-error-instanceof](no-tagged-error-instanceof.ts) | Yes | One of our tagged errors is recovered with `catchTag`, so the error type afterwards lists exactly what is left to handle |
| [controller-effect-fn](controller-effect-fn.ts) | Yes | Every exported controller returning an Effect is `Effect.fn("<feature>.<export>")`, so each run opens a span and a trace greps to its definition |
| [is-tagged-known-tag](is-tagged-known-tag.ts) | Yes | `Predicate.isTagged(value, "Run")` names a tag `value` can carry; Effect types the tag as any string, so a typo otherwise compiles and is always false |

Their syntactic sibling, [no-manual-tag-comparison](../../oxlint/effect/no-manual-tag-comparison.ts),
is the oxlint rule that moves `_tag` branching onto `Match` and `Predicate.isTagged`; `is-tagged-known-tag`
is what makes the second as safe as the comparison it replaces.

## Span names

A span is named `<place>.<exportName>`, so the name greps to exactly one definition. In a
controller the place is the feature directory (`"runner-socket.linkToRunnerSocket"`), which
`controller-effect-fn` checks. In `infrastructure/` it is the module's file name
(`"keeper-process.connectKeeper"`); no check holds that one, so it is a convention to copy.

No check here has a per-site opt-out.

## Negative space

- `no-tagged-error-instanceof` reads only classes declared in this repo's source. A foreign carrier
  (`SqlError`, a DOM or Node error) is a boundary's to normalise. A named type guard over a value
  that is not already one of our errors (`unknown`, a foreign carrier) is silent too; a named guard
  over a union holding our errors, and an inline guard handed to `catchIf`, report.
- `controller-effect-fn` reads `controllers/` only, and only exports whose call signature returns an
  Effect. A pure helper, an Effect value, a `Layer`, a `Stream` or a `Context.Service` class is
  silent. So are `export { … }` re-exports.
- `is-tagged-known-tag` skips a subject typed `unknown`, and a curried call with no predicate-shaped
  contextual type, `Match.when(…)` included; `Match.tag` is the checked form there.
- None has fixtures; each was proven against throwaway files in a declared tree (a real
  `controllers/` directory for `controller-effect-fn`). Re-probe the same way after editing one.
