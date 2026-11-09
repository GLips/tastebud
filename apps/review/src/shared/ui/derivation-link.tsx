import { Group, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import type { DerivationSummary } from "@tastebud/core/record-views";
import { CornerDownRight, RotateCcw, TriangleAlert } from "lucide-react";

import { formatReviewDate } from "#review/shared/format.ts";

import { KindGlyph } from "./kind-identity.tsx";
import { AnchorLink } from "./router-links.tsx";
import { DerivationStatusLabel } from "./status-chips.tsx";
import { SupportingText } from "./supporting-text.tsx";

const styles = stylex.create({
  aside: { display: "flex", gap: "8px", alignItems: "flex-start" },
  icon: { flexShrink: 0, marginTop: "3px" },
  agentCase: { whiteSpace: "pre-wrap" },
});

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
      <DerivationStatusLabel status={summary.status} />
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

/** The accepted derivation a proposal would replace, in one line. */
export function SupersedesNotice({ replaces }: { replaces: DerivationSummary }) {
  return (
    <div {...stylex.props(styles.aside)}>
      <Tooltip label={`Accepting this replaces the accepted ${replaces.kindLabel}`} withArrow>
        <RotateCcw size={14} color="var(--mantine-color-tastebud-7)" {...stylex.props(styles.icon)} />
      </Tooltip>
      <Text size="sm" c="dimmed">
        Replaces{" "}
        <AnchorLink to="/derivations/$id" params={{ id: replaces.id }} size="sm" c="dark.4">
          {replaces.statement}
        </AnchorLink>
      </Text>
    </div>
  );
}

/** How a notice introduces the earlier record a proposal went ahead despite. */
function despiteLeadIn(earlier: Pick<DerivationSummary, "status" | "kindLabel">): string {
  if (earlier.status === "rejected") return "You rejected";
  if (earlier.status === "pending") return "Also pending:";
  return `Close to a ${earlier.status} ${earlier.kindLabel}:`;
}

/**
 * A re-proposal of things the owner turned down: each earlier no with its reason, then the agent's
 * case for asking again.
 */
export function DespiteNotice({
  despite,
  agentCase,
}: {
  despite: ReadonlyArray<DerivationSummary>;
  agentCase: string | undefined;
}) {
  return (
    <div {...stylex.props(styles.aside)}>
      <Tooltip label="Proposed again after you turned down something close to it" withArrow multiline w={240}>
        <TriangleAlert size={14} color="var(--mantine-color-orange-6)" {...stylex.props(styles.icon)} />
      </Tooltip>
      <Stack gap="3xs">
        {despite.map((earlier) => (
          <Text size="sm" key={earlier.id}>
            <Text span c="orange.8" fw={500}>
              {despiteLeadIn(earlier)}
            </Text>{" "}
            <AnchorLink to="/derivations/$id" params={{ id: earlier.id }} size="sm" c="inherit">
              “{earlier.statement}”
            </AnchorLink>
            {earlier.decidedAt !== undefined && (
              <SupportingText tier="faint" span>
                {" "}
                {formatReviewDate(earlier.decidedAt)}
              </SupportingText>
            )}
            {earlier.reason !== undefined && (
              <Text span c="dimmed">
                {" "}
                — {earlier.reason}
              </Text>
            )}
          </Text>
        ))}
        {agentCase !== undefined && (
          <Group gap="xxs" wrap="nowrap" align="flex-start">
            <CornerDownRight size={13} color="var(--mantine-color-gray-5)" {...stylex.props(styles.icon)} />
            <Text size="sm" c="dimmed" {...stylex.props(styles.agentCase)}>
              {agentCase}
            </Text>
          </Group>
        )}
      </Stack>
    </div>
  );
}
