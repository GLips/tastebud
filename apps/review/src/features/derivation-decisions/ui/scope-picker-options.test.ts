import { expect, test } from "bun:test";

import { formatPlaceLabel } from "@tastebud/core/places";

import { type ScopePickerOption, scopePickerGroupsOf } from "./scope-picker-options.ts";

const WEB = "github.com/acme/web::";
const CHECKOUT = "github.com/acme/web::apps/checkout";
const BILLING = "github.com/acme/billing-api::";

const rowsOf = (input: Partial<Parameters<typeof scopePickerGroupsOf>[0]>) =>
  scopePickerGroupsOf({
    draft: { scope: "places", places: [WEB] },
    proposed: { scope: "places", places: [WEB] },
    places: [WEB, CHECKOUT, BILLING, "clients/acme"],
    labelOf: formatPlaceLabel,
    search: "",
    ...input,
  }).map((group) => ({ heading: group.heading, rows: group.options.map(describeRow) }));

const describeRow = (option: ScopePickerOption): string => {
  switch (option.kind) {
    case "place":
      return `${option.nested ? "  " : ""}${option.label} [${option.state}${option.proposed ? ", proposed" : ""}]`;
    case "typed":
      return `${option.place} ${option.meaning}`;
    default:
      return option.kind;
  }
};

test("lists Everywhere, repos with their folders nested, named places, then a path hint", () => {
  expect(rowsOf({})).toEqual([
    { heading: undefined, rows: ["everywhere"] },
    {
      heading: "Repos",
      rows: ["acme/billing-api [open]", "acme/web [chosen, proposed]", "  apps/checkout [inside]"],
    },
    { heading: "Named places", rows: ["clients/acme [open]"] },
    { heading: undefined, rows: ["type-path"] },
  ]);
});

test("a typed unknown path is offered as a folder in each repo the scope touches and as a name", () => {
  expect(rowsOf({ search: "apps/admin" }).at(-1)).toEqual({
    heading: "Use a new place",
    rows: ["github.com/acme/web::apps/admin in acme/web", "apps/admin as a named place"],
  });
  expect(rowsOf({ search: "clients/globex" }).at(-1)?.rows[0]).toBe("clients/globex as a named place");
});

test("while Everywhere is chosen, the places chosen before it are one row away", () => {
  expect(rowsOf({ draft: { scope: "global" }, earlier: [CHECKOUT] })[0]?.rows).toEqual(["everywhere", "earlier"]);
});
