import type { KindNotRecallable, RetiredKind, UnknownKind } from "#core/domains/kind-catalog/index.ts";
import type { AmbiguousRecordRef, UnknownRecordRef } from "#core/domains/record-snapshot/index.ts";
import type { DecisionNotAllowed, WideningNeedsAcknowledgement } from "#core/features/decisions/index.server.ts";
import type { NearRepeat, ScopeRequired } from "#core/features/proposals/index.server.ts";
import type { StoreAlreadyExists, StoreNotEmpty } from "#core/features/store-setup/index.server.ts";
import type {
  DecisionLockTimeout,
  InvalidConfig,
  PlaceResolutionFailed,
  StoreNotInitialised,
  StoreWriteFailed,
} from "#core/infrastructure/store-errors.ts";
import type { CorruptRecordFile } from "#core/shared/corrupt-record-file.ts";
import type { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

import type { OperationNotAllowed } from "../errors.ts";

/** Every failure core can raise, each a tagged error whose `message` is the sentence a person or agent reads. */
export type TasteError =
  | StoreNotInitialised
  | StoreAlreadyExists
  | StoreNotEmpty
  | InvalidConfig
  | InvalidTasteInput
  | CorruptRecordFile
  | UnknownRecordRef
  | AmbiguousRecordRef
  | UnknownKind
  | RetiredKind
  | KindNotRecallable
  | ScopeRequired
  | PlaceResolutionFailed
  | NearRepeat
  | WideningNeedsAcknowledgement
  | DecisionNotAllowed
  | DecisionLockTimeout
  | StoreWriteFailed
  | OperationNotAllowed;
