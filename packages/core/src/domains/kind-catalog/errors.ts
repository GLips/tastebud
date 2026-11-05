import { Data } from "effect";

import { isArgumentSurface, type TasteSurface } from "#core/shared/taste-surface.ts";

/** A kind key the catalog has never had. */
export class UnknownKind extends Data.TaggedError("UnknownKind")<{
  readonly kind: string;
  readonly family: "source" | "derived";
  readonly known: ReadonlyArray<string>;
}> {
  override get message() {
    const known = this.known.length === 0 ? "none are configured" : `known: ${this.known.join(", ")}`;
    return `"${this.kind}" is not a ${this.family} kind (${known}).`;
  }
}

/** A record whose kind left the catalog. Retired records are list and show only. */
export class RetiredKind extends Data.TaggedError("RetiredKind")<{
  readonly kind: string;
  readonly recordId: string;
}> {
  override get message() {
    return `${this.recordId} is a "${this.kind}", a kind no longer in tastebud.config.ts; it can only be listed and shown.`;
  }
}

/** Recall or context asked for a kind whose policy is `never`. */
export class KindNotRecallable extends Data.TaggedError("KindNotRecallable")<{
  readonly kind: string;
}> {
  sentenceFor(surface: TasteSurface) {
    const instead = isArgumentSurface(surface)
      ? `tastebud_list with kind: "${this.kind}"`
      : `\`tastebud list --kind ${this.kind}\``;
    return `"${this.kind}" has recall: never; use ${instead} instead.`;
  }
  override get message() {
    return this.sentenceFor("cli");
  }
}
