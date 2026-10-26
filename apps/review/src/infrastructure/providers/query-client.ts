import { QueryClient } from "@tanstack/react-query";

/** No retries: the server reads files on this machine, so a failure is an answer, not a blip. */
export const createReviewQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } } });
