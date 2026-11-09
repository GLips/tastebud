/** Recall with no prompt: everything agents can be told where the inspector stands, by kind, and the no's they hear. */
import { Box, Stack, Text, Tooltip } from "@mantine/core";

import { capitalize, describeKindDelivery } from "#review/shared/ui/kind-identity.tsx";
import { ListSectionHeader } from "#review/shared/ui/list-section-header.tsx";
import { RecallPolicyChip } from "#review/shared/ui/policy-chip.tsx";

import type { RecallAppliesHere } from "./recall-applies.ts";
import { RecallItemRow } from "./recall-item-row.tsx";
import { rejectionOutcome } from "./recall-reasons.ts";

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
          <ListSectionHeader
            title={capitalize(kind.plural)}
            count={accepted.length}
            trailing={
              <RecallPolicyChip
                policy={kind.recall}
                about={`${describeKindDelivery(kind)}${kind.recall === "inject" ? ` At most ${hookLimit} go with one prompt.` : ""}`}
              />
            }
            frame={{ kind: "heading" }}
          />
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
              <ListSectionHeader title="Rejected here" count={applies.rejected.length} frame={{ kind: "heading" }} />
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
