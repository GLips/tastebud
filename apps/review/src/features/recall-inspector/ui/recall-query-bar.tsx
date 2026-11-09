/**
 * Recall's one control, always editable: a prompt (or an item's id), where the agent stands, and which
 * kinds. Typed words run on Enter; picking a place, a kind or an option runs at once. Standing nowhere,
 * in a folder, and including history sit in the menu beside the place.
 */
import { ActionIcon, Box, Button, Group, Menu, Paper, Select, TextInput } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { Check, Ellipsis, Folder, History, MapPinOff, Search, Tag } from "lucide-react";
import { useState } from "react";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { PlaceSelect } from "#review/shared/ui/place-select.tsx";

const styles = stylex.create({
  grow: { flex: 1, minWidth: 0 },
  place: { flexShrink: 0, maxWidth: "280px" },
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

const STAND_AT_A_PLACE = { in: undefined, nowhere: undefined } as const;

export function RecallQueryBar({ check, onRun }: { check: RecallCheck; onRun: (next: RecallCheck) => void }) {
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const [query, setQuery] = useState(check.q ?? "");
  const [inFolder, setInFolder] = useState(check.in !== undefined);
  const [directory, setDirectory] = useState(check.in ?? "");
  const recallKinds = (catalog?.derivedKinds ?? []).filter((candidate) => candidate.recall !== "never");
  const run = (patch: RecallCheckPatch) => onRun(recallCheckOf({ ...check, q: query.trim(), ...patch }));

  return (
    <Paper p="sm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(inFolder ? { in: directory.trim(), at: undefined, nowhere: undefined } : {});
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
          {inFolder ? (
            <TextInput
              size="xs"
              aria-label="The folder the agent works in"
              placeholder="A folder, e.g. ~/code/acme-web/apps/checkout"
              leftSection={<Folder size={13} />}
              value={directory}
              onChange={(event) => setDirectory(event.currentTarget.value)}
              w={280}
            />
          ) : (
            <Box {...stylex.props(styles.place)}>
              <PlaceSelect
                value={check.in === undefined ? check.at : undefined}
                known={known}
                onChange={(place) => run({ ...STAND_AT_A_PLACE, at: place })}
                placeholder="Nowhere in particular"
                aria-label="Stand at this place"
              />
            </Box>
          )}
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="default" size="input-xs" aria-label="Other ways to stand, and history">
                <Ellipsis size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {inFolder ? (
                <Menu.Item
                  leftSection={<Tag size={13} />}
                  onClick={() => {
                    setInFolder(false);
                    if (check.in !== undefined) run({ in: undefined });
                  }}
                >
                  Stand at a place
                </Menu.Item>
              ) : (
                <Menu.Item leftSection={<Folder size={13} />} onClick={() => setInFolder(true)}>
                  Stand in a folder…
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<MapPinOff size={13} />}
                onClick={() => {
                  setInFolder(false);
                  run({ in: undefined, at: undefined, nowhere: true });
                }}
              >
                Stand nowhere in particular
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                leftSection={check.history === true ? <Check size={13} /> : <History size={13} />}
                onClick={() => run({ history: check.history !== true })}
              >
                Include replaced and retracted
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Select
            size="xs"
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
          <Button type="submit">Check</Button>
        </Group>
      </form>
    </Paper>
  );
}
