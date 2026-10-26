import { Alert, Button, Center, Stack, Text, Title } from "@mantine/core";
import { Link, type ErrorComponentProps } from "@tanstack/react-router";

import { type ReviewFailure, ReviewQueryError } from "../server/review-outcome.ts";

export function RouteErrorPanel({ error, reset }: ErrorComponentProps) {
  return (
    <Center py="xl">
      <Alert color="red" title="Something went wrong" maw={560} w="100%">
        <Stack gap="sm">
          <Text>{error.message}</Text>
          <Button variant="light" color="red" onClick={reset} w="fit-content">
            Try again
          </Button>
        </Stack>
      </Alert>
    </Center>
  );
}

export function RouteNotFoundPanel() {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs">
        <Title order={3}>Nothing here</Title>
        <Text c="dimmed">
          That page does not exist. <Link to="/">Back to the inbox</Link>
        </Text>
      </Stack>
    </Center>
  );
}

const FAILURE_TITLES: Record<ReviewFailure["category"], string> = {
  input: "That request didn't make sense to the store",
  refused: "The store refused this",
  conflict: "The store changed underneath this",
  broken: "The store needs fixing",
};

/** A query's failure, inline: the screens keep polling, so this clears itself once the store reads again. */
export function QueryErrorAlert({ error }: { error: Error }) {
  const title = error instanceof ReviewQueryError ? FAILURE_TITLES[error.failure.category] : "Could not load this";
  return (
    <Alert color="red" title={title}>
      <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
        {error.message}
      </Text>
    </Alert>
  );
}
