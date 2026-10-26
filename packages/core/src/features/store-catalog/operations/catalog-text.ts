/** The text `catalog` prints: the store, the caller's context and how to propose each kind. */
import type { CatalogView } from "#core/domains/kind-catalog/index.ts";
import type { TasteContext } from "#core/domains/places/index.ts";
import { formatContextLine, section } from "#core/domains/record-text/index.ts";

/** Kind prompts are config text written once for both surfaces, so the catalog says how to read their flags. */
const PROMPT_SPELLING_NOTE =
  "Prompts spell inputs as CLI flags. Over MCP, each is the taste_propose field of the same name with " +
  '_ for -, except --place <key> (scope: "places" with places: [<key>]) and --global (scope: "global").';

export const renderCatalogText = (result: {
  readonly catalog: CatalogView;
  readonly storeRoot: string;
  readonly context: TasteContext;
  readonly pendingByKind: Readonly<Record<string, number>>;
}) =>
  [
    `Store ${result.storeRoot} · owner ${result.catalog.owner} · resolver ${result.catalog.resolver}`,
    formatContextLine(result.context),
    section(
      "Source kinds",
      result.catalog.sourceKinds.map((kind) => `- ${kind.key}: ${kind.description ?? kind.plural}`),
    ),
    section(
      "Derived kinds",
      result.catalog.derivedKinds.map(
        (kind) =>
          `- ${kind.key} (recall: ${kind.recall}; cites ${kind.sources.join(", ")}; ${result.pendingByKind[kind.key] ?? 0} pending): ${kind.description ?? kind.plural}\n\n` +
          kind.proposalPrompt
            .split("\n")
            .map((line) => `    ${line}`)
            .join("\n"),
      ),
    ),
    PROMPT_SPELLING_NOTE,
  ].join("\n\n");
