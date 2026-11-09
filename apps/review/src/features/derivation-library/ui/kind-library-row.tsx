import { ActionIcon, Box, Button, Group, Menu, Table, Text, TextInput, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationRow } from "@tastebud/core/record-browsing";
import type { DecisionOutcome, DerivationStatus } from "@tastebud/core/taste-vocabulary";
import { CornerDownRight, MessageSquare, MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { formatReviewDate } from "#review/shared/format.ts";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { DERIVATION_STATUS_WORDS, DerivationStatusBadge } from "#review/shared/ui/status-chips.tsx";
import { SubjectLabel } from "#review/shared/ui/subject-label.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import { LibraryAcceptOverlaps } from "./library-accept-overlaps.tsx";
import type { LibraryDecisionRequest } from "./use-library-decision.ts";

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
  reasonToggle: { position: "relative", zIndex: 1, display: "block", textAlign: "start" },
  // The replacement's row hangs under the row it replaced, past the statement's indent.
  replacementCell: { paddingInlineStart: "44px" },
  noWrap: { whiteSpace: "nowrap" },
  fitCell: { width: "1%", whiteSpace: "nowrap" },
  numericNoWrap: { whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
});

/** The decisions core accepts from each status; a superseded row is decided through its revision. */
const LIBRARY_ACTIONS: Record<DerivationStatus, ReadonlyArray<DecisionOutcome>> = {
  pending: ["accept", "reject"],
  accepted: ["reject", "retract", "reopen"],
  rejected: ["accept", "reopen"],
  retracted: ["accept", "reject", "reopen"],
  superseded: [],
};

/**
 * A rejection's or retraction's reason, labelled, on one line; clicking it unfolds the whole reason and when it was
 * decided, so it reads in full without leaving the list.
 */
function LibraryRowReason({ row, reason }: { row: DerivationRow; reason: string }) {
  const [open, setOpen] = useState(false);
  return (
    <UnstyledButton
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-label={open ? "Fold the reason" : "Read the whole reason"}
      {...stylex.props(styles.reasonToggle)}
    >
      <SupportingText tier="secondary" {...(!open && { lineClamp: 1 })}>
        <Text span size="xs" fw={600} c="gray.6">
          Reason
        </Text>{" "}
        “{reason}”
      </SupportingText>
      {open && (
        <SupportingText tier="faint" mt="3xs">
          {DERIVATION_STATUS_WORDS[row.status]} {formatReviewDate(row.decidedAt)}
        </SupportingText>
      )}
    </UnstyledButton>
  );
}

/** Why a row stands where it does, in one line: the reasoning, the evidence or the decision's reason. */
function DerivationRowWhy({ row }: { row: DerivationRow }) {
  if (row.status === "superseded") return null;
  if ((row.status === "rejected" || row.status === "retracted") && row.reason !== undefined)
    return <LibraryRowReason row={row} reason={row.reason} />;
  if (row.status === "accepted" && row.leadQuote !== undefined)
    return (
      <SupportingText tier="secondary" lineClamp={1}>
        “{row.leadQuote}”
      </SupportingText>
    );
  return (
    <SupportingText tier="secondary" lineClamp={1}>
      {row.reasoning}
    </SupportingText>
  );
}

/** The revision that replaced a superseded row, as a linked row hanging under it. */
function ReplacedByRow({
  replacement,
  labels,
}: {
  replacement: NonNullable<DerivationRow["replacedBy"]>;
  labels: ReadonlyMap<string, string>;
}) {
  return (
    <Table.Tr {...stylex.props(styles.row)}>
      <Table.Td colSpan={2} {...stylex.props(styles.replacementCell)}>
        <Group gap="xs" wrap="nowrap">
          <CornerDownRight size={13} color="var(--mantine-color-gray-6)" aria-hidden />
          <SupportingText tier="secondary" span {...stylex.props(styles.noWrap)}>
            Replaced by
          </SupportingText>
          <DerivationStatusBadge status={replacement.status} />
          <AnchorLink
            to="/derivations/$id"
            params={{ id: replacement.id }}
            c="inherit"
            size="sm"
            underline="never"
            lineClamp={1}
            {...stylex.props(styles.rowLink)}
          >
            {replacement.statement}
          </AnchorLink>
        </Group>
      </Table.Td>
      <Table.Td {...stylex.props(styles.fitCell)}>
        <ScopeChips scope={replacement.effectiveScope} labels={labels} />
      </Table.Td>
      <Table.Td ta="right">
        <SupportingText tier="secondary" title="Proposed" {...stylex.props(styles.numericNoWrap)}>
          {formatReviewDate(replacement.proposedAt)}
        </SupportingText>
      </Table.Td>
      <Table.Td />
    </Table.Tr>
  );
}

/** The reason a rejection needs, asked for in the row itself. */
function InlineRejectReason({
  onReject,
  onCancel,
  onFocus,
  busy,
}: {
  onReject: (reason: string) => void;
  onCancel: () => void;
  /** Makes this row the page's decision target again, in case another row's menu was opened since. */
  onFocus: () => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState("");
  const submit = () => {
    if (reason.trim() !== "") onReject(reason.trim());
  };
  return (
    <Group gap="xs" wrap="nowrap" mt="xxs" {...stylex.props(styles.aboveRowLink)}>
      <TextInput
        size="sm"
        flex={1}
        autoFocus
        aria-label="Why reject it"
        placeholder="Why? Agents are told this reason."
        value={reason}
        onFocus={onFocus}
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

/** The page's decision as one row sees it. */
interface LibraryRowDecision {
  /** A decision on this row is being written. */
  readonly deciding: boolean;
  /** This row's accept is waiting on its overlaps being looked over. */
  readonly overlapping: boolean;
  readonly onActivate: () => void;
  readonly onDecide: (request: LibraryDecisionRequest) => Promise<void>;
  readonly onCancelAccept: () => void;
}

/**
 * One library row: the statement (the whole row opens it), why it stands where it does, its notes, places and
 * date, and a quiet ⋯ menu of the decisions valid from its status. Opening the menu makes this the row the page
 * decides on, so the page's decision (and its Undo) is bound to it before an action is picked.
 */
export function KindLibraryRow({
  row,
  labels,
  owner,
  acceptLabel,
  decision,
}: {
  row: DerivationRow;
  labels: ReadonlyMap<string, string>;
  owner: string | undefined;
  /** The kind's word for accepting ("Believe"); absent for a retired kind, which can't be decided. */
  acceptLabel: string | undefined;
  decision: LibraryRowDecision;
}) {
  const { deciding, overlapping, onActivate, onDecide, onCancelAccept } = decision;
  const [rejecting, setRejecting] = useState(false);
  const actions = acceptLabel === undefined ? [] : LIBRARY_ACTIONS[row.status];
  const actionLabels: Record<DecisionOutcome, string> = {
    accept: acceptLabel ?? "Accept",
    reject: "Reject…",
    retract: "Retract",
    reopen: "Put back in the inbox",
  };
  const choose = (outcome: DecisionOutcome) => {
    if (outcome === "reject") return setRejecting(true);
    void onDecide({ outcome });
  };

  return (
    <>
      <Table.Tr {...stylex.props(styles.row)}>
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
          <SupportingText tier="secondary" span>
            <SubjectLabel summary={row} owner={owner} />
          </SupportingText>
          <DerivationRowWhy row={row} />
          {rejecting && (
            <InlineRejectReason
              busy={deciding}
              onFocus={onActivate}
              onCancel={() => setRejecting(false)}
              onReject={(reason) => void onDecide({ outcome: "reject", reason }).then(() => setRejecting(false))}
            />
          )}
          {overlapping && acceptLabel !== undefined && (
            <LibraryAcceptOverlaps
              row={row}
              acceptLabel={acceptLabel}
              labels={labels}
              pending={deciding}
              onConfirm={(acknowledges) => void onDecide({ outcome: "accept", acknowledges })}
              onBack={onCancelAccept}
            />
          )}
        </Table.Td>
        <Table.Td {...stylex.props(styles.fitCell)}>
          {row.threadCount > 0 && (
            <Group gap="3xs" wrap="nowrap" c="gray.7">
              <MessageSquare size={13} aria-hidden />
              <SupportingText tier="secondary">
                {row.threadCount} {row.threadCount === 1 ? "note" : "notes"}
              </SupportingText>
            </Group>
          )}
        </Table.Td>
        <Table.Td {...stylex.props(styles.fitCell)}>
          <Box {...stylex.props(styles.aboveRowLink)}>
            <ScopeChips scope={row.effectiveScope} labels={labels} />
          </Box>
        </Table.Td>
        <Table.Td w={104} ta="right">
          <SupportingText tier="secondary" title="Proposed" {...stylex.props(styles.numericNoWrap)}>
            {formatReviewDate(row.proposedAt)}
          </SupportingText>
        </Table.Td>
        <Table.Td w={44} px="xxs">
          {actions.length > 0 && (
            <Menu
              position="bottom-end"
              withArrow
              shadow="md"
              onOpen={onActivate}
              // Reject moves focus into its reason box, so the menu must not pull it back to the button.
              returnFocus={!rejecting}
            >
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={`Change “${row.statement}”`}
                  loading={deciding}
                  {...stylex.props(styles.aboveRowLink)}
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
      {row.status === "superseded" && row.replacedBy !== undefined && (
        <ReplacedByRow replacement={row.replacedBy} labels={labels} />
      )}
    </>
  );
}
