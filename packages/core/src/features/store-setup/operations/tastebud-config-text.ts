/** The text the config operations print: short summaries, with the diff and file in full where they matter. */
import type { CatalogView } from "#core/domains/kind-catalog/index.ts";
import { section } from "#core/domains/record-text/index.ts";

import type { CheckTastebudConfigResult } from "./check-tastebud-config.ts";
import type { ShowTastebudConfigResult } from "./show-tastebud-config.ts";
import type { TastebudConfigView } from "./tastebud-config-files.ts";
import type { WriteTastebudConfigResult } from "./write-tastebud-config.ts";

const kindLines = (catalog: CatalogView) => [
  ...catalog.sourceKinds.map((kind) => `- source ${kind.key}: ${kind.description ?? kind.plural}`),
  ...catalog.derivedKinds.map(
    (kind) =>
      `- derived ${kind.key} (recall: ${kind.recall}; cites ${kind.sources.join(", ")}): ${kind.description ?? kind.plural}`,
  ),
];

const renderConfigView = (view: TastebudConfigView) =>
  [
    `Owner ${view.catalog.owner} · resolver ${view.catalog.resolver} · hook limit ${view.catalog.hook.limit}, ${view.catalog.hook.budgetMs} ms · review port ${view.reviewPort}`,
    section("Kinds", kindLines(view.catalog)),
  ].join("\n\n");

const problemsSection = (problems: ReadonlyArray<string>) =>
  section(
    "Problems",
    problems.map((problem) => `- ${problem}`),
  );

const renderConfigState = (result: ShowTastebudConfigResult) => {
  if (!result.exists)
    return [
      `No Tastebud store at ${result.root} yet. Writing a config there creates it: config-write with expected_current "".`,
      `Starter text for ${result.path} (fill in the owner):`,
      result.starter ?? "",
    ].join("\n\n");
  return [
    `${result.path} · hash ${result.hash ?? ""}`,
    result.loaded === undefined ? problemsSection(result.problems) : renderConfigView(result.loaded),
    result.text ?? "",
  ].join("\n\n");
};

export const renderShowTastebudConfigText = (result: ShowTastebudConfigResult) =>
  [result.guide, renderConfigState(result)].filter((part) => part !== undefined).join("\n\n");

export const renderCheckTastebudConfigText = (result: CheckTastebudConfigResult) =>
  [
    result.valid
      ? `Valid. Writing it would ${result.createsStore ? "create the store with" : "change"} ${result.path}.`
      : `Invalid: ${result.path} would not load.`,
    result.valid ? "" : problemsSection(result.problems),
    result.loaded === undefined ? "" : renderConfigView(result.loaded),
    result.probes.length === 0
      ? ""
      : section(
          "Probes",
          result.probes.map(
            (probe) =>
              `- ${probe.probe} → ${probe.problem ?? (probe.places.length === 0 ? "unknown context" : probe.places.join(", "))}`,
          ),
        ),
    result.diff === "" ? "No change from the current file." : result.diff,
  ]
    .filter((part) => part !== "")
    .join("\n\n");

export const renderWriteTastebudConfigText = (result: WriteTastebudConfigResult) =>
  [
    `${result.created ? "Created the store at" : "Wrote the config of"} ${result.root} · hash ${result.hash}`,
    renderConfigView(result.loaded),
    result.diff === "" ? "The text was unchanged." : result.diff,
  ].join("\n\n");
