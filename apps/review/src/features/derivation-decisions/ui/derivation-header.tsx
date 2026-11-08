/** The top of the derivation page: what it says and the agent's case for it, then its evidence. */
import { Anchor, CopyButton, Group, Kbd, Paper, Stack, Text, Title, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useCanGoBack, useRouter } from "@tanstack/react-router";
import type { CatalogView, DerivedKindView } from "@tastebud/core/kind-catalog";
import type { DerivationView } from "@tastebud/core/record-views";
import { shortIdOf } from "@tastebud/core/taste-vocabulary";
import { ArrowLeft, Copy } from "lucide-react";

import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { DerivationSummaryLine, DespiteNotice, SupersedesNotice } from "#review/shared/ui/derivation-link.tsx";
import { capitalize, KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SourceQuote } from "#review/shared/ui/source-quote.tsx";

const styles = stylex.create({
  statement: { lineHeight: 1.3, letterSpacing: "-0.015em", fontWeight: 650, textWrap: "balance" },
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
  owner,
  back,
}: {
  view: DerivationView;
  kind: DerivedKindView | undefined;
  catalog: CatalogView | undefined;
  owner: string;
  back: DerivationBack;
}) {
  const reasoning = view.derivation.reasoning.trim();
  return (
    <>
      <Group justify="space-between">
        {back.kind === "history" ? (
          <Anchor component="button" size="sm" c="dimmed" underline="hover" onClick={back.go}>
            <Group gap="2xs">
              <ArrowLeft size={14} />
              Back
              <Kbd size="xs">Esc</Kbd>
            </Group>
          </Anchor>
        ) : (
          <AnchorLink to="/kinds/$kind" params={{ kind: view.kind }} size="sm" c="dimmed" underline="hover">
            <Group gap="2xs">
              <ArrowLeft size={14} />
              All {kind?.plural ?? view.kind}
            </Group>
          </AnchorLink>
        )}
        <CopyButton value={view.id}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? "Copied" : "Copy the full id, for the tastebud CLI"} withArrow>
              <Group gap="2xs" c="dimmed" onClick={copy} {...stylex.props(styles.copy)}>
                <Text fz="2xs">ID</Text>
                <Text fz="2xs" {...stylex.props(styles.id)}>
                  {shortIdOf(view.id)}
                </Text>
                <Copy size={11} />
              </Group>
            </Tooltip>
          )}
        </CopyButton>
      </Group>

      <Stack gap="xxs">
        <Group gap="xxs">
          <KindGlyph catalog={catalog} kind={view.kind} />
          <Text size="sm" fw={500} c="dark.4">
            {capitalize(view.kindLabel)}
            {view.retired && " (retired kind)"}
          </Text>
          {view.subject !== undefined && view.subject !== "owner" && view.subject !== owner && (
            <Text size="sm" c="dimmed">
              · about {view.subject}
            </Text>
          )}
        </Group>
        <Title order={2} fz="pageStatement" {...stylex.props(styles.statement)}>
          {view.statement}
        </Title>
        {reasoning !== "" && (
          <Text size="sm" c="dimmed" {...stylex.props(styles.prose)}>
            {reasoning}
          </Text>
        )}
      </Stack>
    </>
  );
}

/** What it replaces or overrides, and the quotes and derivations it rests on. */
export function DerivationEvidence({ view, kind }: { view: DerivationView; kind: DerivedKindView | undefined }) {
  const catalog = useReviewCatalog();
  const backlogKind = kind?.recall === "never";
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
      {cited > 0 && (
        <Paper px="md" py="sm">
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              {backlogKind ? "What prompted this" : "What it rests on"}
            </Text>
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
