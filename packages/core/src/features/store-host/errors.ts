import { Data } from "effect";

/** `tastebud review` could not listen: another process holds the port. Core declares it; the CLI raises it. */
export class ReviewPortTaken extends Data.TaggedError("ReviewPortTaken")<{ readonly port: number }> {
  override get message() {
    return `Port ${String(this.port)} is already in use on 127.0.0.1. Pass --port or set review.port in the store config.`;
  }
}
