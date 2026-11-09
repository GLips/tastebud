/** The top of the derivation page: what it says and what the page is for, then its evidence and the agent's reasoning. */
import { Anchor, CopyButton, Group, Kbd, Paper, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useCanGoBack, useRouter } from "@tanstack/react-router";
import type { CatalogView, DerivedKindView } from "@tastebud/core/kind-catalog";
import type { DerivationView } from "@tastebud/core/record-views";
import { shortIdOf } from "@tastebud/core/taste-vocabulary";
import { ArrowLeft, Copy } from "lucide-react";

import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { DerivationSummaryLine, DespiteNotice, SupersedesNotice } from "#review/shared/ui/derivation-link.tsx";
import { KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SourceQuote } from "#review/shared/ui/source-quote.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

const styles = stylex.create({
  prose: { whiteSpace: "pre-wrap" },
  id: { fontFamily: "var(--mantine-font-family-monospace)" },
  copy: { cursor: "copy" },
});

/**
 * The page's one way back: to wherever the owner came from inside the app (inbox, library, a source),
 * else to the kind's library when the page was opened directly.
 */
export function useDerivationBack(kind: string): DerivationBack {
  const router = useRouter();
  if (useCanGoBack()) return { kind: "history", go: () => router.history.back() };
  return { kind: "library", go: () => void router.navigate({ to: "/kinds/$kind", params: { kind } }) };
}

export interface DerivationBack {
  readonly kind: "history" | "library";
  readonly go: () => void;
}

export function DerivationHeader({
  view,
  kind,
  catalog,
  back,
}: {
  view: DerivationView;
  kind: DerivedKindView | undefined;
  catalog: CatalogView | undefined;
  back: DerivationBack;
}) {
  return (
    <ReviewPageHeader
      crumb={
        <Group justify="space-between">
          <DerivationBackLink view={view} kind={kind} back={back} />
          <DerivationIdCopy id={view.id} />
        </Group>
      }
      icon={<KindGlyph catalog={catalog} kind={view.kind} />}
      title={view.statement}
    />
  );
}

function DerivationBackLink({
  view,
  kind,
  back,
}: {
  view: DerivationView;
  kind: DerivedKindView | undefined;
  back: DerivationBack;
}) {
  if (back.kind === "history")
    return (
      <Anchor component="button" size="sm" c="dimmed" underline="hover" onClick={back.go}>
        <Group gap="2xs">
          <ArrowLeft size={14} />
          Back
          <Kbd size="xs">Esc</Kbd>
        </Group>
      </Anchor>
    );
  return (
    <AnchorLink to="/kinds/$kind" params={{ kind: view.kind }} size="sm" c="dimmed" underline="hover">
      <Group gap="2xs">
        <ArrowLeft size={14} />
        All {kind?.plural ?? view.kind}
      </Group>
    </AnchorLink>
  );
}

function DerivationIdCopy({ id }: { id: string }) {
  return (
    <CopyButton value={id}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "Copied" : "Copy the full id, for the tastebud CLI"} withArrow>
          <Group gap="2xs" c="dimmed" onClick={copy} {...stylex.props(styles.copy)}>
            <Text fz="2xs">ID</Text>
            <Text fz="2xs" {...stylex.props(styles.id)}>
              {shortIdOf(id)}
            </Text>
            <Copy size={11} />
          </Group>
        </Tooltip>
      )}
    </CopyButton>
  );
}

/** What it replaces or overrides, then the agent's reasoning and the quotes and derivations it rests on. */
export function DerivationEvidence({ view, kind }: { view: DerivationView; kind: DerivedKindView | undefined }) {
  const catalog = useReviewCatalog();
  const backlogKind = kind?.recall === "never";
  const reasoning = view.derivation.reasoning.trim();
  const cited =
    view.supportingSources.length +
    view.contradictingSources.length +
    view.supportingDerivations.length +
    view.contradictingDerivations.length;
  return (
    <>
      {(view.supersedes !== undefined || view.despite.length > 0) && (
        <Stack gap="xs">
          {view.supersedes !== undefined && <SupersedesNotice replaces={view.supersedes} />}
          {view.despite.length > 0 && <DespiteNotice despite={view.despite} agentCase={view.derivation.despite_case} />}
        </Stack>
      )}
      {(cited > 0 || reasoning !== "") && (
        <Paper px="md" py="sm">
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              {backlogKind ? "What prompted this" : "What it rests on"}
            </Text>
            {reasoning !== "" && (
              <Text size="sm" {...stylex.props(styles.prose)}>
                <SupportingText tier="secondary" span>
                  The agent&apos;s reasoning:
                </SupportingText>{" "}
                {reasoning}
              </Text>
            )}
            {view.supportingSources.map((source) => (
              <SourceQuote key={source.source.id} view={source} role={backlogKind ? "prompted" : "supports"} showKind />
            ))}
            {view.contradictingSources.map((source) => (
              <SourceQuote key={source.source.id} view={source} role={backlogKind ? "plain" : "contradicts"} showKind />
            ))}
            {view.supportingDerivations.map((summary) => (
              <DerivationSummaryLine catalog={catalog} key={summary.id} summary={summary} note="builds on" />
            ))}
            {view.contradictingDerivations.map((summary) => (
              <DerivationSummaryLine catalog={catalog} key={summary.id} summary={summary} note="cuts against" />
            ))}
          </Stack>
        </Paper>
      )}
    </>
  );
}
