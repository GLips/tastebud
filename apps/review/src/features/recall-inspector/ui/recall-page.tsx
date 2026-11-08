import { Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Schema } from "effect";

import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { LoadedQueryContent } from "#review/shared/ui/loaded-query-content.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";

import { RecallAppliesPanel } from "./recall-applies-panel.tsx";
import { RecallCandidateGroups } from "./recall-candidate-groups.tsx";
import { RecallCheckForm } from "./recall-check-form.tsx";
import { RecallContextSummary, RecallFailure } from "./recall-context.tsx";
import { RecallFindItemPanel } from "./recall-find-item-panel.tsx";
import { recallInspectionQuery } from "./recall-queries.ts";
import { useRecallAppliesHere } from "./use-recall-applies-here.ts";

/** `in` is a directory to resolve and `at` a place taken as given, the same terms core uses. */
export const RecallSearch = Schema.Struct({
  q: Schema.optionalKey(Schema.String),
  in: Schema.optionalKey(Schema.String),
  at: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(Schema.String),
  history: Schema.optionalKey(Schema.Boolean),
});

const Route = getRouteApi("/recall");

export function RecallInspectorPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const catalog = useReviewCatalog();
  const submitted = {
    query: search.q ?? "",
    kind: search.kind,
    history: search.history ?? false,
    in: search.in,
    at: search.at === undefined ? undefined : [search.at],
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
        <RecallCheckForm check={search} onRun={(next) => void navigate({ search: next, replace: true })} />
        {search.in !== undefined && standing !== undefined && <RecallContextSummary context={standing} />}
      </Stack>

      {submitted.query === "" ? (
        <RecallAppliesPanel applies={applies} hookLimit={catalog?.hook.limit ?? 3} nowhere={nowhere} />
      ) : (
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
              <Stack gap="lg">
                <RecallCandidateGroups
                  recall={inspected.recall}
                  hook={inspected.hook}
                  catalog={catalog}
                  appliesUnmatched={applies.byKind
                    .flatMap((group) => group.accepted)
                    .filter((item) => !surfaced.has(item.id))}
                />
                <RecallFindItemPanel
                  request={{ kind: submitted.kind, history: submitted.history, in: submitted.in, at: submitted.at }}
                  recall={inspected.recall}
                  hook={inspected.hook}
                />
              </Stack>
            );
          }}
        </LoadedQueryContent>
      )}
    </Stack>
  );
}
