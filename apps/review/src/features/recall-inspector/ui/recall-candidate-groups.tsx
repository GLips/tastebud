/**
 * The recall inspector's left column: what the hook would inject, what recall returns on request,
 * and the close matches left out, each item with the concrete reason it landed where it did.
 */
import { Box, Collapse, Group, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import type { HookPayload } from "@tastebud/core/recall";
import type { DerivationSummary, RecallResult } from "@tastebud/core/record-views";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SourceQuote } from "#review/shared/ui/source-quote.tsx";
import { DerivationStatusDot } from "#review/shared/ui/status-chips.tsx";

import {
  availableThroughRecallReason,
  exclusionReason,
  hookSilenceWording,
  matchedPlaceWording,
} from "./recall-reasons.ts";

const styles = stylex.create({
  row: {
    display: "grid",
    gridTemplateColumns: "10px 12px minmax(0, 1fr)",
    columnGap: "8px",
    alignItems: "baseline",
    paddingBlock: "6px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: { default: "var(--mantine-color-gray-1)", ":first-child": "transparent" },
  },
  rowBody: { minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" },
  details: {
    display: "grid",
    gridTemplateColumns: "96px minmax(0, 1fr)",
    columnGap: "10px",
    rowGap: "2px",
    paddingTop: "4px",
  },
  toggle: { display: "inline-flex", alignItems: "center", gap: "2px" },
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(90deg)" },
});

function GroupHeading({ title, count, hint }: { title: string; count: number; hint: string }) {
  return (
    <Tooltip label={hint} withArrow multiline w={280} position="top-start">
      <Group gap="xxs">
        <Text size="sm" fw={600}>
          {title}
        </Text>
        <Text size="xs" c="dimmed">
          {count}
        </Text>
      </Group>
    </Tooltip>
  );
}

/** One candidate: what it says, the concrete reason it landed here, and its numbers behind a toggle. */
function CandidateRow({
  item,
  reason,
  reasonColor = "dimmed",
  details,
  children,
}: {
  item: DerivationSummary;
  reason: string;
  reasonColor?: string;
  details: ReadonlyArray<readonly [string, ReactNode]>;
  children?: ReactNode;
}) {
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const [open, setOpen] = useState(false);
  return (
    <Box {...stylex.props(styles.row)}>
      <DerivationStatusDot status={item.status} />
      <KindGlyph catalog={catalog} kind={item.kind} label={item.kindLabel} size={10} />
      <Box {...stylex.props(styles.rowBody)}>
        <AnchorLink to="/derivations/$id" params={{ id: item.id }} c="inherit" fw={500} size="sm" underline="hover">
          {item.statement}
        </AnchorLink>
        <Group gap="xs">
          <Text size="xs" c={reasonColor}>
            {reason}
          </Text>
          <ScopeChips scope={item.effectiveScope} labels={known.labels} />
          <UnstyledButton onClick={() => setOpen(!open)} aria-expanded={open} {...stylex.props(styles.toggle)}>
            <Text size="xs" c="dimmed">
              Details
            </Text>
            <ChevronRight
              size={12}
              color="var(--mantine-color-gray-5)"
              {...stylex.props(styles.chevron, open && styles.chevronOpen)}
            />
          </UnstyledButton>
        </Group>
        <Collapse expanded={open}>
          <Box fz="xs" {...stylex.props(styles.details)}>
            {details.map(([label, value]) => [
              <Text key={`${label}-l`} size="xs" c="dimmed">
                {label}
              </Text>,
              <Text key={`${label}-v`} size="xs">
                {value}
              </Text>,
            ])}
          </Box>
        </Collapse>
        {children}
      </Box>
    </Box>
  );
}

export function RecallCandidateGroups({
  recall,
  hook,
  catalog,
}: {
  recall: RecallResult;
  hook: HookPayload;
  catalog: CatalogView | undefined;
}) {
  const known = useKnownPlaces();
  const injected = new Set(hook.items.map((item) => item.id));
  const limit = catalog?.hook.limit ?? 3;
  const available = [...recall.accepted, ...recall.rejected].filter((hit) => !injected.has(hit.id));
  return (
    <Stack gap="lg">
      <Stack gap="2xs">
        <GroupHeading
          title="Would inject"
          count={hook.items.length}
          hint="What the prompt hook adds before the agent reads this prompt: inject kinds only, accepted then rejected, at most the hook's limit."
        />
        {hook.items.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nothing. {hookSilenceWording(hook, catalog)}
          </Text>
        ) : (
          <Box>
            {hook.items.map((item) => (
              <CandidateRow
                key={item.id}
                item={item}
                reason={
                  item.status === "rejected"
                    ? `Rejected, offered as not accepted · ${matchedPlaceWording(item.explanation.matchedPlace, known)}`
                    : matchedPlaceWording(item.explanation.matchedPlace, known)
                }
                reasonColor="tastebud.8"
                details={[
                  ["Policy", item.explanation.policy],
                  ["Status", item.explanation.status],
                  ["Matched place", item.explanation.matchedPlace],
                  ["Text score", item.explanation.score.toFixed(2)],
                ]}
              />
            ))}
          </Box>
        )}
      </Stack>

      <Stack gap="2xs">
        <GroupHeading
          title="Available through recall"
          count={available.length + recall.history.length + recall.sources.length}
          hint="What an agent gets when it asks (tastebud recall) but the hook doesn't send on its own."
        />
        {available.length + recall.history.length + recall.sources.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nothing else matches these words here.
          </Text>
        ) : (
          <Box>
            {available.map((hit) => {
              const reason = availableThroughRecallReason(hit, catalog, limit);
              return (
                <CandidateRow
                  key={hit.id}
                  item={hit}
                  reason={`${reason} · ${matchedPlaceWording(hit.explanation.matchedPlace, known)}`}
                  details={[
                    ["Policy", hit.explanation.policy],
                    ["Status", hit.explanation.status],
                    ["Matched place", hit.explanation.matchedPlace],
                    ["Text score", hit.explanation.score.toFixed(2)],
                  ]}
                />
              );
            })}
            {recall.history.map((hit) => (
              <CandidateRow
                key={hit.id}
                item={hit}
                reason={`History: ${hit.status}`}
                details={[
                  ["Status", hit.explanation.status],
                  ["Matched place", hit.explanation.matchedPlace],
                  ["Text score", hit.explanation.score.toFixed(2)],
                ]}
              />
            ))}
          </Box>
        )}
        {recall.sources.length > 0 && (
          <Stack gap="xxs" mt="xxs">
            <Tooltip label="Raw quotes matching the words. Sources never carry scope, so this is store-wide." withArrow>
              <Text size="xs" c="dimmed" w="fit-content">
                Matching sources, store-wide
              </Text>
            </Tooltip>
            {recall.sources.map((hit) => (
              <SourceQuote key={hit.source.id} view={hit} role="plain" showKind />
            ))}
          </Stack>
        )}
      </Stack>

      <Stack gap="2xs">
        <GroupHeading
          title="Excluded candidates"
          count={recall.excluded.length}
          hint="Close text matches that recall left out, each with the reason."
        />
        {recall.excluded.length === 0 ? (
          <Text size="sm" c="dimmed">
            No close matches were left out.
          </Text>
        ) : (
          <Box>
            {recall.excluded.map((hit) => (
              <CandidateRow
                key={hit.id}
                item={hit}
                reason={exclusionReason(hit, catalog, recall.context, known)}
                reasonColor="orange.8"
                details={[
                  ["Status", hit.status],
                  ["Excluded as", hit.exclusion],
                  ["Text score", hit.score.toFixed(2)],
                ]}
              />
            ))}
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
