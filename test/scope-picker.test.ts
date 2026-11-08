/**
 * The review app's scope picker as the owner uses it, through the core rules it runs on: what a
 * pick does to the draft, what a typed name means, and what the draft says it changed.
 */
import { expect, test } from "bun:test";

import { applyScopePick, type DerivationScope, describeScopeChange, typedPlaceChoicesOf } from "@tastebud/core/places";

const WEB = "github.com/acme/web::";
const CHECKOUT = "github.com/acme/web::apps/checkout";
const BILLING = "github.com/acme/billing-api::";
const PROPOSED_WEB: DerivationScope = { scope: "places", places: [WEB] };

test("narrowing to a folder replaces its repo in place", () => {
  const { draft } = applyScopePick(
    { draft: { scope: "places", places: [BILLING, WEB] }, earlier: [] },
    { pick: "add", place: CHECKOUT },
  );
  expect(draft).toEqual({ scope: "places", places: [BILLING, CHECKOUT] });
});

test("swapping one repo for another reads as a move", () => {
  expect(describeScopeChange(PROPOSED_WEB, { scope: "places", places: [BILLING] })).toEqual([
    "Moves it from acme/web to acme/billing-api",
  ]);
});

test("a typed unknown name is offered first as a named place", () => {
  const [first] = typedPlaceChoicesOf("clients/globex", { repoRoots: [WEB], namedPlaces: ["clients/acme"] });
  expect(first).toMatchObject({ place: "clients/globex", meaning: "as a named place" });
});

test("Everywhere and back restores the places chosen before it", () => {
  const everywhere = applyScopePick(
    { draft: { scope: "places", places: [CHECKOUT, BILLING] }, earlier: [] },
    {
      pick: "everywhere",
    },
  );
  expect(everywhere.draft).toEqual({ scope: "global" });
  expect(applyScopePick(everywhere, { pick: "earlier" }).draft).toEqual({
    scope: "places",
    places: [CHECKOUT, BILLING],
  });
});
