import { Data } from "effect";

/** A human operation reached through an agent surface. Only the review server may run them. */
export class OperationNotAllowed extends Data.TaggedError("OperationNotAllowed")<{
  readonly operation: string;
  readonly via: string;
}> {
  override get message() {
    return `${this.operation} is the owner's decision and runs only from the review UI, not via ${this.via}.`;
  }
}
