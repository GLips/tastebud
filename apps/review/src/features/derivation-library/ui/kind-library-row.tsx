import { ActionIcon, Button, Group, Menu, Table, Text, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import type { DerivationRow } from "@tastebud/core/record-browsing";
import type { DecisionOutcome, DerivationStatus } from "@tastebud/core/taste-vocabulary";
import { ChevronDown, ChevronRight, CornerDownRight, MessageSquare, MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { formatReviewDate } from "#review/shared/format.ts";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { DERIVATION_STATUS_WORDS, DerivationStatusBadge } from "#review/shared/ui/status-chips.tsx";
import { SubjectChip } from "#review/shared/ui/subject-chip.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";
import { WordBoundaryText } from "#review/shared/ui/word-boundary-text.tsx";

import { LibraryAcceptOverlaps } from "./library-accept-overlaps.tsx";
import type { LibraryDecisionRequest } from "./use-library-decision.ts";

const styles = stylex.create({
  // The statement's link covers the row (its ::after), so the whole row opens the page; the cells that hold
  // their own controls sit above that cover.
  row: {
    position: "relative",
    // A row marks itself so its quick action can show on hover or focus anywhere in the row.
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
  lineToggle: { position: "relative", zIndex: 1, display: "block", textAlign: "start" },
  lineChevron: { verticalAlign: "-1px", marginInlineEnd: "2px", color: "var(--mantine-color-gray-5)" },
  noteCount: { position: "relative", zIndex: 1, marginInlineStart: "8px", verticalAlign: "-1px" },
  quickAction: {
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
      [stylex.when.ancestor(":focus-within")]: 1,
    },
  },
  // The replacement's row hangs under the row it replaced, past the statement's indent.
  replacementCell: { paddingInlineStart: "44px" },
  noWrap: { whiteSpace: "nowrap" },
  fitCell: { width: "1%", whiteSpace: "nowrap" },
  numericNoWrap: { whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
});

/** The decision a row offers on hover, before its ⋯: the likeliest next step from where it stands. */
const LIBRARY_QUICK_ACTION: Record<DerivationStatus, DecisionOutcome | undefined> = {
  pending: "accept",
  accepted: "retract",
  rejected: "accept",
  retracted: "accept",
  superseded: undefined,
};

/** The decisions core accepts from each status; a superseded row is decided through its revision. */
const LIBRARY_ACTIONS: Record<DerivationStatus, ReadonlyArray<DecisionOutcome>> = {
  pending: ["accept", "reject"],
  accepted: ["reject", "retract", "reopen"],
  rejected: ["accept", "reopen"],
  retracted: ["accept", "reject", "reopen"],
  superseded: [],
};

/** What a row's second line is, in the quiet label style every second line shares. */
function RowLineLabel({ children }: { children: string }) {
  return (
    <Text span size="xs" fw={600} c="gray.6">
      {children}
    </Text>
  );
}

/**
 * A row's labelled second line, on one line; clicking it unfolds the whole text (and, for a decision, when it was
 * made), so a long reason, quote or case reads in full without leaving the list.
 */
function LibraryRowLine({ label, text, decided }: { label: string; text: string; decided?: string | undefined }) {
  const [open, setOpen] = useState(false);
  return (
    <UnstyledButton
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-label={open ? `Fold the ${label.toLowerCase()}` : `Read the whole ${label.toLowerCase()}`}
      {...stylex.props(styles.lineToggle)}
    >
      <SupportingText tier="secondary" {...(!open && { lineClamp: 1 })}>
        {open ? (
          <ChevronDown size={12} aria-hidden {...stylex.props(styles.lineChevron)} />
        ) : (
          <ChevronRight size={12} aria-hidden {...stylex.props(styles.lineChevron)} />
        )}
        <RowLineLabel>{label}</RowLineLabel> <WordBoundaryText text={text} />
      </SupportingText>
      {open && decided !== undefined && (
        <SupportingText tier="faint" mt="3xs">
          {decided}
        </SupportingText>
      )}
    </UnstyledButton>
  );
}

/**
 * Why a row stands where it does, in one labelled line: the decision's Reason, the words it was Said in, or the
 * agent's Reasoning.
 */
function DerivationRowWhy({ row }: { row: DerivationRow }) {
  if (row.status === "superseded") return null;
  if ((row.status === "rejected" || row.status === "retracted") && row.reason !== undefined)
    return (
      <LibraryRowLine
        label="Reason"
        text={`“${row.reason}”`}
        decided={`${DERIVATION_STATUS_WORDS[row.status]} ${formatReviewDate(row.decidedAt)}`}
      />
    );
  if (row.status === "accepted" && row.leadQuote !== undefined)
    return <LibraryRowLine label="Said" text={`“${row.leadQuote}”`} />;
  return <LibraryRowLine label="Reasoning" text={row.reasoning} />;
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
      <Table.Td {...stylex.props(styles.replacementCell)}>
        <Group gap="xs" wrap="nowrap">
          <CornerDownRight size={13} color="var(--mantine-color-gray-6)" aria-hidden />
          <SupportingText tier="secondary" span {...stylex.props(styles.noWrap)}>
            Replaced by
          </SupportingText>
          <DerivationStatusBadge status={replacement.status} />
          <Tooltip label={replacement.statement} withArrow multiline maw={420} openDelay={400}>
            <AnchorLink
              to="/derivations/$id"
              params={{ id: replacement.id }}
              c="inherit"
              size="sm"
              underline="never"
              lineClamp={2}
              {...stylex.props(styles.rowLink)}
            >
              <WordBoundaryText text={replacement.statement} />
            </AnchorLink>
          </Tooltip>
        </Group>
      </Table.Td>
      <Table.Td>
        <ScopeChips scope={replacement.effectiveScope} labels={labels} wrap="wrap" />
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
 * One library row: the statement (the whole row opens it), why it stands where it does, its places and date, and
 * its decisions, the likeliest one on hover before a ⋯ of all. Either makes this the row the page decides on, so
 * the page's Undo is bound to it before an action is picked.
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
  const navigate = useNavigate();
  const openReplacement = ({ replacedBy }: DerivationRow) =>
    replacedBy !== undefined && void navigate({ to: "/derivations/$id", params: { id: replacedBy.id } });
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
  const quickAction = acceptLabel === undefined ? undefined : LIBRARY_QUICK_ACTION[row.status];

  return (
    <>
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
          </AnchorLink>
          {row.threadCount > 0 && (
            <Tooltip label={row.threadCount === 1 ? "1 note" : `${row.threadCount} notes`} withArrow openDelay={250}>
              <Text span size="xs" c="gray.6" {...stylex.props(styles.noteCount)}>
                <MessageSquare size={12} aria-hidden /> {row.threadCount}
              </Text>
            </Tooltip>
          )}
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
        <Table.Td>
          <Group gap="2xs" wrap="wrap" {...stylex.props(styles.aboveRowLink)}>
            <SubjectChip summary={row} owner={owner} />
            <ScopeChips scope={row.effectiveScope} labels={labels} wrap="wrap" />
          </Group>
        </Table.Td>
        <Table.Td ta="right">
          <SupportingText tier="secondary" title="Proposed" {...stylex.props(styles.numericNoWrap)}>
            {formatReviewDate(row.proposedAt)}
          </SupportingText>
        </Table.Td>
        <Table.Td px="xxs">
          <Group gap="2xs" wrap="nowrap" justify="flex-end" {...stylex.props(styles.aboveRowLink)}>
            {quickAction !== undefined && (
              <Button
                size="xs"
                variant="default"
                disabled={deciding}
                onClick={() => {
                  onActivate();
                  choose(quickAction);
                }}
                {...stylex.props(styles.quickAction)}
              >
                {actionLabels[quickAction]}
              </Button>
            )}
            {(actions.length > 0 || row.replacedBy !== undefined) && (
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
                    size="input-xs"
                    variant="subtle"
                    color="gray"
                    aria-label={`Change “${row.statement}”`}
                    loading={deciding}
                  >
                    <MoreHorizontal size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {row.status === "superseded" && row.replacedBy !== undefined && (
                    <Menu.Item onClick={() => openReplacement(row)}>Open its replacement</Menu.Item>
                  )}
                  {actions.map((action) => (
                    <Menu.Item
                      key={action}
                      {...(action === "reject" && { color: "red" })}
                      onClick={() => choose(action)}
                    >
                      {actionLabels[action]}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Table.Td>
      </Table.Tr>
      {row.status === "superseded" && row.replacedBy !== undefined && (
        <ReplacedByRow replacement={row.replacedBy} labels={labels} />
      )}
    </>
  );
}
