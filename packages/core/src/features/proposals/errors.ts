import { Data } from "effect";

import type { TasteContext } from "#core/domains/places/index.ts";
import type { RepeatMatch } from "#core/domains/record-views/index.ts";
import { formatRepeatMatchLines } from "#core/domains/repeat-detection/index.ts";
import { isArgumentSurface, type TasteSurface } from "#core/shared/taste-surface.ts";

/** A proposal with no scope given, from an unknown context. */
export class ScopeRequired extends Data.TaggedError("ScopeRequired")<{
  readonly context: TasteContext;
}> {
  sentenceFor(surface: TasteSurface) {
    const retries = isArgumentSurface(surface)
      ? [
          'scope: "places" with places: ["github.com/<owner>/<repo>::"]',
          'scope: "global"',
          'in: "<your working directory>"',
        ]
      : ["--place github.com/<owner>/<repo>::", "--global", "--in <your working directory>"];
    return `No scope: the context is unknown, so this proposal must say where it applies. Retry with ${retries.join(", or ")}.`;
  }
  override get message() {
    return this.sentenceFor("cli");
  }
}

/** How each surface spells "propose again, naming these matches and what changed". */
const nearRepeatRetryFor = (surface: TasteSurface, ids: ReadonlyArray<string>): string => {
  if (surface === "review") return "each match ticked and what is different now";
  if (isArgumentSurface(surface)) return `despite: ${JSON.stringify(ids)} and despite_case: "<what is different now>"`;
  return `${ids.map((id) => `--despite ${id}`).join(" ")} --despite-case "<what is different now>"`;
};

/** `propose` hit near repeats of the same kind with overlapping scopes, not all named in `despite`. */
export class NearRepeat extends Data.TaggedError("NearRepeat")<{
  readonly kind: string;
  readonly matches: ReadonlyArray<RepeatMatch>;
}> {
  sentenceFor(surface: TasteSurface) {
    const retry = nearRepeatRetryFor(
      surface,
      this.matches.map((match) => match.id),
    );
    return [
      `Refused: this is a near repeat of an existing ${this.kind} whose scope overlaps.`,
      ...formatRepeatMatchLines(this.matches),
      `Usually the right move is to drop it. If something genuinely changed, re-propose with ${retry}.`,
    ].join("\n");
  }
  override get message() {
    return this.sentenceFor("cli");
  }
}
