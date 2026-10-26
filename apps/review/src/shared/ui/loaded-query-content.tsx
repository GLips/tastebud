/** A query's three states as one element, so a screen states its failure, loading and loaded views once. */
import { Center, Loader } from "@mantine/core";
import type { ComponentType, ReactNode } from "react";

import { QueryErrorAlert } from "./route-panels.tsx";

const PAGE_LOADER = (
  <Center py="xl">
    <Loader size="sm" />
  </Center>
);

export function LoadedQueryContent<Data>({
  query,
  loading = PAGE_LOADER,
  failurePanel: FailurePanel = QueryErrorAlert,
  children,
}: {
  query: { readonly error: Error | null; readonly data: Data | undefined };
  loading?: ReactNode;
  failurePanel?: ComponentType<{ error: Error }>;
  children: (data: Data) => ReactNode;
}) {
  if (query.error) return <FailurePanel error={query.error} />;
  if (query.data === undefined) return loading;
  return children(query.data);
}
