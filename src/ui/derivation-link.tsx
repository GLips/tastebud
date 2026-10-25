import { Group, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { CornerDownRight, RotateCcw, TriangleAlert } from "lucide-react";

import type { DerivationSummary } from "../core/index.ts";
import { formatReviewDate } from "./format.ts";
import { KindGlyph } from "./kind-identity.tsx";
import { AnchorLink } from "./router-links.tsx";
import { DerivationStatusDot } from "./status-chips.tsx";
import { useReviewCatalog } from "./use-review-context.ts";

const styles = stylex.create({
  aside: { display: "flex", gap: "8px", alignItems: "flex-start" },
  icon: { flexShrink: 0, marginTop: "3px" },
  agentCase: { whiteSpace: "pre-wrap" },
});

/** Another derivation in one line: status, kind, its exact wording (linked), and the decision's reason. */
export function DerivationSummaryLine({ summary, note }: { summary: DerivationSummary; note?: string }) {
  const catalog = useReviewCatalog();
  const decided =
    summary.decidedAt !== undefined ? `${summary.status} ${formatReviewDate(summary.decidedAt)}` : undefined;
  return (
    <Group gap={8} wrap="nowrap" align="baseline">
      <DerivationStatusDot status={summary.status} />
      <KindGlyph catalog={catalog} kind={summary.kind} label={summary.kindLabel} size={10} />
      <Text size="sm" lineClamp={2}>
        <AnchorLink to="/derivations/$id" params={{ id: summary.id }} size="sm" c="inherit" underline="hover">
          {summary.statement}
        </AnchorLink>
        {summary.reason !== undefined && (
          <Text span size="xs" c="dimmed" title={decided}>
            {" "}
            — “{summary.reason}”
          </Text>
        )}
        {note !== undefined && (
          <Text span size="xs" c="dimmed">
            {" "}
            · {note}
          </Text>
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
        <RotateCcw size={14} color="var(--mantine-color-taste-7)" {...stylex.props(styles.icon)} />
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
      <Stack gap={2}>
        {despite.map((earlier) => (
          <Text size="sm" key={earlier.id}>
            <Text span c="orange.8" fw={500}>
              {earlier.status === "rejected"
                ? "You rejected"
                : earlier.status === "pending"
                  ? "Also pending:"
                  : `Close to a ${earlier.status} ${earlier.kindLabel}:`}
            </Text>{" "}
            <AnchorLink to="/derivations/$id" params={{ id: earlier.id }} size="sm" c="inherit">
              “{earlier.statement}”
            </AnchorLink>
            {earlier.decidedAt !== undefined && (
              <Text span size="xs" c="dimmed">
                {" "}
                {formatReviewDate(earlier.decidedAt)}
              </Text>
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
          <Group gap={6} wrap="nowrap" align="flex-start">
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
