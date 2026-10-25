import {
  ActionIcon,
  Alert,
  Autocomplete,
  Badge,
  Button,
  Center,
  Code,
  Collapse,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";
import { ChevronRight, Folder, GitCommitVertical, LocateFixed, Search, Tag } from "lucide-react";
import { type ReactNode, useState } from "react";

import type {
  DerivationSummary,
  ExcludedRecallHit,
  HookPayload,
  RecallExclusionReason,
  RecallExplainItem,
  RecallResult,
} from "../core/index.ts";
import { ReviewQueryError } from "../server/review-outcome.ts";
import type { CatalogView } from "../shared/catalog-view.ts";
import type { TasteContext } from "../shared/places.ts";
import { capitalize, findKindView, KindGlyph } from "../ui/kind-identity.tsx";
import { PlaceChip, ScopeChips } from "../ui/place-chips.tsx";
import { type RecallExplanationRequest, recallExplanationQuery, recallInspectionQuery } from "../ui/review-queries.ts";
import { QueryErrorAlert } from "../ui/route-panels.tsx";
import { AnchorLink } from "../ui/router-links.tsx";
import { SourceQuote } from "../ui/source-quote.tsx";
import { DerivationStatusDot } from "../ui/status-chips.tsx";
import { type KnownPlaces, useKnownPlaces, useReviewCatalog } from "../ui/use-review-context.ts";

const RecallSearch = Schema.Struct({
  q: Schema.optionalKey(Schema.String),
  dir: Schema.optionalKey(Schema.String),
  at: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(Schema.String),
  history: Schema.optionalKey(Schema.Boolean),
});

export const Route = createFileRoute("/recall")({
  validateSearch: Schema.toStandardSchemaV1(RecallSearch),
  component: RecallInspectorScreen,
});

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr) minmax(0, 0.9fr)", "@media (max-width: 960px)": "minmax(0, 1fr)" },
    gap: "20px",
    alignItems: "start",
  },
  sticky: { position: { default: "sticky", "@media (max-width: 960px)": "static" }, top: "68px" },
  payload: { whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "12px", lineHeight: 1.55 },
  stale: { opacity: 0.55 },
  row: {
    display: "grid",
    gridTemplateColumns: "10px 12px minmax(0, 1fr)",
    columnGap: "8px",
    alignItems: "baseline",
    paddingBlock: "6px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: { default: "var(--mantine-color-gray-1)", ":first-child": "transparent" },
  },
  rowBody: { minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" },
  details: {
    display: "grid",
    gridTemplateColumns: "96px minmax(0, 1fr)",
    columnGap: "10px",
    rowGap: "2px",
    paddingTop: "4px",
    fontSize: "12px",
  },
  toggle: { display: "inline-flex", alignItems: "center", gap: "2px" },
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(90deg)" },
  contextBar: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minHeight: "24px" },
});

type ContextMode = "dir" | "place" | "none";

const ORIGIN_WORDING: Record<TasteContext["origin"], string> = {
  in: "Resolved from the directory",
  at: "Places taken as given",
  cwd: "Resolved from the working directory",
  "mcp-root": "Resolved from the MCP root",
  unknown: "Unknown context: only global items apply",
};

const exclusionReason = (
  hit: Pick<ExcludedRecallHit, "kind" | "kindLabel" | "status" | "exclusion">,
  catalog: CatalogView | undefined,
  context: TasteContext,
  known: KnownPlaces,
): string => {
  const kind = findKindView(catalog, hit.kind);
  const here = context.places.map(known.labelOf).join(", ");
  const reasons: Record<RecallExclusionReason, string> = {
    "out-of-scope": context.places.length === 0 ? "Not global, and the context is unknown" : `Outside ${here}`,
    "never-policy": `${capitalize(kind?.singular ?? hit.kindLabel)} policy: backlog only`,
    pending: "Pending review",
    "history-not-requested": `${capitalize(hit.status)}: shown only with history`,
    "kind-not-selected": `${capitalize(kind?.plural ?? hit.kind)} filtered out`,
    "retired-kind": "Retired kind",
  };
  return reasons[hit.exclusion];
};

function GroupHeading({ title, count, hint }: { title: string; count: number; hint: string }) {
  return (
    <Tooltip label={hint} withArrow multiline w={280} position="top-start">
      <Group gap={6}>
        <Text size="sm" fw={600}>
          {title}
        </Text>
        <Text size="xs" c="dimmed">
          {count}
        </Text>
      </Group>
    </Tooltip>
  );
}

/** One candidate: what it says, the concrete reason it landed here, and its numbers behind a toggle. */
function CandidateRow({
  item,
  reason,
  reasonColor = "dimmed",
  details,
  children,
}: {
  item: DerivationSummary;
  reason: string;
  reasonColor?: string;
  details: ReadonlyArray<readonly [string, ReactNode]>;
  children?: ReactNode;
}) {
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const [open, setOpen] = useState(false);
  return (
    <div {...stylex.props(styles.row)}>
      <DerivationStatusDot status={item.status} />
      <KindGlyph catalog={catalog} kind={item.kind} label={item.kindLabel} size={10} />
      <div {...stylex.props(styles.rowBody)}>
        <AnchorLink to="/derivations/$id" params={{ id: item.id }} c="inherit" fw={500} size="sm" underline="hover">
          {item.statement}
        </AnchorLink>
        <Group gap={8}>
          <Text size="xs" c={reasonColor}>
            {reason}
          </Text>
          <ScopeChips scope={item.effectiveScope} labels={known.labels} />
          <UnstyledButton onClick={() => setOpen(!open)} aria-expanded={open} {...stylex.props(styles.toggle)}>
            <Text size="xs" c="dimmed">
              Details
            </Text>
            <ChevronRight
              size={12}
              color="var(--mantine-color-gray-5)"
              {...stylex.props(styles.chevron, open && styles.chevronOpen)}
            />
          </UnstyledButton>
        </Group>
        <Collapse expanded={open}>
          <div {...stylex.props(styles.details)}>
            {details.map(([label, value]) => [
              <Text key={`${label}-l`} size="xs" c="dimmed">
                {label}
              </Text>,
              <Text key={`${label}-v`} size="xs">
                {value}
              </Text>,
            ])}
          </div>
        </Collapse>
        {children}
      </div>
    </div>
  );
}

const matchedPlaceWording = (matched: string, known: KnownPlaces) =>
  matched === "global" ? "Global: applies everywhere" : `Matched at ${known.labelOf(matched)}`;

function RecallCandidateGroups({
  recall,
  hook,
  catalog,
}: {
  recall: RecallResult;
  hook: HookPayload;
  catalog: CatalogView | undefined;
}) {
  const known = useKnownPlaces();
  const injected = new Set(hook.items.map((item) => item.id));
  const limit = catalog?.hook.limit ?? 3;
  const available = [...recall.accepted, ...recall.rejected].filter((hit) => !injected.has(hit.id));
  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <GroupHeading
          title="Would inject"
          count={hook.items.length}
          hint="What the prompt hook adds before the agent reads this prompt: inject kinds only, accepted then rejected, at most the hook's limit."
        />
        {hook.items.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nothing. {hookSilenceWording(hook, catalog)}
          </Text>
        ) : (
          <div>
            {hook.items.map((item) => (
              <CandidateRow
                key={item.id}
                item={item}
                reason={
                  item.status === "rejected"
                    ? `Rejected, offered as not accepted · ${matchedPlaceWording(item.explanation.matchedPlace, known)}`
                    : matchedPlaceWording(item.explanation.matchedPlace, known)
                }
                reasonColor="taste.8"
                details={[
                  ["Policy", item.explanation.policy],
                  ["Status", item.explanation.status],
                  ["Matched place", item.explanation.matchedPlace],
                  ["Text score", item.explanation.score.toFixed(2)],
                ]}
              />
            ))}
          </div>
        )}
      </Stack>

      <Stack gap={4}>
        <GroupHeading
          title="Available through recall"
          count={available.length + recall.history.length + recall.sources.length}
          hint="What an agent gets when it asks (taste recall) but the hook doesn't send on its own."
        />
        {available.length + recall.history.length + recall.sources.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nothing else matches these words here.
          </Text>
        ) : (
          <div>
            {available.map((hit) => {
              const kind = findKindView(catalog, hit.kind);
              const reason =
                hit.status === "rejected"
                  ? "Rejected: recalled as not accepted"
                  : hit.explanation.policy === "pull"
                    ? `${capitalize(kind?.singular ?? hit.kindLabel)} policy: when an agent asks`
                    : `Eligible, below the ${limit}-item limit`;
              return (
                <CandidateRow
                  key={hit.id}
                  item={hit}
                  reason={`${reason} · ${matchedPlaceWording(hit.explanation.matchedPlace, known)}`}
                  details={[
                    ["Policy", hit.explanation.policy],
                    ["Status", hit.explanation.status],
                    ["Matched place", hit.explanation.matchedPlace],
                    ["Text score", hit.explanation.score.toFixed(2)],
                  ]}
                />
              );
            })}
            {recall.history.map((hit) => (
              <CandidateRow
                key={hit.id}
                item={hit}
                reason={`History: ${hit.status}`}
                details={[
                  ["Status", hit.explanation.status],
                  ["Matched place", hit.explanation.matchedPlace],
                  ["Text score", hit.explanation.score.toFixed(2)],
                ]}
              />
            ))}
          </div>
        )}
        {recall.sources.length > 0 && (
          <Stack gap={6} mt={6}>
            <Tooltip label="Raw quotes matching the words. Sources never carry scope, so this is store-wide." withArrow>
              <Text size="xs" c="dimmed" w="fit-content">
                Matching sources, store-wide
              </Text>
            </Tooltip>
            {recall.sources.map((hit) => (
              <SourceQuote key={hit.source.id} view={hit} role="plain" showKind />
            ))}
          </Stack>
        )}
      </Stack>

      <Stack gap={4}>
        <GroupHeading
          title="Excluded candidates"
          count={recall.excluded.length}
          hint="Close text matches that recall left out, each with the reason."
        />
        {recall.excluded.length === 0 ? (
          <Text size="sm" c="dimmed">
            No close matches were left out.
          </Text>
        ) : (
          <div>
            {recall.excluded.map((hit) => (
              <CandidateRow
                key={hit.id}
                item={hit}
                reason={exclusionReason(hit, catalog, recall.context, known)}
                reasonColor="orange.8"
                details={[
                  ["Status", hit.status],
                  ["Excluded as", hit.exclusion],
                  ["Text score", hit.score.toFixed(2)],
                ]}
              />
            ))}
          </div>
        )}
      </Stack>
    </Stack>
  );
}

const hookSilenceWording = (hook: HookPayload, catalog: CatalogView | undefined): string | undefined => {
  switch (hook.silence) {
    case "unknown-context":
      return "The context is unknown, so the hook stays silent rather than guess.";
    case "no-inject-kinds":
      return "No kind in this store has the inject policy.";
    case "over-budget":
      return `Timed out: building the payload took longer than ${catalog?.hook.budgetMs ?? 650} ms, so the hook stayed silent.`;
    case "no-matches":
      return "No accepted or rejected inject item here matches these words.";
    case undefined:
      return "";
  }
};

function InjectedPanel({ hook, stale }: { hook: HookPayload; stale: boolean }) {
  const catalog = useReviewCatalog();
  const [view, setView] = useState<"context" | "stdout">("context");
  return (
    <Paper p="sm" {...stylex.props(styles.sticky)}>
      <Group justify="space-between" mb="xs">
        <Group gap={8}>
          <Tooltip
            label="The exact bytes the prompt hook would print for this prompt, here"
            withArrow
            multiline
            w={260}
          >
            <Text size="sm" fw={600}>
              Would inject
            </Text>
          </Tooltip>
          {stale && (
            <Tooltip label="The inputs changed; run again to refresh" withArrow>
              <Badge color="yellow" variant="light" size="xs">
                Stale
              </Badge>
            </Tooltip>
          )}
        </Group>
        {hook.additionalContext !== undefined && (
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(value) => setView(value === "stdout" ? "stdout" : "context")}
            data={[
              { value: "context", label: "Context" },
              { value: "stdout", label: "Hook stdout" },
            ]}
          />
        )}
      </Group>
      {hook.additionalContext === undefined ? (
        <Alert
          color={hook.silence === "over-budget" ? "yellow" : "gray"}
          variant="light"
          {...stylex.props(stale && styles.stale)}
        >
          Silent. {hookSilenceWording(hook, catalog)} The prompt goes through untouched.
        </Alert>
      ) : (
        <Code block {...stylex.props(styles.payload, stale && styles.stale)}>
          {view === "context" ? hook.additionalContext : hook.hookOutput}
        </Code>
      )}
    </Paper>
  );
}

type RecallReachedItem = Exclude<RecallExplainItem, { outcome: "excluded" }>;

const RECALL_SECTION_WORDING: Record<RecallReachedItem["section"], (item: RecallReachedItem) => string> = {
  accepted: () => "Accepted.",
  rejected: () => "Rejected: recalled as not accepted, so agents don't propose it again.",
  history: (item) => `${capitalize(item.status)}: recalled because history is on.`,
};

/** Core's explanation in words, plus whether this prompt's recall and hook actually brought it up. */
function explanationLines(
  item: RecallExplainItem,
  catalog: CatalogView | undefined,
  context: TasteContext,
  known: KnownPlaces,
  forThisPrompt: { readonly injected: ReadonlySet<string>; readonly recalled: ReadonlySet<string> },
): ReadonlyArray<string> {
  if (item.outcome === "excluded") return [`Excluded: ${exclusionReason(item, catalog, context, known)}.`];
  const matched = item.explanation.matchedPlace;
  return [
    RECALL_SECTION_WORDING[item.section](item),
    matched === "global" ? "Global: applies everywhere." : `In scope: matched at ${known.labelOf(matched)}.`,
    item.outcome === "injected"
      ? "The hook may inject it, and recall returns it, when a prompt's words match."
      : "Recall returns it when a prompt's words match; the hook never sends it here.",
    forThisPrompt.injected.has(item.id)
      ? "For this prompt: the hook injects it."
      : forThisPrompt.recalled.has(item.id)
        ? "For this prompt: recall returns it."
        : "For this prompt: its words didn't match closely enough to be a candidate.",
  ];
}

const ID_LIKE = /^[0-9a-f-]{6,36}$/i;

function FindSpecificItem({
  request,
  recall,
  hook,
}: {
  request: Omit<RecallExplanationRequest, "lookup">;
  recall: RecallResult;
  hook: HookPayload;
}) {
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const [needle, setNeedle] = useState("");
  const [submitted, setSubmitted] = useState("");
  const explanation = useQuery({
    ...recallExplanationQuery({
      ...request,
      lookup: ID_LIKE.test(submitted) ? { ref: submitted } : { text: submitted },
    }),
    enabled: submitted !== "",
  });
  const items = explanation.data?.items ?? [];
  const forThisPrompt = {
    injected: new Set(hook.items.map((item) => item.id)),
    recalled: new Set([...recall.accepted, ...recall.rejected, ...recall.history].map((hit) => hit.id)),
  };
  return (
    <Paper p="sm">
      <Stack gap={8}>
        <Tooltip label="Explains any item, even one these words never brought up" withArrow position="top-start">
          <Text size="sm" fw={600} w="fit-content">
            Find a specific item
          </Text>
        </Tooltip>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(needle.trim());
          }}
        >
          <Group gap={6} wrap="nowrap">
            <TextInput
              size="xs"
              aria-label="An id or words from the statement"
              autoComplete="off"
              data-1p-ignore
              placeholder="An id, or words from its statement"
              value={needle}
              onChange={(event) => setNeedle(event.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button size="xs" variant="default" type="submit" loading={explanation.isFetching}>
              Explain
            </Button>
          </Group>
        </form>
        {explanation.error && (
          <Text size="xs" c="red.7">
            {explanation.error.message}
          </Text>
        )}
        {submitted !== "" && explanation.isSuccess && items.length === 0 && (
          <Text size="xs" c="dimmed">
            Nothing matches “{submitted}”.
          </Text>
        )}
        {items.map((item) => (
          <Stack key={item.id} gap={2}>
            <Group gap={8} wrap="nowrap" align="baseline">
              <DerivationStatusDot status={item.status} />
              <AnchorLink to="/derivations/$id" params={{ id: item.id }} size="sm" fw={500} c="inherit">
                {item.statement}
              </AnchorLink>
            </Group>
            {explanationLines(item, catalog, explanation.data?.context ?? recall.context, known, forThisPrompt).map(
              (line) => (
                <Text key={line} size="xs" c="dimmed" pl={16}>
                  {line}
                </Text>
              ),
            )}
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

function ContextSummary({ context }: { context: TasteContext }) {
  const known = useKnownPlaces(context.places);
  return (
    <div {...stylex.props(styles.contextBar)}>
      <LocateFixed size={14} color="var(--mantine-color-gray-6)" />
      <Text size="xs" c={context.origin === "unknown" ? "orange.8" : "dimmed"}>
        {ORIGIN_WORDING[context.origin]}
        {context.cwd !== undefined && context.origin !== "at" && ` (${context.cwd})`}
      </Text>
      {context.places.map((place) => (
        <PlaceChip key={place} place={place} label={known.labelOf(place)} />
      ))}
    </div>
  );
}

function RecallFailure({ error }: { error: Error }) {
  if (error instanceof ReviewQueryError && error.failure.tag === "PlaceResolutionFailed")
    return (
      <Alert color="red" variant="light" title="Couldn't work out where that is">
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
          {error.message}
        </Text>
        <Text size="xs" c="dimmed" mt={4}>
          Nothing was recalled. Try another directory, or pick a place instead.
        </Text>
      </Alert>
    );
  return <QueryErrorAlert error={error} />;
}

function RecallInspectorScreen() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const initialMode: ContextMode = search.dir !== undefined ? "dir" : search.at !== undefined ? "place" : "dir";
  const [query, setQuery] = useState(search.q ?? "");
  const [mode, setMode] = useState<ContextMode>(initialMode);
  const [dir, setDir] = useState(search.dir ?? "");
  const [place, setPlace] = useState(search.at ?? "");
  const submitted = {
    query: search.q ?? "",
    kind: search.kind,
    history: search.history ?? false,
    in: search.dir,
    at: search.at === undefined ? undefined : [search.at],
  };
  const inspection = useQuery(recallInspectionQuery(submitted));
  const recallKinds = (catalog?.derivedKinds ?? []).filter((kind) => kind.recall !== "never");

  const draftSearch = {
    ...(query.trim() !== "" && { q: query.trim() }),
    ...(mode === "dir" && dir.trim() !== "" && { dir: dir.trim() }),
    ...(mode === "place" && place.trim() !== "" && { at: place.trim() }),
    ...(search.kind !== undefined && { kind: search.kind }),
    ...(search.history === true && { history: true }),
  };
  const stale =
    (draftSearch.q ?? "") !== (search.q ?? "") ||
    (draftSearch.dir ?? "") !== (search.dir ?? "") ||
    (draftSearch.at ?? "") !== (search.at ?? "");
  const run = (overrides: { kind?: string | undefined; history?: boolean } = {}) => {
    const merged = { ...draftSearch, ...overrides };
    void navigate({
      search: {
        ...(merged.q !== undefined && { q: merged.q }),
        ...(merged.dir !== undefined && { dir: merged.dir }),
        ...(merged.at !== undefined && { at: merged.at }),
        ...(merged.kind !== undefined && { kind: merged.kind }),
        ...(merged.history === true && { history: true }),
      },
      replace: true,
    });
  };

  return (
    <Stack gap="md">
      <Stack gap={2}>
        <Title order={3}>Recall</Title>
        <Text size="xs" c="dimmed">
          What an agent would be told for a prompt, standing in a directory or at a place, and why each item made it or
          didn't.
        </Text>
      </Stack>
      <Paper p="sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run();
          }}
        >
          <Stack gap={8}>
            <Group gap="sm" wrap="nowrap">
              <TextInput
                aria-label="Prompt"
                placeholder="A prompt, e.g. add error handling to the checkout fetch"
                leftSection={<Search size={14} />}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                style={{ flex: 1 }}
                autoFocus
              />
              <Button type="submit" size="sm" disabled={query.trim() === ""}>
                Recall
              </Button>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <SegmentedControl
                size="xs"
                value={mode}
                onChange={(value) => setMode(value === "place" ? "place" : value === "none" ? "none" : "dir")}
                data={[
                  { value: "dir", label: "Directory" },
                  { value: "place", label: "Place" },
                  { value: "none", label: "Nowhere" },
                ]}
              />
              {mode === "dir" && (
                <TextInput
                  size="xs"
                  aria-label="Pretend I'm in this directory"
                  placeholder="Pretend I'm in… e.g. ~/code/acme-web/apps/checkout"
                  leftSection={<Folder size={13} />}
                  value={dir}
                  onChange={(event) => setDir(event.currentTarget.value)}
                  style={{ flex: 1 }}
                />
              )}
              {mode === "place" && (
                <Autocomplete
                  size="xs"
                  aria-label="Stand at this place"
                  placeholder="A place key, e.g. github.com/acme/web::apps/checkout"
                  leftSection={<Tag size={13} />}
                  data={known.places}
                  value={place}
                  onChange={setPlace}
                  style={{ flex: 1 }}
                />
              )}
              {mode === "none" && (
                <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                  Unknown context: only global items can apply, and the hook stays silent.
                </Text>
              )}
              <Select
                size="xs"
                w={170}
                aria-label="Kinds to recall"
                value={search.kind ?? "all"}
                allowDeselect={false}
                data={[
                  { value: "all", label: "Every recallable kind" },
                  ...recallKinds.map((kind) => ({ value: kind.key, label: capitalize(kind.plural) })),
                ]}
                onChange={(value) => run({ kind: value === null || value === "all" ? undefined : value })}
              />
              <Tooltip
                label={submitted.history ? "Including replaced and retracted" : "Include replaced and retracted"}
                withArrow
              >
                <ActionIcon
                  size="md"
                  variant={submitted.history ? "light" : "default"}
                  aria-label="Include history"
                  aria-pressed={submitted.history}
                  onClick={() => run({ history: !submitted.history })}
                >
                  <GitCommitVertical size={15} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {inspection.data !== undefined && <ContextSummary context={inspection.data.recall.context} />}
          </Stack>
        </form>
      </Paper>

      {submitted.query === "" ? (
        <Center py={60}>
          <Text c="dimmed">Type a prompt to see what Taste would offer for it.</Text>
        </Center>
      ) : inspection.error ? (
        <RecallFailure error={inspection.error} />
      ) : inspection.data === undefined ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : (
        <div {...stylex.props(styles.layout)}>
          <Stack gap="lg" {...stylex.props(stale && styles.stale)}>
            <RecallCandidateGroups recall={inspection.data.recall} hook={inspection.data.hook} catalog={catalog} />
            <FindSpecificItem
              request={{ kind: submitted.kind, history: submitted.history, in: submitted.in, at: submitted.at }}
              recall={inspection.data.recall}
              hook={inspection.data.hook}
            />
          </Stack>
          <InjectedPanel hook={inspection.data.hook} stale={stale || inspection.isFetching} />
        </div>
      )}
    </Stack>
  );
}
