import { expect, test } from "bun:test";

import type { DerivationScope } from "@tastebud/core/places";

import { describeScopeChange, describeScopeResult, withPlace } from "./scope-draft.ts";

const WEB = "github.com/acme/web::";
const CHECKOUT = "github.com/acme/web::apps/checkout";
const BILLING = "github.com/acme/billing-api::";

test("adding a place inside or around a chosen one takes its position instead of duplicating it", () => {
  expect(withPlace({ scope: "places", places: [BILLING, WEB] }, CHECKOUT)).toEqual({
    scope: "places",
    places: [BILLING, CHECKOUT],
  });
  expect(withPlace({ scope: "places", places: [CHECKOUT] }, BILLING)).toEqual({
    scope: "places",
    places: [CHECKOUT, BILLING],
  });
});

test("says what a narrowed, moved or widened scope means", () => {
  const proposed: DerivationScope = { scope: "places", places: [WEB] };
  expect(describeScopeChange(proposed, { scope: "places", places: [CHECKOUT] })).toEqual([
    "Restricts acme/web to apps/checkout",
  ]);
  expect(describeScopeChange(proposed, { scope: "places", places: [BILLING] })).toEqual([
    "Moves it from acme/web to acme/billing-api",
  ]);
  expect(describeScopeResult({ scope: "places", places: [CHECKOUT, BILLING, "clients/acme"] })).toBe(
    "Applies in acme/web › apps/checkout, acme/billing-api and clients/acme",
  );
});
