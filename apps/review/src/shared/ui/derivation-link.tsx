import { Group, Text } from "@mantine/core";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import type { DerivationSummary } from "@tastebud/core/record-views";

import { formatReviewDate } from "#review/shared/format.ts";

import { KindGlyph } from "./kind-identity.tsx";
import { AnchorLink } from "./router-links.tsx";
import { DerivationStatusBadge } from "./status-chips.tsx";
import { SupportingText } from "./supporting-text.tsx";

/** Another derivation in one line: status in words, kind, its exact wording (linked), and the decision's reason. */
export function DerivationSummaryLine({
  summary,
  catalog,
  note,
}: {
  summary: DerivationSummary;
  /** Picks the kind's glyph; passed in so shared/ui never reads a feature's query. */
  catalog: CatalogView | undefined;
  note?: string;
}) {
  const decided =
    summary.decidedAt !== undefined ? `${summary.status} ${formatReviewDate(summary.decidedAt)}` : undefined;
  return (
    <Group gap="xs" wrap="nowrap" align="baseline">
      <DerivationStatusBadge status={summary.status} />
      <KindGlyph catalog={catalog} kind={summary.kind} label={summary.kindLabel} size={10} />
      <Text size="sm" lineClamp={2}>
        <AnchorLink to="/derivations/$id" params={{ id: summary.id }} size="sm" c="inherit" underline="hover">
          {summary.statement}
        </AnchorLink>
        {summary.reason !== undefined && (
          <SupportingText tier="secondary" span title={decided}>
            {" "}
            — “{summary.reason}”
          </SupportingText>
        )}
        {note !== undefined && (
          <SupportingText tier="secondary" span>
            {" "}
            · {note}
          </SupportingText>
        )}
      </Text>
    </Group>
  );
}
