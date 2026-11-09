/**
 * Recall's one control, always editable: a prompt (or an item's id), where the agent stands, and which
 * kinds. Typed words run on Enter; picking a place, a kind or history runs at once. The place select
 * also offers Nowhere in particular, and a folder typed into it is resolved the way an agent's is.
 */
import { Box, Button, Checkbox, Group, Paper, Select, TextInput } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { MapPinOff, Search } from "lucide-react";
import { useState } from "react";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { placeFormOf } from "#review/shared/ui/place-chips.tsx";
import { PlaceSelect } from "#review/shared/ui/place-select.tsx";

const styles = stylex.create({
  grow: { flex: 1, minWidth: 0 },
  // PlaceSelect sizes to its label; a long folder path is clipped here rather than pushing the bar apart.
  place: { flexShrink: 0, maxWidth: "280px", overflow: "hidden", borderRadius: "var(--mantine-radius-sm)" },
  fixed: { flexShrink: 0 },
});

/** Where Recall stands comes from the first of `in`, `at` and `nowhere` that is set. */
export interface RecallCheck {
  readonly q?: string;
  readonly in?: string;
  readonly at?: string;
  readonly nowhere?: boolean;
  readonly kind?: string;
  readonly history?: boolean;
}

type RecallCheckPatch = { readonly [K in keyof RecallCheck]?: RecallCheck[K] | undefined };

/** The check as URL search, keeping only what is set. */
const recallCheckOf = (draft: RecallCheckPatch): RecallCheck => ({
  ...(draft.q !== undefined && draft.q !== "" && { q: draft.q }),
  ...(draft.in !== undefined && draft.in !== "" && { in: draft.in }),
  ...(draft.at !== undefined && { at: draft.at }),
  ...(draft.nowhere === true && { nowhere: true }),
  ...(draft.kind !== undefined && { kind: draft.kind }),
  ...(draft.history === true && { history: true }),
});

export function RecallQueryBar({ check, onRun }: { check: RecallCheck; onRun: (next: RecallCheck) => void }) {
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const [query, setQuery] = useState(check.q ?? "");
  const recallKinds = (catalog?.derivedKinds ?? []).filter((candidate) => candidate.recall !== "never");
  const run = (patch: RecallCheckPatch) => onRun(recallCheckOf({ ...check, q: query.trim(), ...patch }));
  // A typed folder stands `in` it, so Recall resolves it to its repo the way it would for an agent.
  const standAt = (place: string) =>
    run(
      placeFormOf(place) === "directory"
        ? { in: place, at: undefined, nowhere: undefined }
        : { at: place, in: undefined, nowhere: undefined },
    );
  const nowhere = check.in === undefined && check.at === undefined;

  return (
    <Paper p="sm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run({});
        }}
      >
        <Group gap="xs" wrap="nowrap">
          <TextInput
            aria-label="Prompt, or an item's id"
            placeholder="A prompt, e.g. add error handling to the checkout fetch, or an item's id"
            leftSection={<Search size={14} />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            {...stylex.props(styles.grow)}
            autoFocus
          />
          <Box {...stylex.props(styles.place)}>
            <PlaceSelect
              value={check.in ?? check.at}
              known={known}
              onChange={standAt}
              extraOptions={[
                {
                  id: "nowhere",
                  label: "Nowhere in particular",
                  icon: <MapPinOff size={13} />,
                  selected: nowhere,
                  onSelect: () => run({ in: undefined, at: undefined, nowhere: true }),
                },
              ]}
              aria-label="Stand at this place, or type a folder"
            />
          </Box>
          <Select
            w={130}
            aria-label="Kinds to check"
            value={check.kind ?? "all"}
            allowDeselect={false}
            data={[
              { value: "all", label: "All kinds" },
              ...recallKinds.map((candidate) => ({ value: candidate.key, label: capitalize(candidate.plural) })),
            ]}
            onChange={(value) => run({ kind: value === null || value === "all" ? undefined : value })}
          />
          <Checkbox
            label="With history"
            title="Include replaced and retracted items"
            checked={check.history === true}
            onChange={() => run({ history: check.history !== true })}
            {...stylex.props(styles.fixed)}
          />
          <Button type="submit">Check</Button>
        </Group>
      </form>
    </Paper>
  );
}
