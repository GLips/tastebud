/**
 * The recall inspector's answer for one prompt: counts as chips, then one table of every item the words
 * reached (sent first, then on request, held back, history) and what applies here unmatched, each row
 * with its outcome and a short why.
 */
import { Badge, Box, Code, Collapse, Group, SegmentedControl, Stack, Tooltip, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import type { HookPayload } from "@tastebud/core/recall";
import type { DerivationSummary, RecallResult } from "@tastebud/core/record-views";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";

import { useKnownPlaces } from "#review/features/review-shell/index.ts";
import { SourceQuote } from "#review/shared/ui/source-quote.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import { RecallItemRow } from "./recall-item-row.tsx";
import {
  exclusionOutcome,
  historyOutcome,
  hookSilenceWording,
  onRequestOutcome,
  rejectionOutcome,
  sentOutcome,
  UNMATCHED_OUTCOME,
} from "./recall-reasons.ts";

const styles = stylex.create({
  payload: { whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.55 },
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(90deg)" },
});

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="2xs">
      <UnstyledButton onClick={() => setOpen(!open)} aria-expanded={open} w="fit-content">
        <Group gap="2xs">
          <ChevronRight
            size={12}
            color="var(--mantine-color-gray-6)"
            {...stylex.props(styles.chevron, open && styles.chevronOpen)}
          />
          <SupportingText tier="secondary">{label}</SupportingText>
        </Group>
      </UnstyledButton>
      <Collapse expanded={open}>{children}</Collapse>
    </Stack>
  );
}

/** The exact text the hook adds, or what it prints on stdout, for the curious. */
function HookPayloadView({ hook }: { hook: HookPayload }) {
  const [view, setView] = useState<"context" | "stdout">("context");
  return (
    <Stack gap="2xs">
      <SegmentedControl
        w="fit-content"
        value={view}
        onChange={(value) => setView(value === "stdout" ? "stdout" : "context")}
        data={[
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

function CountChip({ count, label, color, about }: { count: number; label: string; color: string; about: string }) {
  return (
    <Tooltip label={about} withArrow multiline maw={320} openDelay={150}>
      <Badge color={count === 0 ? "gray" : color} variant={count === 0 ? "outline" : "light"} tt="none" fw={500}>
        {count} {label}
      </Badge>
    </Tooltip>
  );
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function RecallCandidateGroups({
  recall,
  hook,
  catalog,
  appliesUnmatched,
}: {
  recall: RecallResult;
  hook: HookPayload;
  catalog: CatalogView | undefined;
  /** Accepted items that apply here but these words never brought up. */
  appliesUnmatched: ReadonlyArray<DerivationSummary>;
}) {
  const known = useKnownPlaces();
  const injected = new Set(hook.items.map((item) => item.id));
  const limit = catalog?.hook.limit ?? 3;
  const lookUp = recall.accepted.filter((hit) => !injected.has(hit.id));
  const heldBackCount = recall.rejected.length + recall.excluded.length;
  const silence = hookSilenceWording(hook, catalog);
  return (
    <Stack gap="md">
      <Group gap="xs">
        <CountChip
          count={hook.items.length}
          label="sent"
          color="tastebud"
          about={
            hook.items.length === 0 && silence !== undefined && silence !== ""
              ? silence
              : `Read by the agent with this prompt: accepted, of a kind that may be sent, at most ${limit}`
          }
        />
        <CountChip
          count={lookUp.length}
          label="on request"
          color="cyan"
          about="Not sent on its own, but an agent that asks Tastebud about these words gets it"
        />
        <CountChip
          count={heldBackCount}
          label="held back"
          color="orange"
          about="Matched these words, but agents don't get them as advice here"
        />
        <CountChip
          count={appliesUnmatched.length}
          label="apply, not matched"
          color="gray"
          about="Accepted and applies where the agent stands, but these words didn't bring it up"
        />
      </Group>

      <Box>
        <RecallItemRow.Head />
        {hook.items.map((item) => (
          <RecallItemRow key={item.id} item={item} outcome={sentOutcome(item.explanation.matchedPlace, known)} />
        ))}
        {lookUp.map((hit) => (
          <RecallItemRow key={hit.id} item={hit} outcome={onRequestOutcome(hit, catalog, limit, known)} />
        ))}
        {recall.rejected.map((hit) => (
          <RecallItemRow key={hit.id} item={hit} outcome={rejectionOutcome(hit)} />
        ))}
        {recall.excluded.map((hit) => (
          <RecallItemRow key={hit.id} item={hit} outcome={exclusionOutcome(hit, catalog, known)} />
        ))}
        {recall.history.map((hit) => (
          <RecallItemRow key={hit.id} item={hit} outcome={historyOutcome(hit)} />
        ))}
        {appliesUnmatched.map((item) => (
          <RecallItemRow key={item.id} item={item} outcome={UNMATCHED_OUTCOME} />
        ))}
      </Box>

      {hook.items.length > 0 && (
        <Disclosure label="Show exactly what’s sent">
          <HookPayloadView hook={hook} />
        </Disclosure>
      )}
      {recall.sources.length > 0 && (
        <Disclosure label={`${plural(recall.sources.length, "saved quote", "saved quotes")} also match these words`}>
          <Stack gap="xxs">
            {recall.sources.map((hit) => (
              <SourceQuote key={hit.source.id} view={hit} role="plain" showKind />
            ))}
          </Stack>
        </Disclosure>
      )}
    </Stack>
  );
}
