/**
 * The review app's scope picker as the owner uses it, through the core rules it runs on: a property
 * menu where a click uses a place and "+ Also" adds one, which rows it lists with which side
 * action, what a typed name means, and what the draft says it changed.
 */
import { expect, test } from "bun:test";

import {
  applyScopePick,
  type DerivationScope,
  describeScopeChange,
  type PlacePickerOption,
  placePickerGroupsOf,
  type ScopeDraft,
  scopePickOfPlacePickerValue,
  typedPlaceChoicesOf,
} from "@tastebud/core/places";

const WEB = "github.com/acme/web::";
const CHECKOUT = "github.com/acme/web::apps/checkout";
const BILLING = "github.com/acme/billing-api::";
const PROPOSED_WEB: DerivationScope = { scope: "places", places: [WEB] };

const clickRow = (draft: ScopeDraft, value: string): ScopeDraft => {
  const pick = scopePickOfPlacePickerValue(value);
  return pick === undefined ? draft : applyScopePick(draft, pick);
};

const repoRowsOf = (draft: ScopeDraft): ReadonlyArray<PlacePickerOption> =>
  placePickerGroupsOf({
    mode: "scope",
    draft,
    places: [BILLING, WEB, CHECKOUT],
    labelOf: (place) => place,
    search: "",
  }).find((group) => group.heading === "Repos")?.options ?? [];

test("a repo's folders are listed under it, by their path alone", () => {
  expect(
    repoRowsOf(PROPOSED_WEB).map((option) => option.kind === "place" && [option.label, option.nested, option.extra]),
  ).toEqual([
    [BILLING, false, "also"],
    [WEB, false, undefined],
    ["apps/checkout", true, undefined],
  ]);
});

test("a click uses that place: narrowing and swapping are one click each", () => {
  expect(clickRow(PROPOSED_WEB, `place:${CHECKOUT}`)).toEqual({ scope: "places", places: [CHECKOUT] });
  const swapped = clickRow(PROPOSED_WEB, `place:${BILLING}`);
  expect(swapped).toEqual({ scope: "places", places: [BILLING] });
  expect(describeScopeChange(PROPOSED_WEB, swapped)).toEqual(["Moves it from acme/web to acme/billing-api"]);
});

test("+ Also adds beside the chosen places, and each of several can then be removed", () => {
  const both = applyScopePick(PROPOSED_WEB, { pick: "add", place: BILLING });
  expect(both).toEqual({ scope: "places", places: [WEB, BILLING] });
  expect(repoRowsOf(both).flatMap((option) => (option.kind === "place" ? [option.extra] : []))).toEqual([
    "remove",
    "remove",
    undefined,
  ]);
});

test("a typed unknown name is offered first as a named place", () => {
  const [first] = typedPlaceChoicesOf("clients/globex", { repoRoots: [WEB], namedPlaces: ["clients/acme"] });
  expect(first).toMatchObject({ place: "clients/globex", meaning: "as a named place" });
});
