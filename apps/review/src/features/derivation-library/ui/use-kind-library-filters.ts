import { useDebouncedCallback } from "@mantine/hooks";
import { getRouteApi } from "@tanstack/react-router";
import type { DerivationStatus } from "@tastebud/core/taste-vocabulary";
import { useState } from "react";

const Route = getRouteApi("/kinds/$kind");

interface KindLibraryFilter {
  readonly status?: DerivationStatus | undefined;
  readonly place?: string | undefined;
  readonly text?: string | undefined;
}

/**
 * The library's filters, held in the URL. The words box keeps its own text so typing stays immediate while the
 * URL (and so the query) follows a moment later.
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
          ...(merged.status !== undefined && { status: merged.status }),
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
  return {
    kindKey,
    search,
    text,
    setFilter,
    typeText: (value: string) => {
      setText(value);
      setTextFilter(value);
    },
  };
}
