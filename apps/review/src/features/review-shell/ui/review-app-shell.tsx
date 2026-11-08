import { Box, ActionIcon, Badge, Container, Group, Menu, Text, Tooltip, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Settings, UserRound } from "lucide-react";
import type { ReactNode } from "react";

import { capitalize, KindGlyph } from "#review/shared/ui/kind-identity.tsx";

import { reviewShellQuery } from "./review-shell-queries.ts";

const styles = stylex.create({
  page: { minHeight: "100vh", backgroundColor: "var(--mantine-color-gray-0)" },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    backgroundColor: "white",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--mantine-color-gray-2)",
  },
  bar: { height: "48px" },
  brand: { display: "flex", alignItems: "center" },
  lockup: { height: "24px", display: "block" },
  navLink: {
    paddingInline: "10px",
    paddingBlock: "5px",
    borderRadius: "6px",
    fontWeight: 500,
    color: "var(--mantine-color-gray-7)",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: { default: null, ":hover": "var(--mantine-color-gray-1)" },
  },
  navActive: {
    backgroundColor: { default: "var(--mantine-color-tastebud-0)", ":hover": "var(--mantine-color-tastebud-1)" },
    color: "var(--mantine-color-tastebud-9)",
    fontWeight: 600,
  },
  divider: { width: "1px", height: "16px", backgroundColor: "var(--mantine-color-gray-2)", marginInline: "4px" },
  who: { display: "flex", alignItems: "center", gap: "5px", cursor: "default" },
  main: { paddingBlock: "20px" },
});

/**
 * Whether the page at `pathname` belongs to the nav entry at `section`: the section itself or a page under
 * it, so a source's page keeps Sources lit. The inbox is `/` and matches only itself.
 */
const isNavSectionActive = (pathname: string, section: string) =>
  section === "/" ? pathname === "/" : pathname === section || pathname.startsWith(`${section}/`);

function useNavSectionActive(section: string) {
  return useRouterState({ select: (state) => isNavSectionActive(state.location.pathname, section) });
}

/** One top-level entry. Active state is computed here, not with `activeProps`, so StyleX merges it with the base. */
function ShellNavLink({ to, children }: { to: "/" | "/sources" | "/recall" | "/places"; children: ReactNode }) {
  const active = useNavSectionActive(to);
  return (
    <Link
      to={to}
      {...stylex.props(styles.navLink, active && styles.navActive)}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

/** Past this many derived kinds the header folds them into one Library menu. */
const INLINE_KIND_LIMIT = 3;

function KindNavigation() {
  const catalog = useQuery(reviewShellQuery).data?.catalog;
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const kinds = catalog?.derivedKinds ?? [];
  if (kinds.length <= INLINE_KIND_LIMIT) {
    return kinds.map((kind) => (
      <Link
        key={kind.key}
        to="/kinds/$kind"
        params={{ kind: kind.key }}
        {...stylex.props(styles.navLink, isNavSectionActive(pathname, `/kinds/${kind.key}`) && styles.navActive)}
      >
        <KindGlyph catalog={catalog} kind={kind.key} size={10} />
        {capitalize(kind.plural)}
      </Link>
    ));
  }
  return (
    <Menu position="bottom-start" withArrow shadow="md">
      <Menu.Target>
        <UnstyledButton {...stylex.props(styles.navLink, pathname.startsWith("/kinds/") && styles.navActive)}>
          Library <ChevronDown size={13} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {kinds.map((kind) => (
          <Menu.Item
            key={kind.key}
            component={Link}
            to={`/kinds/${kind.key}`}
            leftSection={<KindGlyph catalog={catalog} kind={kind.key} />}
          >
            {capitalize(kind.plural)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/** Who is reviewing which store, or why the store can't be read. */
function ReviewerIdentity() {
  const shell = useQuery(reviewShellQuery);
  if (shell.data !== undefined)
    return (
      <Tooltip
        label={`Reviewing as ${shell.data.catalog.owner} · ${shell.data.storeRoot}`}
        withArrow
        position="bottom-end"
      >
        <Box component="span" {...stylex.props(styles.who)}>
          <UserRound size={14} color="var(--mantine-color-gray-6)" />
          <Text size="xs" c="dimmed">
            {shell.data.catalog.owner}
          </Text>
        </Box>
      </Tooltip>
    );
  if (shell.error)
    return (
      <Tooltip label={shell.error.message} withArrow multiline w={320} position="bottom-end">
        <Text size="xs" c="red">
          Store unavailable
        </Text>
      </Tooltip>
    );
  return null;
}

export function ReviewAppShell({ children }: { children: ReactNode }) {
  const shell = useQuery(reviewShellQuery);
  const settingsActive = useNavSectionActive("/settings");
  const hasKinds = (shell.data?.catalog.derivedKinds.length ?? 0) > 0;
  const pendingTotal = Object.values(shell.data?.pendingByKind ?? {}).reduce((sum, count) => sum + count, 0);
  return (
    <Box {...stylex.props(styles.page)}>
      <Box component="header" {...stylex.props(styles.header)}>
        <Container>
          <Group justify="space-between" wrap="nowrap" {...stylex.props(styles.bar)}>
            <Group gap="lg" wrap="nowrap">
              <Link to="/" aria-label="Tastebud: back to the inbox" {...stylex.props(styles.brand)}>
                <Box component="img" src="/brand/lockup.svg" alt="tastebud" {...stylex.props(styles.lockup)} />
              </Link>
              <Group gap="3xs" wrap="nowrap" fz="sm">
                <ShellNavLink to="/">
                  Inbox
                  {pendingTotal > 0 && (
                    <Badge size="sm" circle={pendingTotal < 10} variant="filled">
                      {pendingTotal}
                    </Badge>
                  )}
                </ShellNavLink>
                {hasKinds && (
                  <>
                    <Box component="span" {...stylex.props(styles.divider)} />
                    <KindNavigation />
                  </>
                )}
                <Box component="span" {...stylex.props(styles.divider)} />
                <ShellNavLink to="/sources">Sources</ShellNavLink>
                <ShellNavLink to="/recall">Recall</ShellNavLink>
                <ShellNavLink to="/places">Places</ShellNavLink>
              </Group>
            </Group>
            <Group gap={10} wrap="nowrap">
              <ReviewerIdentity />
              <Tooltip label="Settings" withArrow>
                <ActionIcon
                  component={Link}
                  to="/settings"
                  variant={settingsActive ? "light" : "subtle"}
                  color={settingsActive ? "tastebud" : "gray"}
                  aria-label="Settings"
                  aria-current={settingsActive ? "page" : undefined}
                >
                  <Settings size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Container>
      </Box>
      <Container {...stylex.props(styles.main)}>{children}</Container>
    </Box>
  );
}
