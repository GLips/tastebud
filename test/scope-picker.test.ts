/**
 * The review app's scope picker as the owner uses it, through the core rules it runs on: what a
 * click on a row does to the draft, which rows it lists, what a typed name means, and what the
 * draft says it changed.
 */
import { expect, test } from "bun:test";

import {
  applyScopePick,
  type DerivationScope,
  describeScopeChange,
  placePickerGroupsOf,
  type ScopeDraft,
  scopePickOfPlacePickerValue,
  type ScopePickState,
  typedPlaceChoicesOf,
} from "@tastebud/core/places";

const WEB = "github.com/acme/web::";
const CHECKOUT = "github.com/acme/web::apps/checkout";
const BILLING = "github.com/acme/billing-api::";
const PROPOSED_WEB: DerivationScope = { scope: "places", places: [WEB] };

/** Clicks rows by value, as the picker does, and returns the state after the last one. */
const clickRows = (start: ScopeDraft, values: ReadonlyArray<string>): ScopePickState =>
  values.reduce<ScopePickState>(
    (state, value) => {
      const pick = scopePickOfPlacePickerValue(value, state.draft);
      return pick === undefined ? state : applyScopePick(state, pick);
    },
    { draft: start, earlier: [] },
  );

test("a repo's known folders are listed indented under it", () => {
  const groups = placePickerGroupsOf({
    mode: "scope",
    draft: PROPOSED_WEB,
    places: [BILLING, WEB, CHECKOUT],
    labelOf: (place) => place,
    search: "",
  });
  const repos = groups.find((group) => group.heading === "Repos")?.options ?? [];
  expect(repos.map((option) => [option.value, option.kind === "place" && option.nested])).toEqual([
    [`place:${BILLING}`, false],
    [`place:${WEB}`, false],
    [`place:${CHECKOUT}`, true],
  ]);
});

test("ticking a folder inside the chosen repo narrows to it in place", () => {
  const { draft } = clickRows({ scope: "places", places: [BILLING, WEB] }, [`place:${CHECKOUT}`]);
  expect(draft).toEqual({ scope: "places", places: [BILLING, CHECKOUT] });
});

test("swapping one repo for another is untick then tick, and reads as a move", () => {
  const { draft } = clickRows(PROPOSED_WEB, [`place:${WEB}`, `place:${BILLING}`]);
  expect(draft).toEqual({ scope: "places", places: [BILLING] });
  expect(describeScopeChange(PROPOSED_WEB, draft)).toEqual(["Moves it from acme/web to acme/billing-api"]);
});

test("a typed unknown name is offered first as a named place", () => {
  const [first] = typedPlaceChoicesOf("clients/globex", { repoRoots: [WEB], namedPlaces: ["clients/acme"] });
  expect(first).toMatchObject({ place: "clients/globex", meaning: "as a named place" });
});

test("ticking Everywhere then unticking it restores the places chosen before it", () => {
  const start: ScopeDraft = { scope: "places", places: [CHECKOUT, BILLING] };
  expect(clickRows(start, ["everywhere"]).draft).toEqual({ scope: "global" });
  expect(clickRows(start, ["everywhere", "everywhere"]).draft).toEqual(start);
});
