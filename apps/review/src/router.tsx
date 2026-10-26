import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { createReviewQueryClient } from "#review/infrastructure/providers/query-client.ts";
import { routeTree } from "#review/routeTree.gen.ts";
import { RouteErrorPanel, RouteNotFoundPanel } from "#review/shared/ui/route-panels.tsx";

export function getRouter() {
  const queryClient = createReviewQueryClient();
  return createTanStackRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteErrorPanel,
    defaultNotFoundComponent: RouteNotFoundPanel,
    Wrap: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
