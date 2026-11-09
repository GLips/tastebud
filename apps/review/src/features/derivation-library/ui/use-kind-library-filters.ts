import { useDebouncedCallback } from "@mantine/hooks";
import { getRouteApi } from "@tanstack/react-router";
import type { DerivationStatus } from "@tastebud/core/taste-vocabulary";
import { useState } from "react";

const Route = getRouteApi("/kinds/$kind");

interface KindLibraryFilter {
  readonly closed?: ReadonlyArray<DerivationStatus> | undefined;
  readonly place?: string | undefined;
  readonly text?: string | undefined;
}

/**
 * The library's filters and its folded status sections, held in the URL so going back to the list restores
 * them. The words box keeps its own text so typing stays immediate while the URL (and so the query) follows a
 * moment later.
 */
export function useKindLibraryFilters() {
  const { kind: kindKey } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [text, setText] = useState(search.text ?? "");
  const setFilter = (next: KindLibraryFilter) =>
    void navigate({
      search: (previous) => {
        const merged = { ...previous, ...next };
        return {
          ...(merged.closed !== undefined && merged.closed.length > 0 && { closed: merged.closed }),
          ...(merged.place !== undefined && { place: merged.place }),
          ...(merged.text !== undefined && merged.text !== "" && { text: merged.text }),
        };
      },
      replace: true,
    });
  const setTextFilter = useDebouncedCallback((value: string) => {
    const trimmed = value.trim();
    setFilter({ text: trimmed === "" ? undefined : trimmed });
  }, 250);
  const closed = search.closed ?? [];
  return {
    kindKey,
    search,
    text,
    setFilter,
    isSectionOpen: (status: DerivationStatus) => !closed.includes(status),
    toggleSection: (status: DerivationStatus) =>
      setFilter({
        closed: closed.includes(status) ? closed.filter((each) => each !== status) : [...closed, status],
      }),
    typeText: (value: string) => {
      setText(value);
      setTextFilter(value);
    },
  };
}
