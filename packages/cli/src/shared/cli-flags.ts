/** The flags commands share, and turning parsed flags into an operation's input. */
import { Option } from "effect";
import { Flag } from "effect/cli";

export const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print the operation's result as JSON on stdout (errors too, as {error})"),
  Flag.withDefault(false),
);
export const storeFlag = Flag.optional(Flag.String("store")).pipe(
  Flag.withDescription("Store root (default: $TASTEBUD_STORE, then ~/.tastebud)"),
);

export const optionalTextFlag = (name: string, description: string) =>
  Flag.optional(Flag.String(name)).pipe(Flag.withDescription(description));
export const repeatableTextFlag = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.atLeast(0), Flag.withDescription(`${description} (repeatable)`));

/** `--in` and `--at`, for commands whose operation reads where the caller is. */
export const contextFlags = {
  in: optionalTextFlag("in", "Resolve the context as if working in this directory (default: the current directory)"),
  at: repeatableTextFlag(
    "at",
    "Take this place key as the context instead of resolving a directory, e.g. github.com/acme/web::",
  ),
};

/** `--by`: the acting agent. Core refuses `human:` names; only the review UI writes as the owner. */
export const actorFlag = Flag.String("by").pipe(
  Flag.withDescription("The acting agent, as itself, e.g. claude-code/2.x (never human:…)"),
);

export const kindsFlag = (description: string) => repeatableTextFlag("kind", description);

/** What a parsed flag holds once unwrapped. */
type CliFlagValue = string | number | boolean | ReadonlyArray<string>;

/** Parsed flags by name; an optional flag arrives as an Option. */
interface CliFlagFields {
  readonly [flag: string]: CliFlagValue | Option.Option<CliFlagValue> | undefined;
}

/** Flags that are unset stay absent, so the operation's own defaults and messages apply. */
export const definedFields = (fields: CliFlagFields): { [flag: string]: CliFlagValue } =>
  Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, Option.isOption(value) ? Option.getOrUndefined(value) : value] as const)
      .filter(
        (entry): entry is readonly [string, CliFlagValue] =>
          entry[1] !== undefined && entry[1] !== false && !(Array.isArray(entry[1]) && entry[1].length === 0),
      ),
  );
