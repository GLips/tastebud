import { Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Schema } from "effect";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { LoadedQueryContent } from "#review/shared/ui/loaded-query-content.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { placeFormOf } from "#review/shared/ui/place-chips.tsx";

import { RecallAppliesPanel } from "./recall-applies-panel.tsx";
import { RecallCandidateGroups } from "./recall-candidate-groups.tsx";
import { RecallContextSummary, RecallFailure } from "./recall-context.tsx";
import { RecallItemExplanation } from "./recall-item-explanation.tsx";
import { recallInspectionQuery, recallItemRefOf } from "./recall-queries.ts";
import { type RecallCheck, RecallQueryBar } from "./recall-query-bar.tsx";
import { useRecallAppliesHere } from "./use-recall-applies-here.ts";

/**
 * `in` is a directory to resolve and `at` a place taken as given, the same terms core uses. With
 * neither, Recall stands at the first known repo unless `nowhere` says to stand nowhere in particular.
 */
export const RecallSearch = Schema.Struct({
  q: Schema.optionalKey(Schema.String),
  in: Schema.optionalKey(Schema.String),
  at: Schema.optionalKey(Schema.String),
  nowhere: Schema.optionalKey(Schema.Boolean),
  kind: Schema.optionalKey(Schema.String),
  history: Schema.optionalKey(Schema.Boolean),
});

const Route = getRouteApi("/recall");

/** A bare visit stands somewhere real: the first known repo, so the page opens on an answer. */
function standingOf(search: RecallCheck, places: ReadonlyArray<string>): RecallCheck {
  if (search.in !== undefined || search.at !== undefined || search.nowhere === true) return search;
  const firstRepo = places.find((place) => placeFormOf(place) === "repo");
  return firstRepo === undefined ? search : { ...search, at: firstRepo };
}

export function RecallInspectorPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const check = standingOf(search, known.places);
  const itemRef = recallItemRefOf(check.q ?? "");
  const submitted = {
    query: itemRef === undefined ? (check.q ?? "") : "",
    kind: check.kind,
    history: check.history ?? false,
    in: check.in,
    at: check.at === undefined || check.in !== undefined ? undefined : [check.at],
  };
  const inspection = useQuery(recallInspectionQuery(submitted));
  const { nowhere, standing, applies } = useRecallAppliesHere(submitted);

  return (
    <Stack gap="md">
      <ReviewPageHeader
        title="Recall"
        purpose="What an agent is told in a place: everything that applies there, and for a prompt, what gets sent with it and why."
      />
      <Stack gap="2xs">
        <RecallQueryBar
          key={`${search.q ?? ""}|${search.in ?? ""}`}
          check={check}
          onRun={(next) => void navigate({ search: next, replace: true })}
        />
        {check.in !== undefined && standing !== undefined && <RecallContextSummary context={standing} />}
        {check.at !== undefined && search.at === undefined && (
          <Text size="xs" c="dimmed">
            Standing in {known.labelOf(check.at)}, your first repo. Pick another place, or nowhere, in the bar.
          </Text>
        )}
      </Stack>

      {itemRef !== undefined && <RecallItemExplanation request={{ ...submitted, lookup: { ref: itemRef } }} />}
      {itemRef === undefined && submitted.query === "" && (
        <RecallAppliesPanel applies={applies} hookLimit={catalog?.hook.limit ?? 3} nowhere={nowhere} />
      )}
      {submitted.query !== "" && (
        <LoadedQueryContent query={inspection} failurePanel={RecallFailure}>
          {(inspected) => {
            const surfaced = new Set(
              [
                ...inspected.hook.items,
                ...inspected.recall.accepted,
                ...inspected.recall.history,
                ...inspected.recall.excluded,
              ].map((item) => item.id),
            );
            return (
              <RecallCandidateGroups
                recall={inspected.recall}
                hook={inspected.hook}
                catalog={catalog}
                appliesUnmatched={applies.byKind
                  .flatMap((group) => group.accepted)
                  .filter((item) => !surfaced.has(item.id))}
              />
            );
          }}
        </LoadedQueryContent>
      )}
    </Stack>
  );
}
