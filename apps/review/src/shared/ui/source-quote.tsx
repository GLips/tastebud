import { Badge, Button, Popover, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { SourceView } from "@tastebud/core/record-views";
import type { SourceRecord } from "@tastebud/core/records";
import { TextQuote } from "lucide-react";

import { formatReviewTime } from "#review/shared/format.ts";

import { CautionChip } from "./caution-chip.tsx";
import { AnchorLink } from "./router-links.tsx";
import { SourceAddress } from "./source-address.tsx";

const styles = stylex.create({
  quote: { display: "flex", gap: "8px", alignItems: "baseline" },
  mark: {
    fontSize: "18px",
    lineHeight: 0,
    fontWeight: 700,
    color: "var(--mantine-color-tastebud-4)",
    flexShrink: 0,
    transform: "translateY(4px)",
  },
  against: { color: "var(--mantine-color-red-5)" },
  prompted: { color: "var(--mantine-color-gray-4)" },
  body: { minWidth: 0, flex: 1 },
  words: { whiteSpace: "pre-wrap" },
  meta: {
    display: "inline-flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: "4px",
    marginLeft: "6px",
    verticalAlign: "baseline",
  },
  context: { whiteSpace: "pre-wrap", maxWidth: "420px" },
});

function SurroundingContext({ source }: { source: SourceRecord }) {
  return (
    <Stack gap="xxs">
      {source.before !== undefined && (
        <Text size="xs" c="gray.7" {...stylex.props(styles.context)}>
          …{source.before}
        </Text>
      )}
      <Text size="xs" fw={600} {...stylex.props(styles.context)}>
        “{source.quote}”
      </Text>
      {source.after !== undefined && (
        <Text size="xs" c="gray.7" {...stylex.props(styles.context)}>
          {source.after}…
        </Text>
      )}
    </Stack>
  );
}

/**
 * How a quote relates to the derivation beside it. `prompted` is for kinds that are never recalled
 * (ideas): their quotes inspired them and say nothing about whether they are true.
 */
export type SourceQuoteRole = "supports" | "contradicts" | "prompted" | "plain";

/**
 * Someone's exact words with who said them and when. Every extra is a worded control, never a hover-only
 * icon: the attribution opens the source's page, and the surrounding conversation opens on click.
 */
export function SourceQuote({
  view,
  owner,
  role = "supports",
  showKind = false,
}: {
  view: SourceView;
  /** Who the owner is, so their own words are attributed to "You". */
  owner: string;
  role?: SourceQuoteRole;
  showKind?: boolean;
}) {
  const { source } = view;
  const hasContext = source.before !== undefined || source.after !== undefined;
  return (
    <div {...stylex.props(styles.quote)}>
      <span
        aria-hidden
        {...stylex.props(styles.mark, role === "contradicts" && styles.against, role === "prompted" && styles.prompted)}
      >
        “
      </span>
      <div {...stylex.props(styles.body)}>
        <Text span {...stylex.props(styles.words)}>
          {source.quote}
        </Text>
        <span {...stylex.props(styles.meta)}>
          {role === "contradicts" && <CautionChip caution="says-the-opposite" about="This quote says the opposite" />}
          {role === "prompted" && <Badge color="gray">Prompted this</Badge>}
          <AnchorLink
            to="/sources/$id"
            params={{ id: source.id }}
            size="sm"
            c="gray.7"
            underline="hover"
            title={`Open this ${view.kindLabel} and what cites it`}
          >
            — {source.said_by === owner ? "You" : source.said_by_label}, {formatReviewTime(source.said_at)}
            {showKind && ` · ${view.kindLabel}`}
          </AnchorLink>
          {source.revises !== undefined && (
            <AnchorLink to="/sources/$id" params={{ id: source.revises }} size="sm" c="gray.7" underline="hover">
              · revises earlier words
            </AnchorLink>
          )}
          {hasContext && (
            <Popover withArrow shadow="md" position="bottom-start">
              <Popover.Target>
                <Button variant="subtle" color="gray" size="compact-xs" leftSection={<TextQuote size={11} />}>
                  Context
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <SurroundingContext source={source} />
              </Popover.Dropdown>
            </Popover>
          )}
          {source.address !== undefined && <SourceAddress address={source.address} variant="action" />}
        </span>
      </div>
    </div>
  );
}
