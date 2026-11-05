/** The text the config operations print: short summaries, with the diff and file in full where they matter. */
import type { CatalogView } from "#core/domains/kind-catalog/index.ts";
import { section } from "#core/domains/record-text/index.ts";

import type { CheckTasteConfigResult } from "./check-taste-config.ts";
import type { ShowTasteConfigResult } from "./show-taste-config.ts";
import type { TasteConfigView } from "./taste-config-files.ts";
import type { WriteTasteConfigResult } from "./write-taste-config.ts";

const kindLines = (catalog: CatalogView) => [
  ...catalog.sourceKinds.map((kind) => `- source ${kind.key}: ${kind.description ?? kind.plural}`),
  ...catalog.derivedKinds.map(
    (kind) =>
      `- derived ${kind.key} (recall: ${kind.recall}; cites ${kind.sources.join(", ")}): ${kind.description ?? kind.plural}`,
  ),
];

const renderConfigView = (view: TasteConfigView) =>
  [
    `Owner ${view.catalog.owner} · resolver ${view.catalog.resolver} · hook limit ${view.catalog.hook.limit}, ${view.catalog.hook.budgetMs} ms · review port ${view.reviewPort}`,
    section("Kinds", kindLines(view.catalog)),
  ].join("\n\n");

const problemsSection = (problems: ReadonlyArray<string>) =>
  section(
    "Problems",
    problems.map((problem) => `- ${problem}`),
  );

export const renderShowTasteConfigText = (result: ShowTasteConfigResult) => {
  if (!result.exists)
    return [
      `No Taste store at ${result.root} yet. Writing a config there creates it: config-write with expected_current "".`,
      `Starter text for ${result.path} (fill in the owner):`,
      result.starter ?? "",
    ].join("\n\n");
  return [
    `${result.path} · hash ${result.hash ?? ""}`,
    result.loaded === undefined ? problemsSection(result.problems) : renderConfigView(result.loaded),
    result.text ?? "",
  ].join("\n\n");
};

export const renderCheckTasteConfigText = (result: CheckTasteConfigResult) =>
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

export const renderWriteTasteConfigText = (result: WriteTasteConfigResult) =>
  [
    `${result.created ? "Created the store at" : "Wrote the config of"} ${result.root} · hash ${result.hash}`,
    renderConfigView(result.loaded),
    result.diff === "" ? "The text was unchanged." : result.diff,
  ].join("\n\n");
