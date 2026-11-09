import { Box } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationRow } from "@tastebud/core/record-browsing";
import { useState } from "react";

import { AcceptancePreview } from "#review/features/derivation-decisions/index.ts";

const styles = stylex.create({
  // Sits above the row's stretched link so its checkboxes and buttons take the clicks.
  panel: { position: "relative", zIndex: 1 },
});

/**
 * A library accept held back by something close that overlaps: the same panel the inbox and the page show,
 * in the row, so the person looks the overlap over and accepts anyway without leaving the list.
 */
export function LibraryAcceptOverlaps({
  row,
  acceptLabel,
  labels,
  pending,
  onConfirm,
  onBack,
}: {
  row: DerivationRow;
  acceptLabel: string;
  labels: ReadonlyMap<string, string>;
  pending: boolean;
  onConfirm: (acknowledges: ReadonlyArray<string>) => void;
  onBack: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  return (
    <Box mt="xs" {...stylex.props(styles.panel)}>
      <AcceptancePreview
        target={row.id}
        statement={row.statement}
        override={undefined}
        proposedScope={row.proposedScope}
        changes={[]}
        verb={acceptLabel}
        active
        acknowledged={acknowledged}
        onAcknowledge={(id, checked) => {
          const next = new Set(acknowledged);
          if (checked) next.add(id);
          else next.delete(id);
          setAcknowledged(next);
        }}
        conflict={false}
        pending={pending}
        labels={labels}
        onConfirm={onConfirm}
        onBack={onBack}
      />
    </Box>
  );
}
