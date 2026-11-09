/** Recall with no prompt: everything agents can be told where the inspector stands, by kind, and the no's they hear. */
import { Box, Group, Stack, Text, Tooltip } from "@mantine/core";
import type { ReactNode } from "react";

import { CountBadge } from "#review/shared/ui/count-badge.tsx";
import { capitalize, describeKindDelivery } from "#review/shared/ui/kind-identity.tsx";
import { RecallPolicyChip } from "#review/shared/ui/policy-chip.tsx";

import type { RecallAppliesHere } from "./recall-applies.ts";
import { RecallItemRow } from "./recall-item-row.tsx";
import { rejectionOutcome } from "./recall-reasons.ts";

function SectionTitle({ title, count, children }: { title: string; count: number; children?: ReactNode }) {
  return (
    <Group gap="xs">
      <Text size="sm" fw={600}>
        {title}
      </Text>
      <CountBadge count={count} />
      {children}
    </Group>
  );
}

export function RecallAppliesPanel({
  applies,
  hookLimit,
  nowhere,
}: {
  applies: RecallAppliesHere;
  hookLimit: number;
  /** Standing nowhere in particular: only global items reach. */
  nowhere: boolean;
}) {
  const total = applies.byKind.reduce((sum, group) => sum + group.accepted.length, 0);
  return (
    <Stack gap="lg">
      {total === 0 && (
        <Text size="sm" c="dimmed">
          {nowhere ? "Nothing you've accepted applies everywhere." : "Nothing you've accepted reaches agents here."}
        </Text>
      )}
      {applies.byKind.map(({ kind, accepted }) => (
        <Stack key={kind.key} gap="2xs">
          <SectionTitle title={capitalize(kind.plural)} count={accepted.length}>
            <RecallPolicyChip
              policy={kind.recall}
              about={`${describeKindDelivery(kind)}${kind.recall === "inject" ? ` At most ${hookLimit} go with one prompt.` : ""}`}
            />
          </SectionTitle>
          <Box>
            {accepted.map((item) => (
              <RecallItemRow key={item.id} item={item} />
            ))}
          </Box>
        </Stack>
      ))}
      {applies.rejected.length > 0 && (
        <Stack gap="2xs">
          <Tooltip
            label="Agents asking about matching words are told you said no, so they don't propose them again"
            withArrow
            multiline
            maw={320}
          >
            <Box w="fit-content">
              <SectionTitle title="Rejected here" count={applies.rejected.length} />
            </Box>
          </Tooltip>
          <Box>
            <RecallItemRow.Head />
            {applies.rejected.map((item) => (
              <RecallItemRow key={item.id} item={item} outcome={rejectionOutcome(item)} />
            ))}
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
