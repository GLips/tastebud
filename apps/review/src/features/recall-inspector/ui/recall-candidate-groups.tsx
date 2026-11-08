/**
 * The recall inspector's answer for one prompt, in plain sections: what the prompt hook sends, what
 * an agent can look up, what matched but isn't sent and why, and what applies here but didn't match
 * the words at all.
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

/** A section of the answer; an empty one folds to a single line so the full ones lead. */
function AnswerSection({
  title,
  count,
  hint,
  empty,
  children,
}: {
  title: string;
  count: number;
  hint: string;
  /** What an empty section says, after its title. */
  empty: string;
  children: ReactNode;
}) {
  if (count === 0)
    return (
      <Text size="sm">
        <Text span size="sm" fw={600}>
          {title}:
        </Text>{" "}
        <Text span size="sm" c="dimmed">
          {empty}
        </Text>
      </Text>
    );
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
  const notSentCount = recall.rejected.length + recall.excluded.length;
  const lookUpCount = lookUp.length + recall.history.length;
  return (
    <Stack gap="lg">
      <Stack gap="3xs">
        <Text size="md" fw={500}>
          {hook.items.length === 0
            ? "Nothing would be sent with this prompt."
            : `${plural(hook.items.length, "item would be", "items would be")} sent with this prompt.`}
          {lookUpCount > 0 && ` ${lookUpCount} more an agent can look up.`}
          {notSentCount > 0 && ` ${plural(notSentCount, "close match is", "close matches are")} held back.`}
        </Text>
        {hook.items.length === 0 && (
          <Text size="sm" c="dimmed">
            {hookSilenceWording(hook, catalog)}
          </Text>
        )}
      </Stack>

      <AnswerSection
        title="Sent with the prompt"
        count={hook.items.length}
        hint={`The prompt hook adds these before the agent reads the prompt: accepted, of a kind that may be sent, at most ${limit}.`}
        empty="nothing for these words"
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
        <Disclosure label="Show exactly what the hook adds">
          <HookPayloadView hook={hook} />
        </Disclosure>
      </AnswerSection>

      <AnswerSection
        title="An agent can look this up"
        count={lookUpCount}
        hint="Not sent on its own, but an agent that asks Tastebud about these words gets it."
        empty="nothing else accepted here matches these words"
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

      <AnswerSection
        title="Held back, and why"
        count={notSentCount}
        hint="Close matches for these words that agents don't get as advice."
        empty="no close match was left out"
      >
        <Box>
          {recall.rejected.map((hit) => (
            <RecallItemRow key={hit.id} item={hit} reason={rejectedHitWording(hit)} />
          ))}
          {recall.excluded.map((hit) => (
            <RecallItemRow key={hit.id} item={hit} reason={exclusionReason(hit, catalog, recall.context, known)} />
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
