/**
 * The parts a derivation's detail is built from, on its page and in the inbox pane alike: the way back,
 * the title row with its state and actions, the section frame, and what it rests on.
 */
import { Anchor, Box, CopyButton, Group, Kbd, Paper, Stack, Text, Title, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useCanGoBack, useRouter } from "@tanstack/react-router";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import type { DerivationView } from "@tastebud/core/record-views";
import { shortIdOf } from "@tastebud/core/taste-vocabulary";
import { ArrowLeft, Copy } from "lucide-react";
import type { ReactNode } from "react";

import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SourceQuote } from "#review/shared/ui/source-quote.tsx";

const styles = stylex.create({
  prose: { whiteSpace: "pre-wrap" },
  id: { fontFamily: "var(--mantine-font-family-monospace)" },
  copy: { cursor: "copy" },
  titleText: { minWidth: 0, flex: 1 },
  actions: { flexShrink: 0 },
  quoteRow: {
    paddingBlock: "10px",
    paddingInline: "12px",
    borderTopWidth: { default: "1px", ":first-child": "0" },
    borderTopStyle: "solid",
    borderTopColor: "var(--mantine-color-gray-2)",
  },
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

export function DerivationBackLink({
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

/**
 * The statement with its state under it and the actions that fit that state at the right, as Graphite
 * and GitHub lay out a PR's head. `size` is the page's large title or the pane's card-sized one.
 */
export function DerivationTitleRow({
  glyph,
  statement,
  meta,
  actions,
  size,
}: {
  glyph?: ReactNode;
  statement: string;
  /** The line under the statement: the status badge, or the pane's link to the full page. */
  meta: ReactNode;
  actions: ReactNode;
  size: "page" | "pane";
}) {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
      <Stack gap="xxs" {...stylex.props(styles.titleText)}>
        <Group gap="xs" wrap="nowrap" align="baseline">
          {glyph}
          {size === "page" ? (
            <Title order={3}>{statement}</Title>
          ) : (
            <Text fz="cardStatement" fw={600}>
              {statement}
            </Text>
          )}
        </Group>
        <Group gap="xs">{meta}</Group>
      </Stack>
      <Box {...stylex.props(styles.actions)}>{actions}</Box>
    </Group>
  );
}

/** A titled section of the detail: a quiet heading, then its content. */
export function DerivationSection({
  title,
  id,
  children,
}: {
  title: string;
  /** An anchor for links into the section. */
  id?: string | undefined;
  children: ReactNode;
}) {
  return (
    <Stack gap="xs" component="section" id={id}>
      <Text size="sm" fw={600}>
        {title}
      </Text>
      {children}
    </Stack>
  );
}

export function DerivationIdCopy({ id }: { id: string }) {
  return (
    <CopyButton value={id}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "Copied" : "Copy the full id, for the tastebud CLI"} withArrow>
          <Group gap="2xs" c="dimmed" onClick={copy} {...stylex.props(styles.copy)}>
            <Text fz="xs" {...stylex.props(styles.id)}>
              {shortIdOf(id)}
            </Text>
            <Copy size={11} />
          </Group>
        </Tooltip>
      )}
    </CopyButton>
  );
}

/** The agent's reasoning, labelled, then each quote it rests on as a row; a contradicting quote is chipped. */
export function DerivationRestsOn({ view, kind }: { view: DerivationView; kind: DerivedKindView | undefined }) {
  const backlogKind = kind?.recall === "never";
  const reasoning = view.derivation.reasoning.trim();
  const quotes = view.supportingSources.length + view.contradictingSources.length;
  if (quotes === 0 && reasoning === "") return null;
  return (
    <DerivationSection title={backlogKind ? "What prompted this" : "What it rests on"}>
      <Paper>
        {reasoning !== "" && (
          <Stack gap="3xs" {...stylex.props(styles.quoteRow)}>
            <Text size="xs" c="dimmed" fw={500}>
              Agent&apos;s reasoning
            </Text>
            <Text size="sm" {...stylex.props(styles.prose)}>
              {reasoning}
            </Text>
          </Stack>
        )}
        {view.supportingSources.map((source) => (
          <Box key={source.source.id} {...stylex.props(styles.quoteRow)}>
            <SourceQuote view={source} role={backlogKind ? "prompted" : "supports"} showKind />
          </Box>
        ))}
        {view.contradictingSources.map((source) => (
          <Box key={source.source.id} {...stylex.props(styles.quoteRow)}>
            <SourceQuote view={source} role={backlogKind ? "plain" : "contradicts"} showKind />
          </Box>
        ))}
      </Paper>
    </DerivationSection>
  );
}
