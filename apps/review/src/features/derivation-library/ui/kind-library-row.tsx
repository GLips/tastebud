import { ActionIcon, Box, Button, Group, Menu, Table, Text, TextInput, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationRow } from "@tastebud/core/record-browsing";
import type { DecisionOutcome, DerivationStatus } from "@tastebud/core/taste-vocabulary";
import { CornerDownRight, MessageSquare, MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { useReviewDecision } from "#review/features/derivation-decisions/index.ts";
import { formatReviewDate } from "#review/shared/format.ts";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { DERIVATION_STATUS_WORDS } from "#review/shared/ui/status-chips.tsx";
import { SubjectLabel } from "#review/shared/ui/subject-label.tsx";

const styles = stylex.create({
  // The statement's link covers the row (its ::after), so the whole row opens the page; the cells that hold
  // their own controls sit above that cover.
  row: {
    position: "relative",
    backgroundColor: {
      default: null,
      ":hover": "var(--mantine-color-gray-0)",
      ":focus-within": "var(--mantine-color-gray-0)",
    },
  },
  rowLink: {
    "::after": { content: "''", position: "absolute", inset: 0 },
    ":focus-visible": { outline: "none" },
  },
  aboveRowLink: { position: "relative", zIndex: 1 },
  noWrap: { whiteSpace: "nowrap" },
  fitCell: { width: "1%", whiteSpace: "nowrap" },
  numericNoWrap: { whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  // One quiet "⋯" per row: hidden until the row is hovered or holds focus, and while its menu is open.
  menuButton: {
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
      [stylex.when.ancestor(":focus-within")]: 1,
    },
  },
  menuOpen: { opacity: 1 },
});

/** The decisions core accepts from each status; a superseded row is decided through its revision. */
const LIBRARY_ACTIONS: Record<DerivationStatus, ReadonlyArray<DecisionOutcome>> = {
  pending: ["accept", "reject"],
  accepted: ["reject", "retract", "reopen"],
  rejected: ["accept", "reopen"],
  retracted: ["accept", "reject", "reopen"],
  superseded: [],
};

const STATUS_AFTER: Record<DecisionOutcome, DerivationStatus> = {
  accept: "accepted",
  reject: "rejected",
  retract: "retracted",
  reopen: "pending",
};

/** Why a row is in its section, in one line; pending and accepted need none. */
function DerivationRowWhy({ row }: { row: DerivationRow }) {
  if (row.status === "superseded" && row.replacedBy !== undefined)
    return (
      <Group gap="2xs" wrap="nowrap" {...stylex.props(styles.aboveRowLink)}>
        <CornerDownRight size={12} color="var(--mantine-color-gray-6)" />
        <Text size="sm" c="gray.7" span {...stylex.props(styles.noWrap)}>
          Replaced by
        </Text>
        <AnchorLink to="/derivations/$id" params={{ id: row.replacedBy.id }} size="sm" c="gray.7" lineClamp={1}>
          “{row.replacedBy.statement}”
        </AnchorLink>
      </Group>
    );
  if (row.status === "rejected" || row.status === "retracted")
    return (
      <Text size="sm" c="gray.7" lineClamp={1}>
        {DERIVATION_STATUS_WORDS[row.status]} {formatReviewDate(row.decidedAt)}
        {row.reason !== undefined && `: “${row.reason}”`}
      </Text>
    );
  return null;
}

/** The reason a rejection needs, asked for in the row itself. */
function InlineRejectReason({
  onReject,
  onCancel,
  busy,
}: {
  onReject: (reason: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState("");
  const submit = () => {
    if (reason.trim() !== "") onReject(reason.trim());
  };
  return (
    <Group gap="xs" wrap="nowrap" mt="2xs" {...stylex.props(styles.aboveRowLink)}>
      <TextInput
        size="xs"
        flex={1}
        autoFocus
        aria-label="Why reject it"
        placeholder="Why? Agents are told this reason."
        value={reason}
        onChange={(event) => setReason(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
          if (event.key === "Escape") onCancel();
        }}
      />
      <Button color="red" variant="light" disabled={reason.trim() === ""} loading={busy} onClick={submit}>
        Reject
      </Button>
      <Button variant="subtle" color="gray" onClick={onCancel}>
        Cancel
      </Button>
    </Group>
  );
}

/**
 * One library row: the statement (the whole row opens it), why it stands where it does, and a quiet menu of
 * the decisions valid from its status. The decision's outcome and Undo stay on the row as it moves section.
 */
export function KindLibraryRow({
  row,
  labels,
  owner,
  acceptLabel,
}: {
  row: DerivationRow;
  labels: ReadonlyMap<string, string>;
  owner: string | undefined;
  /** The kind's word for accepting ("Believe"); absent for a retired kind, which can't be decided. */
  acceptLabel: string | undefined;
}) {
  const decision = useReviewDecision(row.id, {
    status: row.status,
    proposedScope: row.proposedScope,
    effectiveScope: row.effectiveScope,
    reason: row.reason,
  });
  const [rejecting, setRejecting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const actions = acceptLabel === undefined ? [] : LIBRARY_ACTIONS[row.status];
  const actionLabels: Record<DecisionOutcome, string> = {
    accept: acceptLabel ?? "Accept",
    reject: "Reject…",
    retract: "Retract",
    reopen: "Put back in the inbox",
  };
  const choose = (action: DecisionOutcome) => {
    if (action === "reject") return setRejecting(true);
    void decision.decide({ outcome: action });
  };

  return (
    <Table.Tr {...stylex.props(styles.row, stylex.defaultMarker())}>
      <Table.Td pl="xl">
        <AnchorLink
          to="/derivations/$id"
          params={{ id: row.id }}
          c="inherit"
          fw={500}
          size="sm"
          underline="never"
          {...stylex.props(styles.rowLink)}
        >
          {row.statement}
        </AnchorLink>{" "}
        <Text span size="sm" c="gray.7">
          <SubjectLabel summary={row} owner={owner} />
        </Text>
        <DerivationRowWhy row={row} />
        {rejecting && (
          <InlineRejectReason
            busy={decision.pending}
            onCancel={() => setRejecting(false)}
            onReject={(reason) => void decision.decide({ outcome: "reject", reason }).then(() => setRejecting(false))}
          />
        )}
        {decision.undoable !== undefined && (
          <Group gap="xs" mt="2xs" {...stylex.props(styles.aboveRowLink)} aria-live="polite">
            <Text size="sm" c="gray.7">
              Moved to {DERIVATION_STATUS_WORDS[STATUS_AFTER[decision.undoable.outcome]]}.
            </Text>
            <Button variant="subtle" size="compact-sm" loading={decision.pending} onClick={() => void decision.undo()}>
              Undo
            </Button>
          </Group>
        )}
        {decision.failure !== undefined && (
          <Text size="sm" c="red.8" mt="2xs" {...stylex.props(styles.aboveRowLink)} role="alert">
            {decision.failure.sentence}{" "}
            <AnchorLink to="/derivations/$id" params={{ id: row.id }} size="sm">
              Decide on its page
            </AnchorLink>
          </Text>
        )}
      </Table.Td>
      <Table.Td w={48}>
        {row.threadCount > 0 && (
          <Tooltip label={`${row.threadCount} ${row.threadCount === 1 ? "note" : "notes"} in the thread`} withArrow>
            <Group gap="3xs" wrap="nowrap" c="dimmed" {...stylex.props(styles.aboveRowLink)}>
              <MessageSquare size={13} />
              <Text size="xs">{row.threadCount}</Text>
            </Group>
          </Tooltip>
        )}
      </Table.Td>
      <Table.Td {...stylex.props(styles.fitCell)}>
        <Box {...stylex.props(styles.aboveRowLink)}>
          <ScopeChips scope={row.effectiveScope} labels={labels} />
        </Box>
      </Table.Td>
      <Table.Td w={96} ta="right">
        <Text size="xs" c="dimmed" title="Proposed" {...stylex.props(styles.numericNoWrap)}>
          {formatReviewDate(row.proposedAt)}
        </Text>
      </Table.Td>
      <Table.Td w={44} px="xxs">
        {actions.length > 0 && (
          <Menu
            position="bottom-end"
            withArrow
            shadow="md"
            opened={menuOpen}
            onChange={setMenuOpen}
            // Reject moves focus into its reason box, so the menu must not pull it back to the button.
            returnFocus={!rejecting}
          >
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={`Change “${row.statement}”`}
                disabled={decision.pending}
                {...stylex.props(styles.aboveRowLink, styles.menuButton, menuOpen && styles.menuOpen)}
              >
                <MoreHorizontal size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {actions.map((action) => (
                <Menu.Item key={action} {...(action === "reject" && { color: "red" })} onClick={() => choose(action)}>
                  {actionLabels[action]}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
      </Table.Td>
    </Table.Tr>
  );
}
