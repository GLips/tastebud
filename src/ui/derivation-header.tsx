/** The top of the derivation page: what it says and who proposed it, where it applies, and its evidence. */
import { CopyButton, Group, Paper, Stack, Text, Title, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import type { DerivationView } from "../core/index.ts";
import type { CatalogView, DerivedKindView } from "../shared/catalog-view.ts";
import { shortIdOf } from "../shared/vocabulary.ts";
import { DerivationSummaryLine, DespiteNotice, SupersedesNotice } from "./derivation-link.tsx";
import { FactRow } from "./fact-row.tsx";
import { formatReviewTime, formatTimeAgo } from "./format.ts";
import { capitalize, KindGlyph } from "./kind-identity.tsx";
import { ScopeChips } from "./place-chips.tsx";
import { AnchorLink } from "./router-links.tsx";
import { isSameScope } from "./scope-draft.ts";
import { SourceQuote } from "./source-quote.tsx";
import type { KnownPlaces } from "./use-review-context.ts";

const styles = stylex.create({
  statement: { fontSize: "22px", lineHeight: 1.3, letterSpacing: "-0.015em", fontWeight: 650, textWrap: "balance" },
  prose: { whiteSpace: "pre-wrap" },
  id: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: "11px", cursor: "copy" },
  facts: {
    display: "grid",
    gridTemplateColumns: "88px minmax(0, 1fr)",
    columnGap: "12px",
    rowGap: "6px",
    alignItems: "center",
  },
});

export function DerivationHeader({
  view,
  kind,
  catalog,
  owner,
  actions,
}: {
  view: DerivationView;
  kind: DerivedKindView | undefined;
  catalog: CatalogView | undefined;
  owner: string;
  actions: ReactNode;
}) {
  const record = view.derivation;
  return (
    <>
      <Group justify="space-between">
        <AnchorLink to="/kinds/$kind" params={{ kind: view.kind }} size="sm" c="dimmed" underline="hover">
          <Group gap={4}>
            <ArrowLeft size={14} />
            {capitalize(kind?.plural ?? view.kind)}
          </Group>
        </AnchorLink>
        <CopyButton value={view.id}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? "Copied" : "Copy the id for the CLI"} withArrow>
              <Text c="dimmed" onClick={copy} {...stylex.props(styles.id)}>
                {shortIdOf(view.id)}
              </Text>
            </Tooltip>
          )}
        </CopyButton>
      </Group>

      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="lg">
        <Stack gap={6} style={{ minWidth: 0 }}>
          <Group gap={6}>
            <KindGlyph catalog={catalog} kind={view.kind} />
            <Text size="sm" fw={500} c="dark.4">
              {capitalize(view.kindLabel)}
              {view.retired && " (retired kind)"}
            </Text>
            <Text size="sm" c="dimmed">
              ·
            </Text>
            <Text size="sm" c="dimmed" tt="capitalize">
              {view.status}
            </Text>
            {view.subject !== undefined && view.subject !== "owner" && view.subject !== owner && (
              <Text size="sm" c="dimmed">
                · about {view.subject}
              </Text>
            )}
          </Group>
          <Title order={2} {...stylex.props(styles.statement)}>
            {view.statement}
          </Title>
          <Text size="xs" c="dimmed">
            <span title={formatReviewTime(record.proposed_at)}>
              {record.proposed_by} · {formatTimeAgo(record.proposed_at)}
            </span>
            {record.reasoning.trim() !== "" && (
              <span {...stylex.props(styles.prose)}> — {record.reasoning.trim()}</span>
            )}
          </Text>
        </Stack>
        {actions}
      </Group>
    </>
  );
}

export function DerivationScopeFacts({ view, known }: { view: DerivationView; known: KnownPlaces }) {
  const amended = !isSameScope(view.proposedScope, view.effectiveScope);
  return (
    <Paper px="md" py="sm">
      <div {...stylex.props(styles.facts)}>
        <FactRow label={view.status === "pending" ? "Proposed for" : "Applies in"}>
          <Group gap={8}>
            <ScopeChips scope={view.effectiveScope} labels={known.labels} wrap="wrap" />
            {view.status === "pending" && view.scopeSource === "defaulted" && (
              <Text size="xs" c="dimmed" fs="italic">
                Suggested from proposal context
              </Text>
            )}
          </Group>
        </FactRow>
        {amended && (
          <FactRow label="Proposed">
            <Group gap={8}>
              <ScopeChips scope={view.proposedScope} labels={known.labels} wrap="wrap" />
              <Text size="xs" c="dimmed">
                amended when accepted
              </Text>
            </Group>
          </FactRow>
        )}
      </div>
    </Paper>
  );
}

/** What it replaces or overrides, and the quotes and derivations it rests on. */
export function DerivationEvidence({ view, kind }: { view: DerivationView; kind: DerivedKindView | undefined }) {
  const backlogKind = kind?.recall === "never";
  const cited =
    view.supportingSources.length +
    view.contradictingSources.length +
    view.supportingDerivations.length +
    view.contradictingDerivations.length;
  return (
    <>
      {(view.supersedes !== undefined || view.despite.length > 0) && (
        <Stack gap={8}>
          {view.supersedes !== undefined && <SupersedesNotice replaces={view.supersedes} />}
          {view.despite.length > 0 && <DespiteNotice despite={view.despite} agentCase={view.derivation.despite_case} />}
        </Stack>
      )}
      {cited > 0 && (
        <Paper px="md" py="sm">
          <Stack gap={8}>
            {backlogKind && (
              <Text size="xs" c="dimmed">
                What prompted this
              </Text>
            )}
            {view.supportingSources.map((source) => (
              <SourceQuote key={source.source.id} view={source} role={backlogKind ? "prompted" : "supports"} showKind />
            ))}
            {view.contradictingSources.map((source) => (
              <SourceQuote key={source.source.id} view={source} role={backlogKind ? "plain" : "contradicts"} showKind />
            ))}
            {view.supportingDerivations.map((summary) => (
              <DerivationSummaryLine key={summary.id} summary={summary} note="builds on" />
            ))}
            {view.contradictingDerivations.map((summary) => (
              <DerivationSummaryLine key={summary.id} summary={summary} note="cuts against" />
            ))}
          </Stack>
        </Paper>
      )}
    </>
  );
}
