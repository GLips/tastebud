import { ActionIcon, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { SourceView } from "@taste/core/record-views";
import type { SourceRecord } from "@taste/core/records";
import { ArrowUpRight, ExternalLink, GitCommitVertical, TextQuote } from "lucide-react";

import { formatReviewTime } from "#review/shared/format.ts";

import { ActionIconLink } from "./router-links.tsx";

const styles = stylex.create({
  quote: { display: "flex", gap: "8px", alignItems: "baseline" },
  mark: {
    fontSize: "18px",
    lineHeight: 0,
    fontWeight: 700,
    color: "var(--mantine-color-taste-4)",
    flexShrink: 0,
    transform: "translateY(4px)",
  },
  against: { color: "var(--mantine-color-red-5)" },
  prompted: { color: "var(--mantine-color-gray-4)" },
  body: { minWidth: 0, flex: 1 },
  words: { whiteSpace: "pre-wrap" },
  meta: { display: "inline-flex", alignItems: "center", gap: "2px", marginLeft: "6px", verticalAlign: "baseline" },
  context: { whiteSpace: "pre-wrap", maxWidth: "420px", fontSize: "12px" },
});

function SurroundingContext({ source }: { source: SourceRecord }) {
  return (
    <Stack gap="xxs">
      {source.before !== undefined && <Text {...stylex.props(styles.context)}>…{source.before}</Text>}
      <Text fw={600} {...stylex.props(styles.context)}>
        “{source.quote}”
      </Text>
      {source.after !== undefined && <Text {...stylex.props(styles.context)}>{source.after}…</Text>}
    </Stack>
  );
}

/**
 * How a quote relates to the derivation beside it. `prompted` is for kinds that are never recalled
 * (ideas): their quotes inspired them and say nothing about whether they are true.
 */
export type SourceQuoteRole = "supports" | "contradicts" | "prompted" | "plain";

const ROLE_TOOLTIPS: Record<SourceQuoteRole, string> = {
  supports: "Supports this",
  contradicts: "Says the opposite",
  prompted: "What prompted this",
  plain: "Their exact words",
};

/** Someone's exact words with who said them and when. Context and the permalink sit behind icons. */
export function SourceQuote({
  view,
  role = "supports",
  showKind = false,
}: {
  view: SourceView;
  role?: SourceQuoteRole;
  showKind?: boolean;
}) {
  const { source } = view;
  const hasContext = source.before !== undefined || source.after !== undefined;
  return (
    <div {...stylex.props(styles.quote)}>
      <Tooltip label={ROLE_TOOLTIPS[role]} withArrow openDelay={300}>
        <span
          aria-hidden
          {...stylex.props(
            styles.mark,
            role === "contradicts" && styles.against,
            role === "prompted" && styles.prompted,
          )}
        >
          “
        </span>
      </Tooltip>
      <div {...stylex.props(styles.body)}>
        <Text span {...stylex.props(styles.words)}>
          {source.quote}
        </Text>
        <span {...stylex.props(styles.meta)}>
          <Text span size="xs" c="dimmed" title={source.said_by}>
            — {source.said_by_label}, {formatReviewTime(source.said_at)}
            {showKind && ` · ${view.kindLabel}`}
          </Text>
          {source.revises !== undefined && (
            <Tooltip label="Revises something they said earlier" withArrow>
              <GitCommitVertical
                size={12}
                color="var(--mantine-color-gray-6)"
                style={{ marginLeft: "var(--mantine-spacing-2xs)" }}
              />
            </Tooltip>
          )}
          {hasContext && (
            <Tooltip label={<SurroundingContext source={source} />} withArrow multiline color="dark">
              <ActionIcon variant="subtle" color="gray" size="xs" aria-label="Show surrounding conversation">
                <TextQuote size={12} />
              </ActionIcon>
            </Tooltip>
          )}
          {source.address !== undefined && (
            <Tooltip label="Open where it was said" withArrow>
              <ActionIcon
                component="a"
                href={source.address}
                target="_blank"
                rel="noreferrer"
                variant="subtle"
                color="gray"
                size="xs"
                aria-label="Open where it was said"
              >
                <ExternalLink size={12} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label={`This ${view.kindLabel} and what cites it`} withArrow openDelay={300}>
            <ActionIconLink
              to="/sources/$id"
              params={{ id: source.id }}
              variant="subtle"
              color="gray"
              size="xs"
              aria-label={`Open this ${view.kindLabel}`}
            >
              <ArrowUpRight size={12} />
            </ActionIconLink>
          </Tooltip>
        </span>
      </div>
    </div>
  );
}
