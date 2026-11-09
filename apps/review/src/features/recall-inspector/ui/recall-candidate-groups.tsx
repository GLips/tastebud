/**
 * The recall inspector's answer for one prompt: a headline that names every empty section, then what
 * matched but is held back and why, what is sent with the prompt, what an agent can look up, and what
 * applies here but didn't match the words at all.
 */
import { Box, Code, Collapse, Group, SegmentedControl, Stack, Text, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import type { HookPayload } from "@tastebud/core/recall";
import type { DerivationSummary, RecallResult } from "@tastebud/core/record-views";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";

import { useKnownPlaces } from "#review/features/review-shell/index.ts";
import { SourceQuote } from "#review/shared/ui/source-quote.tsx";

import { RecallItemRow } from "./recall-item-row.tsx";
import {
  availableThroughRecallReason,
  exclusionReason,
  hookSilenceWording,
  matchedPlaceWording,
  rejectedHitWording,
} from "./recall-reasons.ts";

const styles = stylex.create({
  payload: { whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.55 },
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(90deg)" },
});

/** A section of the answer; empty ones are left out, since the headline already says so. */
function AnswerSection({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count: number;
  hint: string;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <Stack gap="2xs">
      <Stack gap="3xs">
        <Group gap="xxs">
          <Text size="sm" fw={600}>
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {count}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      </Stack>
      {children}
    </Stack>
  );
}

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
          <Text size="xs" c="dimmed">
            {label}
          </Text>
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
        size="xs"
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

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The answer in one sentence, naming the empty sections so they needn't be shown. */
function recallHeadline(sent: number, lookUp: number, heldBack: number): string {
  const sentPart = sent === 0 ? "Nothing would be sent" : `${plural(sent, "item would be", "items would be")} sent`;
  const lookUpPart = lookUp === 0 ? "nothing to look up" : `${lookUp} more an agent can look up`;
  const heldPart =
    heldBack === 0
      ? " Nothing close was held back."
      : ` ${plural(heldBack, "close match is", "close matches are")} held back:`;
  return `${sentPart} with this prompt, and ${lookUpPart}.${heldPart}`;
}

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
  const lookUpCount = lookUp.length + recall.history.length;
  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Stack gap="3xs">
          <Text size="md" fw={500}>
            {recallHeadline(hook.items.length, lookUpCount, heldBackCount)}
          </Text>
          {hook.items.length === 0 && (
            <Text size="sm" c="dimmed">
              {hookSilenceWording(hook, catalog)}
            </Text>
          )}
        </Stack>
        {heldBackCount > 0 && (
          <Box>
            {recall.rejected.map((hit) => (
              <RecallItemRow key={hit.id} item={hit} reason={rejectedHitWording(hit)} />
            ))}
            {recall.excluded.map((hit) => (
              <RecallItemRow key={hit.id} item={hit} reason={exclusionReason(hit, catalog, recall.context, known)} />
            ))}
          </Box>
        )}
      </Stack>

      <AnswerSection
        title="Sent with the prompt"
        count={hook.items.length}
        hint={`The agent reads these along with the prompt: accepted, of a kind that may be sent, at most ${limit}.`}
      >
        <Box>
          {hook.items.map((item) => (
            <RecallItemRow
              key={item.id}
              item={item}
              reason={`Sent: ${matchedPlaceWording(item.explanation.matchedPlace, known)}`}
              reasonColor="tastebud.8"
            />
          ))}
        </Box>
        <Disclosure label="Show exactly what’s sent">
          <HookPayloadView hook={hook} />
        </Disclosure>
      </AnswerSection>

      <AnswerSection
        title="An agent can look this up"
        count={lookUpCount}
        hint="Not sent on its own, but an agent that asks Tastebud about these words gets it."
      >
        <Box>
          {lookUp.map((hit) => (
            <RecallItemRow
              key={hit.id}
              item={hit}
              reason={`${availableThroughRecallReason(hit, catalog, limit)}; ${matchedPlaceWording(hit.explanation.matchedPlace, known)}`}
            />
          ))}
          {recall.history.map((hit) => (
            <RecallItemRow
              key={hit.id}
              item={hit}
              reason={`${hit.status === "superseded" ? "Replaced by a newer revision" : "Retracted"}; shown because you included them`}
            />
          ))}
        </Box>
      </AnswerSection>

      {recall.sources.length > 0 && (
        <Disclosure label={`${plural(recall.sources.length, "saved quote", "saved quotes")} also match these words`}>
          <Stack gap="xxs">
            {recall.sources.map((hit) => (
              <SourceQuote key={hit.source.id} view={hit} role="plain" showKind />
            ))}
          </Stack>
        </Disclosure>
      )}

      {appliesUnmatched.length > 0 && (
        <Disclosure
          label={`${plural(appliesUnmatched.length, "more accepted item applies", "more accepted items apply")} here but didn't match these words`}
        >
          <Box>
            {appliesUnmatched.map((item) => (
              <RecallItemRow key={item.id} item={item} />
            ))}
          </Box>
        </Disclosure>
      )}
    </Stack>
  );
}
