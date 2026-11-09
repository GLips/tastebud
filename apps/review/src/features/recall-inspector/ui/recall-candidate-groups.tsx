/**
 * The recall inspector's answer for one prompt: a verdict line with its counts, then one table of every item the
 * words reached (sent first, then on request, rejected, not sent, history) with its status, outcome and why. What
 * applies here but didn't match folds away below.
 */
import { Box, Code, Group, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import type { HookPayload } from "@tastebud/core/recall";
import type { DerivationSummary, RecallResult } from "@tastebud/core/record-views";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { useKnownPlaces } from "#review/features/review-shell/index.ts";
import { CountedTabs } from "#review/shared/ui/counted-tabs.tsx";
import { InlineDisclosure } from "#review/shared/ui/inline-disclosure.tsx";
import type { RecallOutcomeTone } from "#review/shared/ui/outcome-chip.tsx";
import { SourceQuote } from "#review/shared/ui/source-quote.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import { RecallItemRow } from "./recall-item-row.tsx";
import {
  exclusionOutcome,
  HISTORY_OUTCOME,
  hookSilenceWording,
  onRequestOutcome,
  type RecallOutcome,
  rejectionOutcome,
  sentOutcome,
  UNMATCHED_OUTCOME,
} from "./recall-reasons.ts";

const styles = stylex.create({
  payload: { whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.55 },
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(90deg)" },
  groupRow: {
    display: "block",
    width: "100%",
    paddingBlock: "8px",
    paddingInline: "6px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "var(--mantine-color-gray-2)",
  },
});

/** The exact text the hook adds, or what it prints on stdout, for the curious. */
function HookPayloadView({ hook }: { hook: HookPayload }) {
  const [view, setView] = useState<"context" | "stdout">("context");
  return (
    <Stack gap="2xs">
      <CountedTabs<"context" | "stdout">
        label="Payload view"
        value={view}
        onChange={setView}
        options={[
          { value: "context", label: "What the agent reads" },
          { value: "stdout", label: "Hook output" },
        ]}
      />
      <Code block fz="xs" {...stylex.props(styles.payload)}>
        {view === "context" ? hook.additionalContext : hook.hookOutput}
      </Code>
    </Stack>
  );
}

/** The table's last group, folded by default: what applies where the agent stands but these words missed. */
function UnmatchedGroup({ items }: { items: ReadonlyArray<DerivationSummary> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <UnstyledButton onClick={() => setOpen(!open)} aria-expanded={open} {...stylex.props(styles.groupRow)}>
        <Group gap="2xs">
          <ChevronRight
            size={12}
            color="var(--mantine-color-gray-6)"
            {...stylex.props(styles.chevron, open && styles.chevronOpen)}
          />
          <SupportingText tier="secondary">Apply here, didn't match · {items.length}</SupportingText>
        </Group>
      </UnstyledButton>
      {open && items.map((item) => <RecallItemRow key={item.id} item={item} outcome={UNMATCHED_OUTCOME} />)}
    </>
  );
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

type RecallAnswerRow = { readonly item: DerivationSummary; readonly outcome: RecallOutcome };

// The verdict line's counts, in the Outcome column's own words; a tone with no rows is left out.
const VERDICT_COUNTS: ReadonlyArray<{ tone: RecallOutcomeTone; word: string }> = [
  { tone: "sent", word: "sent" },
  { tone: "on-request", word: "on request" },
  { tone: "told-no", word: "told no on lookup" },
  { tone: "held-back", word: "held back" },
  { tone: "not-sent", word: "not sent" },
];

/**
 * The answer in one line: what the prompt hook sends, which is only ever accepted items, then every row's
 * outcome counted in the Outcome column's own words, so a no heard on lookup never reads as "nothing".
 */
function RecallVerdict({
  rows,
  query,
  where,
  silence,
}: {
  rows: ReadonlyArray<RecallAnswerRow>;
  query: string;
  where: string | undefined;
  silence: string | undefined;
}) {
  const sent = rows.filter((row) => row.outcome.tone === "sent").length;
  const counts = VERDICT_COUNTS.map(({ tone, word }) => ({
    word,
    count: rows.filter((row) => row.outcome.tone === tone).length,
  })).filter(({ count }) => count > 0);
  const verdict =
    sent > 0
      ? `${plural(sent, "item is", "items are")} sent with this prompt${where === undefined ? "" : ` in ${where}`}`
      : `Nothing about “${query}” is sent with the prompt${where === undefined ? "" : ` in ${where}`}`;
  return (
    <Group gap="sm" align="baseline">
      <Tooltip
        label={silence}
        disabled={sent > 0 || silence === undefined || silence === ""}
        withArrow
        multiline
        maw={360}
      >
        <Text fw={600}>{verdict}</Text>
      </Tooltip>
      <SupportingText tier="faint">{counts.map(({ count, word }) => `${count} ${word}`).join(" · ")}</SupportingText>
    </Group>
  );
}

export function RecallCandidateGroups({
  recall,
  hook,
  catalog,
  appliesUnmatched,
  query,
  where,
}: {
  recall: RecallResult;
  hook: HookPayload;
  catalog: CatalogView | undefined;
  /** Accepted items that apply here but these words never brought up. */
  appliesUnmatched: ReadonlyArray<DerivationSummary>;
  query: string;
  /** Where the inspector stands, in words; undefined when nowhere in particular. */
  where: string | undefined;
}) {
  const known = useKnownPlaces();
  const injected = new Set(hook.items.map((item) => item.id));
  const limit = catalog?.hook.limit ?? 3;
  const rows: ReadonlyArray<RecallAnswerRow> = [
    ...hook.items.map((item) => ({ item, outcome: sentOutcome(item.explanation.matchedPlace, known) })),
    ...recall.accepted
      .filter((hit) => !injected.has(hit.id))
      .map((hit) => ({ item: hit, outcome: onRequestOutcome(hit, catalog, limit) })),
    ...recall.rejected.map((hit) => ({ item: hit, outcome: rejectionOutcome(hit) })),
    ...recall.excluded.map((hit) => ({ item: hit, outcome: exclusionOutcome(hit, catalog, known) })),
    ...recall.history.map((hit) => ({ item: hit, outcome: HISTORY_OUTCOME })),
  ];
  return (
    <Stack gap="md">
      <RecallVerdict rows={rows} query={query} where={where} silence={hookSilenceWording(hook, catalog)} />

      {(rows.length > 0 || appliesUnmatched.length > 0) && (
        <Box>
          <RecallItemRow.Head />
          {rows.map(({ item, outcome }) => (
            <RecallItemRow key={item.id} item={item} outcome={outcome} />
          ))}
          {appliesUnmatched.length > 0 && <UnmatchedGroup items={appliesUnmatched} />}
        </Box>
      )}
      {hook.items.length > 0 && (
        <InlineDisclosure label="Show exactly what’s sent">
          <HookPayloadView hook={hook} />
        </InlineDisclosure>
      )}
      {recall.sources.length > 0 && (
        <InlineDisclosure
          label={`${plural(recall.sources.length, "saved quote", "saved quotes")} also match these words`}
        >
          <Stack gap="xxs">
            {recall.sources.map((hit) => (
              <SourceQuote key={hit.source.id} view={hit} owner={catalog?.owner ?? ""} role="plain" showKind />
            ))}
          </Stack>
        </InlineDisclosure>
      )}
    </Stack>
  );
}
